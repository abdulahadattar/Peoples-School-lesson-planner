/**
 * Job intake & lifecycle: batch job creation, per-file enqueueing, job
 * finalization, chunk uploads, ZIP/archive ingestion and Retry/Stop.
 *
 * Split from jobProcessor.ts (350-LOC rule): jobProcessor hosts the AI-heavy
 * execution (processSingleDocument + runBackgroundQueue); this module owns
 * what puts work INTO it. Dependencies flow one way — jobIntake → jobProcessor.
 *
 * FIX-1a invariant reminder: job.totalFiles is a count of enqueued queue
 * items (owned by queue.ts enqueueFileForJob + the finalize recompute), never
 * the client's declared upload intent.
 */
import crypto from 'crypto';
import path from 'path';
import AdmZip from 'adm-zip';
import type { BatchProcessingJob } from '../../types/documentArchive';
import {
  jobsStore,
  saveStores,
} from './store.js';
import { extractGrFromPath } from './nameMatching.js';
import { getOrCreateChunkSession, removeChunkSession } from './chunkSessions.js';
import { enqueueFileForJob, countQueuedForJob, processingQueue, type EnqueueFileMeta } from './queue.js';
import { computeJobTotals, isJobComplete, terminalStatusForJob } from './queueMath.js';
import { runBackgroundQueue, drainProcessingQueue } from './jobProcessor.js';
import { ensureJobLoaded } from './firestoreStore.js';

export interface JobAdvanceOptions {
  awaitCompletion?: boolean;
}

export function createBatchJob(
  expectedFilesCount: number = 0,
  opts?: { sourceType?: 'upload' | 'zip' | 'drive'; driveFolderId?: string }
): BatchProcessingJob {
  const jobId = crypto.randomUUID().slice(0, 8);
  const job: BatchProcessingJob = {
    id: jobId,
    sourceType: opts?.sourceType || 'upload',
    driveFolderId: opts?.driveFolderId,
    totalFiles: expectedFilesCount,
    processedFiles: 0,
    remainingFiles: expectedFilesCount,
    flaggedCount: 0,
    duplicateCount: 0,
    skippedCount: 0,
    failedCount: 0,
    successCount: 0,
    unclassifiedCount: 0,
    status: 'uploading',
    currentStage: opts?.sourceType === 'drive' ? 'DRIVE_SYNC' : 'UPLOAD',
    currentStageDescription:
      opts?.sourceType === 'drive'
        ? `Syncing ${expectedFilesCount} file(s) from Google Drive...`
        : `Receiving ${expectedFilesCount} documents...`,
    logs: [],
    files: [],
    startedAt: new Date().toISOString(),
  };
  jobsStore[jobId] = job;
  saveStores();
  return job;
}

export async function addSingleFileToJob(
  jobId: string,
  filename: string,
  buffer: Buffer,
  grNo?: string,
  meta?: EnqueueFileMeta
): Promise<{ enqueued: number; job: BatchProcessingJob }> {
  await ensureJobLoaded(jobId);
  let job = jobsStore[jobId];
  if (!job) {
    job = createBatchJob(0);
    job.currentStageDescription = 'Receiving documents...';
    jobsStore[jobId] = job;
  }
  const enqueued = await enqueueFileForJob(job, filename, buffer, grNo, meta);
  saveStores();
  return { enqueued, job };
}

export async function finalizeBatchJob(
  jobId: string,
  serverKeys: string[],
  opts?: JobAdvanceOptions
): Promise<BatchProcessingJob> {
  await ensureJobLoaded(jobId);
  const job = jobsStore[jobId];
  if (job) {
    const queuedCount = countQueuedForJob(jobId);
    const totals = computeJobTotals(job.processedFiles || 0, queuedCount);
    job.totalFiles = totals.totalFiles;
    job.remainingFiles = totals.remainingFiles;
    if (isJobComplete(job, queuedCount)) {
      if ((job.processedFiles || 0) > 0) {
        job.status = terminalStatusForJob(job);
        job.currentStage = 'COMPLETE';
        job.completedAt = new Date().toISOString();
      } else {
        job.status = 'failed';
        job.currentStage = 'ERROR';
        job.currentStageDescription = 'No documents were received for this job';
      }
      saveStores();
      return job;
    }
    job.status = 'processing';
    job.currentStage = 'AI_VISION';
    saveStores();
    if (opts?.awaitCompletion) {
      await drainProcessingQueue(serverKeys);
      return jobsStore[jobId] || job;
    }
  }
  runBackgroundQueue(serverKeys).catch(console.error);
  return job || createBatchJob(0);
}

export async function handleChunkUpload(
  uploadId: string,
  chunkIndex: number,
  totalChunks: number,
  chunkBase64: string,
  filename: string,
  grNo?: string,
  isZip?: boolean,
  serverKeys: string[] = [],
  existingJobId?: string,
  opts?: JobAdvanceOptions,
  meta?: EnqueueFileMeta
): Promise<{ completed: boolean; job?: BatchProcessingJob }> {
  const session = getOrCreateChunkSession(uploadId, totalChunks, filename, grNo, isZip, existingJobId, meta);
  session.chunks[chunkIndex] = Buffer.from(chunkBase64, 'base64');
  if (Object.keys(session.chunks).length >= totalChunks) {
    const sortedBuffers: Buffer[] = [];
    for (let i = 0; i < totalChunks; i++) sortedBuffers.push(session.chunks[i] || Buffer.alloc(0));
    const fullBuffer = Buffer.concat(sortedBuffers);
    removeChunkSession(uploadId);
    if (session.isZip || filename.toLowerCase().endsWith('.zip')) {
      const job = await ingestUploadedArchive(fullBuffer, filename, serverKeys, opts);
      return { completed: true, job };
    }
    const enqueueMeta: EnqueueFileMeta = {
      folderName: session.folderName,
      packetId: session.packetId,
      preClassifiedAs: session.preClassifiedAs,
      aiSkipped: session.aiSkipped,
    };
    if (existingJobId) {
      await ensureJobLoaded(existingJobId);
    }
    if (existingJobId && jobsStore[existingJobId]) {
      const job = jobsStore[existingJobId];
      await enqueueFileForJob(job, filename, fullBuffer, session.grNo, enqueueMeta);
      saveStores();
      return { completed: true, job };
    }
    const job = await ingestIndividualFiles([{ filename, buffer: fullBuffer, grNo: session.grNo, meta: enqueueMeta }], serverKeys, opts);
    return { completed: true, job };
  }
  return { completed: false };
}

export async function ingestUploadedArchive(
  archiveBuffer: Buffer,
  originalFilename: string,
  serverKeys: string[],
  opts?: JobAdvanceOptions
): Promise<BatchProcessingJob> {
  const jobId = crypto.randomUUID().slice(0, 8);
  const zip = new AdmZip(archiveBuffer);
  const validEntries = zip.getEntries().filter((e) => !e.isDirectory && !e.entryName.includes('__MACOSX') && /\.(jpe?g|png|webp|pdf)$/i.test(e.entryName));
  const job = createBatchJob(0, { sourceType: 'zip' });
  job.id = jobId;
  jobsStore[jobId] = job;
  for (const entry of validEntries) {
    const entryGr = extractGrFromPath(entry.entryName);
    const parentSeg = path.dirname(entry.entryName).split(/[/\\]/).filter(Boolean).pop();
    const packetKey = parentSeg || (entryGr !== 'UNASSIGNED' ? `GR_${entryGr}` : 'root');
    await enqueueFileForJob(job, path.basename(entry.entryName), entry.getData(), entryGr, {
      fromZipEntry: true,
      folderName: parentSeg && parentSeg !== '.' ? parentSeg : undefined,
      packetId: `${jobId}_${packetKey}`,
      parsedFolderGrNo: entryGr,
    });
  }
  await startOrTerminateEmptyJob(job, serverKeys, `No supported document entries found in ${originalFilename}`, opts);
  return job;
}

export async function ingestIndividualFiles(
  files: Array<{ filename: string; buffer: Buffer; grNo?: string; meta?: EnqueueFileMeta }>,
  serverKeys: string[],
  opts?: JobAdvanceOptions
): Promise<BatchProcessingJob> {
  const job = createBatchJob(0);
  job.currentStageDescription = `Receiving ${files.length} documents...`;
  for (const f of files) {
    await enqueueFileForJob(job, f.filename, f.buffer, f.grNo, f.meta);
  }
  await startOrTerminateEmptyJob(job, serverKeys, 'No documents were received for this job', opts);
  return job;
}

/**
 * Flip a fully-enqueued job into the running state, or terminate it honestly
 * when nothing actually reached the queue (prevents status:'processing' jobs
 * whose completion condition can never fire).
 */
async function startOrTerminateEmptyJob(
  job: BatchProcessingJob,
  serverKeys: string[],
  nothingQueuedDescription: string,
  opts?: JobAdvanceOptions
): Promise<void> {
  if (countQueuedForJob(job.id) === 0) {
    job.status = 'failed';
    job.currentStage = 'ERROR';
    job.currentStageDescription = nothingQueuedDescription;
    saveStores();
    return;
  }
  job.status = 'processing';
  saveStores();
  if (opts?.awaitCompletion) {
    await drainProcessingQueue(serverKeys);
    return;
  }
  runBackgroundQueue(serverKeys).catch(console.error);
}

export async function retryFailedDocumentsInJob(
  jobId: string,
  serverKeys: string[],
  opts?: JobAdvanceOptions
): Promise<BatchProcessingJob | null> {
  await ensureJobLoaded(jobId);
  const job = jobsStore[jobId];
  if (!job) return null;
  // Failed page buffers are not retained in memory, so "retry" cannot
  // re-enqueue them; flipping to 'processing' with an empty queue would
  // leave the job stuck forever. Report honest terminal state instead.
  const queued = countQueuedForJob(jobId);
  if (queued === 0) {
    job.status = (job.failedCount || 0) > 0 ? 'failed' : (job.successCount || 0) > 0 ? 'completed' : 'failed';
    job.currentStage = job.status === 'completed' ? 'COMPLETE' : 'ERROR';
    if ((job.failedCount || 0) > 0) {
      job.currentStageDescription = `${job.failedCount} file(s) could not be read; re-upload or re-check individual documents`;
    }
    saveStores();
    return job;
  }
  job.status = 'processing';
  saveStores();
  if (opts?.awaitCompletion) {
    // Serverless: run the re-queued items to completion before responding.
    await drainProcessingQueue(serverKeys);
    return jobsStore[jobId] || job;
  }
  runBackgroundQueue(serverKeys).catch(console.error);
  return job;
}

export function stopProcessingJob(jobId: string): boolean {
  const job = jobsStore[jobId];
  if (!job) return false;
  for (let i = processingQueue.length - 1; i >= 0; i--) {
    if (processingQueue[i].jobId === jobId) processingQueue.splice(i, 1);
  }
  job.status = 'failed';
  job.currentStage = 'CANCELLED';
  saveStores();
  return true;
}

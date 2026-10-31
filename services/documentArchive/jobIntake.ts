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
import { enqueueFileForJob, countQueuedForJob, processingQueue } from './queue.js';
import { computeJobTotals, isJobComplete, terminalStatusForJob } from './queueMath.js';
import { runBackgroundQueue, drainProcessingQueue } from './jobProcessor.js';
// C6: Firestore mode/guards — no-ops in local disk modes.
import { ensureJobLoaded } from './firestoreStore.js';

/**
 * FIX-C5: serverless semantics. On Vercel the Lambda freezes after the
 * response, so callers that must advance a job (finalize, chunk completion,
 * archive ingest, retry) pass `{ awaitCompletion: true }` — the queue then
 * runs to completion inside the request, and the `sync` persistence mode
 * leaves everything on disk. The live server (documentUploadRouter) never
 * sets it and keeps the fire-and-forget behavior.
 */
export interface JobAdvanceOptions {
  awaitCompletion?: boolean;
}

export function createBatchJob(expectedFilesCount: number = 0): BatchProcessingJob {
  const jobId = crypto.randomUUID().slice(0, 8);
  const job: BatchProcessingJob = {
    id: jobId, totalFiles: expectedFilesCount, processedFiles: 0, remainingFiles: expectedFilesCount,
    flaggedCount: 0, duplicateCount: 0, failedCount: 0, successCount: 0, unclassifiedCount: 0,
    status: 'uploading', currentStage: 'UPLOAD', currentStageDescription: `Receiving ${expectedFilesCount} documents...`,
    logs: [], files: [], startedAt: new Date().toISOString(),
  };
  jobsStore[jobId] = job;
  saveStores();
  return job;
}

export async function addSingleFileToJob(
  jobId: string,
  filename: string,
  buffer: Buffer,
  grNo?: string
): Promise<{ enqueued: number; job: BatchProcessingJob }> {
  // C6: the job shell may live on another Lambda instance (created-job there,
  // upload arriving here) — pull it out of the shared store first.
  await ensureJobLoaded(jobId);
  let job = jobsStore[jobId];
  if (!job) {
    // No job shell exists for this upload (caller never hit /create-job):
    // create one with expectation 0 — enqueueFileForJob owns totalFiles
    // (FIX-1a), so client intent must not seed it or totals double-count.
    job = createBatchJob(0);
    job.currentStageDescription = 'Receiving documents...';
    jobsStore[jobId] = job;
  }
  // FIX-1a: totals are owned by queue.ts — every pushed queue item adds 1,
  // PDFs split into their pages, ZIPs (per-file path only) into their entries.
  const enqueued = await enqueueFileForJob(job, filename, buffer, grNo);
  saveStores();
  return { enqueued, job };
}

export async function finalizeBatchJob(
  jobId: string,
  serverKeys: string[],
  opts?: JobAdvanceOptions
): Promise<BatchProcessingJob> {
  // C6: lazy per-key hydration — finalize must see the shared job even when
  // create-job ran on a different instance (the multi-instance failure mode).
  await ensureJobLoaded(jobId);
  const job = jobsStore[jobId];
  if (job) {
    // FIX-1a: exactly once, before the queue drains for this job, recompute
    // totals from what really exists — items already processed plus items
    // waiting in the queue. The client's expectedCount is display-only
    // context and never contributes to the completion math.
    const queuedCount = countQueuedForJob(jobId);
    const totals = computeJobTotals(job.processedFiles || 0, queuedCount);
    job.totalFiles = totals.totalFiles;
    job.remainingFiles = totals.remainingFiles;
    if (isJobComplete(job, queuedCount)) {
      if ((job.processedFiles || 0) > 0) {
        // Every enqueued item already ran to completion before the client
        // finalized (double finalize or a race) — report the true terminal
        // state instead of leaving the job 'processing' forever.
        job.status = terminalStatusForJob(job);
        job.currentStage = 'COMPLETE';
        job.completedAt = new Date().toISOString();
      } else {
        // Nothing was queued and nothing processed (e.g. the chunked-ZIP
        // detour routed the payload into its own self-contained job, or every
        // upload failed client-side). An honest failed shell beats a job the
        // completion check can never reach.
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
      // Run the queue to completion now and return the terminal job — the
      // response is the last chance the pipeline has on a Lambda.
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
  opts?: JobAdvanceOptions
): Promise<{ completed: boolean; job?: BatchProcessingJob }> {
  const session = getOrCreateChunkSession(uploadId, totalChunks, filename, grNo, isZip, existingJobId);
  session.chunks[chunkIndex] = Buffer.from(chunkBase64, 'base64');
  if (Object.keys(session.chunks).length >= totalChunks) {
    const sortedBuffers: Buffer[] = [];
    for (let i = 0; i < totalChunks; i++) sortedBuffers.push(session.chunks[i] || Buffer.alloc(0));
    const fullBuffer = Buffer.concat(sortedBuffers);
    removeChunkSession(uploadId);
    if (session.isZip || filename.toLowerCase().endsWith('.zip')) {
      // ZIP handling stays as-is on purpose: a ZIP unpacks into its own
      // self-contained job (it can hold many students' documents, each with
      // its own GR extracted from entry paths), so it does not join the
      // caller's per-file batch job.
      const job = await ingestUploadedArchive(fullBuffer, filename, serverKeys, opts);
      return { completed: true, job };
    }
    // FIX-1b: a >2.5MB file inside a multi-file batch used to detach into a
    // NEW job here — the caller's job never contained it. Enqueue the
    // assembled file into the caller's job instead. If the job shell is gone
    // (e.g. the client created it before a restart), fall back to a
    // standalone job so the payload still processes.
    if (existingJobId) {
      // C6: the shell may have been created on another instance.
      await ensureJobLoaded(existingJobId);
    }
    if (existingJobId && jobsStore[existingJobId]) {
      const job = jobsStore[existingJobId];
      await enqueueFileForJob(job, filename, fullBuffer, session.grNo);
      saveStores();
      return { completed: true, job };
    }
    const job = await ingestIndividualFiles([{ filename, buffer: fullBuffer, grNo: session.grNo }], serverKeys, opts);
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
  const job = createBatchJob(0);
  job.id = jobId;
  jobsStore[jobId] = job;
  // FIX-1c: PDF entries are split into per-page items by enqueueFileForJob —
  // they are never pushed here as raw buffers with an image/jpeg mime.
  for (const entry of validEntries) {
    await enqueueFileForJob(job, path.basename(entry.entryName), entry.getData(), extractGrFromPath(entry.entryName));
  }
  await startOrTerminateEmptyJob(job, serverKeys, `No supported document entries found in ${originalFilename}`, opts);
  return job;
}

export async function ingestIndividualFiles(
  files: Array<{ filename: string; buffer: Buffer; grNo?: string }>,
  serverKeys: string[],
  opts?: JobAdvanceOptions
): Promise<BatchProcessingJob> {
  const job = createBatchJob(0);
  job.currentStageDescription = `Receiving ${files.length} documents...`;
  for (const f of files) {
    await enqueueFileForJob(job, f.filename, f.buffer, f.grNo);
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
      job.currentStageDescription = `${job.failedCount} file(s) failed; re-upload or Rescan individual documents`;
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

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import AdmZip from 'adm-zip';
import {
  StudentDocumentRecord,
  BatchProcessingJob,
  DocumentClassificationType,
} from '../../types/documentArchive';
import { DATA_DIR } from './constants.js';
import {
  jobsStore,
  documentsStore,
  saveStores,
  addJobLog,
  updateJobFileItem,
} from './store.js';
import { extractGrFromPath, toEnglishTitleCase, normalizeNadraNumber, validateNadraNumber } from './nameMatching.js';
import { optimizeAndPrepareImage } from './imageProcessing.js';
import { callGeminiVision, EXTRACTION_SCHEMA } from './aiVision.js';
import { updateStudentDossier } from './discrepancies.js';
import { getOrCreateChunkSession, removeChunkSession } from './chunkSessions.js';

export interface QueueItem {
  id: string;
  jobId: string;
  grNo: string;
  originalFilename: string;
  sourceBuffer: Buffer;
  mimeType: string;
  bundleId?: string;
  sourceFilename?: string;
  pageNumber?: number;
  totalPages?: number;
}

export const processingQueue: QueueItem[] = [];
let isQueueRunning = false;

export async function processSingleDocument(
  item: QueueItem,
  serverKeys: string[]
): Promise<StudentDocumentRecord | null> {
  const fileStart = Date.now();
  const jobId = item.jobId;
  updateJobFileItem(jobId, item.originalFilename, item.grNo, { stage: 'optimizing', status: 'in_progress', progressPercent: 20, fileSizeBytes: item.sourceBuffer.length });

  try {
    const fileHash = crypto.createHash('sha256').update(item.sourceBuffer).digest('hex');
    const existingDoc = Object.values(documentsStore).find((d) => d.fileHash === fileHash && d.grNo === item.grNo);
    if (existingDoc) {
      if (jobsStore[jobId]) jobsStore[jobId].duplicateCount = (jobsStore[jobId].duplicateCount || 0) + 1;
      updateJobFileItem(jobId, item.originalFilename, item.grNo, { stage: 'duplicate', status: 'duplicate', progressPercent: 100, classification: existingDoc.classification });
      return existingDoc;
    }

    let optimized = await optimizeAndPrepareImage(item.sourceBuffer, false, 0);
    const isSmallIcon = optimized.width < 350 || optimized.height < 350 || optimized.width * optimized.height < 140000;
    if (isSmallIcon) {
      updateJobFileItem(jobId, item.originalFilename, item.grNo, { stage: 'completed', status: 'success', progressPercent: 100, classification: 'IGNORED_NOISE' });
      return null;
    }

    updateJobFileItem(jobId, item.originalFilename, item.grNo, { stage: 'ai_vision', status: 'in_progress', progressPercent: 50 });
    const prompt = 'Analyze this educational document scan. Classify document and extract student/father details.';
    let aiResult: any = { classification: 'OTHER_UNCLASSIFIED', confidence: 0.5, suggestedRotation: 0 };
    let modelUsed = 'none';

    if (serverKeys.length > 0) {
      try {
        const aiResponse = await callGeminiVision(optimized.buffer, prompt, EXTRACTION_SCHEMA, serverKeys, jobId, item.originalFilename, item.grNo);
        aiResult = aiResponse.result;
        modelUsed = aiResponse.modelUsed;
      } catch (err: any) {
        addJobLog(jobId, 'warn', 'AI_VISION', `AI extraction error: ${err.message}`, { filename: item.originalFilename, grNo: item.grNo });
      }
    }

    const classification: DocumentClassificationType = aiResult.classification || 'OTHER_UNCLASSIFIED';
    if (classification === 'IGNORED_NOISE') {
      updateJobFileItem(jobId, item.originalFilename, item.grNo, { stage: 'completed', status: 'success', progressPercent: 100, classification: 'IGNORED_NOISE' });
      return null;
    }

    const isPhoto = classification === 'STUDENT_PHOTO';
    const suggestedRot = (aiResult.suggestedRotation || 0) as 0 | 90 | 180 | 270;
    if (suggestedRot !== 0 || isPhoto) {
      optimized = await optimizeAndPrepareImage(item.sourceBuffer, isPhoto, suggestedRot);
    }

    let currentGr = item.grNo;
    const grFolder = path.join(DATA_DIR, `GR_${currentGr}`);
    if (!fs.existsSync(grFolder)) {
      const fsMod = await import('fs');
      fsMod.mkdirSync(grFolder, { recursive: true });
    }

    const safeBaseName = path.basename(item.originalFilename, path.extname(item.originalFilename)).replace(/[^a-zA-Z0-9_-]/g, '_');
    const finalFilename = `${classification}_${safeBaseName}.jpg`;
    const finalFilePath = path.join(grFolder, finalFilename);
    const fsModule = await import('fs');
    fsModule.writeFileSync(finalFilePath, optimized.buffer);

    const docRecord: StudentDocumentRecord = {
      id: crypto.randomUUID(),
      jobId: item.jobId,
      grNo: currentGr,
      bundleId: item.bundleId,
      sourceFilename: item.sourceFilename,
      pageNumber: item.pageNumber,
      originalFilename: item.originalFilename,
      filename: finalFilename,
      url: `/api/documents/file/${currentGr}/${encodeURIComponent(finalFilename)}`,
      fileHash,
      fileSizeBytes: optimized.buffer.length,
      width: optimized.width,
      height: optimized.height,
      rotationApplied: suggestedRot,
      isBlackAndWhite: optimized.isBw,
      classification,
      classificationConfidence: aiResult.confidence || 0.8,
      extractedData: {
        grNo: currentGr !== 'UNASSIGNED' ? currentGr : aiResult.grNo,
        studentName: aiResult.studentNameEnglish ? toEnglishTitleCase(aiResult.studentNameEnglish) : undefined,
        fatherName: aiResult.fatherNameEnglish ? toEnglishTitleCase(aiResult.fatherNameEnglish) : undefined,
        bFormNo: normalizeNadraNumber(aiResult.bFormNo),
        bFormValidation: validateNadraNumber(aiResult.bFormNo),
        fatherCnic: normalizeNadraNumber(aiResult.fatherCnic),
        dob: aiResult.dob,
        gender: aiResult.gender === 'Female' ? 'Female' : 'Male',
        classAdmitted: aiResult.classAdmitted,
      },
      discrepancies: [],
      status: 'verified',
      processedAt: new Date().toISOString(),
    };

    documentsStore[docRecord.id] = docRecord;
    if (currentGr !== 'UNASSIGNED') updateStudentDossier(currentGr, docRecord);

    const totalTimeMs = Date.now() - fileStart;
    updateJobFileItem(jobId, item.originalFilename, currentGr, {
      savedFilename: finalFilename, stage: 'completed', status: 'success', progressPercent: 100,
      classification, classificationConfidence: docRecord.classificationConfidence, url: docRecord.url,
      aiModelUsed: modelUsed, processedAt: docRecord.processedAt, executionTimeMs: totalTimeMs,
    });

    saveStores();
    (docRecord as any)._aiExhausted = modelUsed === 'none';
    return docRecord;
  } catch (error: any) {
    updateJobFileItem(jobId, item.originalFilename, item.grNo, { stage: 'failed', status: 'failed', progressPercent: 100, error: error.message });
    if (jobsStore[jobId]) jobsStore[jobId].failedCount = (jobsStore[jobId].failedCount || 0) + 1;
    return null;
  }
}

export async function runBackgroundQueue(serverKeys: string[]) {
  if (isQueueRunning) return;
  isQueueRunning = true;
  try {
    while (processingQueue.length > 0) {
      const item = processingQueue.shift();
      if (!item) break;
      const job = jobsStore[item.jobId];
      if (job) {
        job.status = 'processing';
        job.currentFile = item.originalFilename;
        job.currentStage = 'AI_VISION';
      }
      try {
        const doc = await processSingleDocument(item, serverKeys);
        if (doc && job) job.successCount = (job.successCount || 0) + 1;
      } catch {
        if (job) job.failedCount = (job.failedCount || 0) + 1;
      }
      if (job) {
        job.processedFiles = (job.processedFiles || 0) + 1;
        job.remainingFiles = Math.max(0, job.totalFiles - job.processedFiles);
        if (job.remainingFiles === 0 && processingQueue.filter((q) => q.jobId === job.id).length === 0) {
          job.status = (job.failedCount || 0) > 0 && (job.successCount || 0) === 0 ? 'failed' : 'completed';
          job.currentStage = 'COMPLETE';
          job.completedAt = new Date().toISOString();
        }
        saveStores();
      }
    }
  } finally {
    isQueueRunning = false;
  }
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
  let job = jobsStore[jobId];
  if (!job) {
    job = createBatchJob(1);
    jobsStore[jobId] = job;
  }
  const resolvedGr = grNo || extractGrFromPath(filename);
  updateJobFileItem(jobId, filename, resolvedGr, { fileSizeBytes: buffer.length, stage: 'queued', status: 'pending', progressPercent: 0 });
  processingQueue.push({
    id: crypto.randomUUID().slice(0, 8), jobId, grNo: resolvedGr, originalFilename: filename,
    sourceBuffer: buffer, mimeType: 'image/jpeg',
  });
  job.totalFiles = (job.totalFiles || 0) + 1;
  job.remainingFiles = Math.max(0, job.totalFiles - (job.processedFiles || 0));
  saveStores();
  return { enqueued: 1, job };
}

export function finalizeBatchJob(jobId: string, serverKeys: string[]): BatchProcessingJob {
  const job = jobsStore[jobId];
  if (job) {
    job.status = 'processing';
    job.currentStage = 'AI_VISION';
    saveStores();
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
  serverKeys: string[] = []
): Promise<{ completed: boolean; job?: BatchProcessingJob }> {
  const session = getOrCreateChunkSession(uploadId, totalChunks, filename, grNo, isZip);
  session.chunks[chunkIndex] = Buffer.from(chunkBase64, 'base64');
  if (Object.keys(session.chunks).length >= totalChunks) {
    const sortedBuffers: Buffer[] = [];
    for (let i = 0; i < totalChunks; i++) sortedBuffers.push(session.chunks[i] || Buffer.alloc(0));
    const fullBuffer = Buffer.concat(sortedBuffers);
    removeChunkSession(uploadId);
    if (session.isZip || filename.toLowerCase().endsWith('.zip')) {
      const job = await ingestUploadedArchive(fullBuffer, filename, serverKeys);
      return { completed: true, job };
    } else {
      const job = await ingestIndividualFiles([{ filename, buffer: fullBuffer, grNo: session.grNo }], serverKeys);
      return { completed: true, job };
    }
  }
  return { completed: false };
}

export async function ingestUploadedArchive(archiveBuffer: Buffer, originalFilename: string, serverKeys: string[]): Promise<BatchProcessingJob> {
  const jobId = crypto.randomUUID().slice(0, 8);
  const zip = new AdmZip(archiveBuffer);
  const validEntries = zip.getEntries().filter((e) => !e.isDirectory && !e.entryName.includes('__MACOSX') && /\.(jpe?g|png|webp|pdf)$/i.test(e.entryName));
  const job = createBatchJob(validEntries.length);
  job.id = jobId;
  jobsStore[jobId] = job;
  for (const entry of validEntries) {
    processingQueue.push({
      id: crypto.randomUUID().slice(0, 8), jobId, grNo: extractGrFromPath(entry.entryName),
      originalFilename: path.basename(entry.entryName), sourceBuffer: entry.getData(), mimeType: 'image/jpeg',
    });
  }
  job.status = 'processing';
  saveStores();
  runBackgroundQueue(serverKeys).catch(console.error);
  return job;
}

export async function ingestIndividualFiles(files: Array<{ filename: string; buffer: Buffer; grNo?: string }>, serverKeys: string[]): Promise<BatchProcessingJob> {
  const job = createBatchJob(files.length);
  for (const f of files) {
    processingQueue.push({
      id: crypto.randomUUID().slice(0, 8), jobId: job.id, grNo: f.grNo || extractGrFromPath(f.filename),
      originalFilename: f.filename, sourceBuffer: f.buffer, mimeType: 'image/jpeg',
    });
  }
  job.status = 'processing';
  saveStores();
  runBackgroundQueue(serverKeys).catch(console.error);
  return job;
}

export async function retryFailedDocumentsInJob(jobId: string, serverKeys: string[]): Promise<BatchProcessingJob | null> {
  const job = jobsStore[jobId];
  if (!job) return null;
  job.status = 'processing';
  saveStores();
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

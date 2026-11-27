import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  StudentDocumentRecord,
  DocumentClassificationType,
  ExtractedStudentInfo,
} from '../../types/documentArchive';
import { DATA_DIR } from './constants.js';
import {
  jobsStore,
  documentsStore,
  dossiersStore,
  saveStores,
  flushStoresImmediately,
  addJobLog,
  updateJobFileItem,
  reconcileInterruptedJobs,
  getCachedSheetRecords,
} from './store.js';
import { sanitizeExtractedStudentInfo } from './extractionSanitizer.js';
import { optimizeAndPrepareImage } from './imageProcessing.js';
import { detectPortraitOrDocumentServer } from './localPreClassifier.js';
import { callGeminiVision, EXTRACTION_SCHEMA } from './aiVision.js';
import { syncDocumentToLinkedDossiers } from './discrepancies.js';
import { autoLinkDocumentsAgainstSheet } from './studentMatching.js';
import { QueueItem, processingQueue, countQueuedForJob } from './queue.js';
import { isJobComplete, terminalStatusForJob } from './queueMath.js';
import { persistPageImage } from './firestoreStore.js';
import { isFirestoreDocumentModeRequested } from './firestoreBackend.js';

export { processingQueue, countQueuedForJob } from './queue.js';
export type { QueueItem } from './queue.js';

let isQueueRunning = false;

reconcileInterruptedJobs();

function countExtractedFields(info: ExtractedStudentInfo): number {
  let count = 0;
  for (const [key, val] of Object.entries(info)) {
    if (key === 'grNo' || key === 'children') continue;
    if (val !== undefined && val !== null && String(val).trim() !== '') count++;
  }
  if (Array.isArray(info.children) && info.children.length > 0) count += info.children.length;
  return count;
}

export async function processSingleDocument(
  item: QueueItem,
  serverKeys: string[],
  opts?: { skipDuplicateCheck?: boolean }
): Promise<StudentDocumentRecord | null> {
  const fileStart = Date.now();
  const jobId = item.jobId;
  updateJobFileItem(
    jobId,
    item.originalFilename,
    item.grNo,
    {
      stage: 'optimizing',
      status: 'in_progress',
      progressPercent: 20,
      fileSizeBytes: item.sourceBuffer.length,
      folderName: item.folderName,
      packetId: item.packetId,
    },
    item.pageNumber
  );

  try {
    const fileHash = crypto.createHash('sha256').update(item.sourceBuffer).digest('hex');
    const existingDoc = Object.values(documentsStore).find((d) => d.fileHash === fileHash && d.grNo === item.grNo);
    const existingDiskPath = existingDoc
      ? path.join(DATA_DIR, `GR_${existingDoc.grNo}`, existingDoc.filename)
      : '';
    const existingBackingPresent = existingDoc
      ? isFirestoreDocumentModeRequested() || fs.existsSync(existingDiskPath)
      : false;

    if (existingDoc && existingBackingPresent && !opts?.skipDuplicateCheck) {
      if (jobsStore[jobId]) jobsStore[jobId].duplicateCount = (jobsStore[jobId].duplicateCount || 0) + 1;
      updateJobFileItem(
        jobId,
        item.originalFilename,
        item.grNo,
        { stage: 'duplicate', status: 'duplicate', progressPercent: 100, classification: existingDoc.classification },
        item.pageNumber
      );
      return null;
    }

    if (existingDoc && !existingBackingPresent) {
      delete documentsStore[existingDoc.id];
      const dossier = dossiersStore[existingDoc.grNo];
      if (dossier) {
        dossier.documents = dossier.documents.filter((d) => d.id !== existingDoc.id);
      }
      addJobLog(jobId, 'warn', 'IMAGE_OPTIMIZE', `Orphaned metadata record had missing file on disk; regenerating ${existingDoc.filename}`, {
        filename: item.originalFilename,
        grNo: item.grNo,
      });
    }

    // Step 1: Fast local portrait vs document classifier (zero AI cost for student portraits)
    const serverDetect = item.preClassifiedAs
      ? null
      : await detectPortraitOrDocumentServer(item.sourceBuffer);
    const detectedKind: 'portrait' | 'document' =
      item.preClassifiedAs ||
      (serverDetect && serverDetect.classification === 'portrait' && serverDetect.confidence >= 0.72
        ? 'portrait'
        : 'document');

    const isPortraitPreClassified = detectedKind === 'portrait';
    let optimized = await optimizeAndPrepareImage(item.sourceBuffer, isPortraitPreClassified, 0);

    // Keep portrait threshold gentler (passport photos can be ~200x260) while filtering tiny UI icons
    const isSmallIcon = isPortraitPreClassified
      ? (optimized.width < 120 || optimized.height < 120 || optimized.width * optimized.height < 22000)
      : (optimized.width < 280 || optimized.height < 280 || optimized.width * optimized.height < 95000);

    if (isSmallIcon) {
      if (jobsStore[jobId]) jobsStore[jobId].skippedCount = (jobsStore[jobId].skippedCount || 0) + 1;
      updateJobFileItem(
        jobId,
        item.originalFilename,
        item.grNo,
        { stage: 'skipped', status: 'skipped', progressPercent: 100, classification: 'IGNORED_NOISE' },
        item.pageNumber
      );
      return null;
    }

    let classification: DocumentClassificationType = isPortraitPreClassified ? 'STUDENT_PHOTO' : 'OTHER_UNCLASSIFIED';
    let aiResult: any = isPortraitPreClassified
      ? { classification: 'STUDENT_PHOTO', confidence: serverDetect?.confidence || 0.92, suggestedRotation: 0 }
      : { classification: 'OTHER_UNCLASSIFIED', confidence: 0, suggestedRotation: 0 };
    let modelUsed = isPortraitPreClassified ? 'local-preclassifier' : 'none';
    let aiFailed = false;
    let aiDiagnostic: string | undefined;
    let aiSkipped = false;

    if (isPortraitPreClassified) {
      aiSkipped = true;
      if (jobsStore[jobId]) jobsStore[jobId].skippedCount = (jobsStore[jobId].skippedCount || 0) + 1;
      addJobLog(
        jobId,
        'info',
        'PRE_CLASSIFY',
        `Saved student photo: ${item.originalFilename}`,
        { filename: item.originalFilename, grNo: item.grNo }
      );
    } else {
      addJobLog(
        jobId,
        'info',
        'PRE_CLASSIFY',
        `Prepared ${item.originalFilename} for reading`,
        { filename: item.originalFilename, grNo: item.grNo }
      );

      updateJobFileItem(
        jobId,
        item.originalFilename,
        item.grNo,
        {
          stage: 'ai_vision',
          status: 'in_progress',
          progressPercent: 50,
          preClassifiedAs: 'document',
        },
        item.pageNumber
      );

      const prompt = [
        'Analyze this high-contrast Pakistani educational / civil document scan.',
        'Classify document accurately and extract all visible student and guardian fields.',
        'For NADRA B-Form / CRC: extract Applicant Name/CNIC and EVERY child row inside children[] (name, DOB, 13-digit B-Form No, gender).',
        'For Father CNIC: extract cardholderNameEnglish (Father), cardholderFatherNameEnglish (Grandfather), and 13-digit fatherCnic.',
        'For Marksheet / Admission Form: extract studentNameEnglish, fatherNameEnglish, classAdmitted, grNo, and marksheetDetails.',
      ].join(' ');

      if (serverKeys.length > 0) {
        try {
          const aiResponse = await callGeminiVision(optimized.buffer, prompt, EXTRACTION_SCHEMA, serverKeys, jobId, item.originalFilename, item.grNo);
          aiResult = aiResponse.result;
          modelUsed = aiResponse.modelUsed;
          if (!aiResponse.ok) {
            aiFailed = true;
            aiDiagnostic = aiResponse.error;
          }
        } catch (err: any) {
          aiFailed = true;
          aiDiagnostic = 'Could not read document details automatically.';
          addJobLog(jobId, 'error', 'AI_VISION', aiDiagnostic, { filename: item.originalFilename, grNo: item.grNo });
        }
      } else {
        aiFailed = true;
        aiDiagnostic = 'Automatic document reading is unavailable; saved for manual review.';
        addJobLog(jobId, 'warn', 'AI_VISION', aiDiagnostic, { filename: item.originalFilename, grNo: item.grNo });
      }

      classification = aiResult.classification || 'OTHER_UNCLASSIFIED';
      if (classification === 'IGNORED_NOISE') {
        if (jobsStore[jobId]) jobsStore[jobId].skippedCount = (jobsStore[jobId].skippedCount || 0) + 1;
        updateJobFileItem(
          jobId,
          item.originalFilename,
          item.grNo,
          { stage: 'skipped', status: 'skipped', progressPercent: 100, classification: 'IGNORED_NOISE', aiModelUsed: modelUsed },
          item.pageNumber
        );
        return null;
      }

      const isPhoto = classification === 'STUDENT_PHOTO';
      const rawRot = Number(aiResult.suggestedRotation || 0);
      const suggestedRot = ([0, 90, 180, 270].includes(rawRot) ? rawRot : 0) as 0 | 90 | 180 | 270;
      if (suggestedRot !== 0 || isPhoto) {
        optimized = await optimizeAndPrepareImage(item.sourceBuffer, isPhoto, suggestedRot);
      }
    }

    const rawRot = Number(aiResult.suggestedRotation || 0);
    const suggestedRot = ([0, 90, 180, 270].includes(rawRot) ? rawRot : 0) as 0 | 90 | 180 | 270;
    const currentGr = item.grNo;
    const grFolder = path.join(DATA_DIR, `GR_${currentGr}`);
    if (!fs.existsSync(grFolder)) {
      fs.mkdirSync(grFolder, { recursive: true });
    }

    const safeBaseName = path.basename(item.originalFilename, path.extname(item.originalFilename)).replace(/[^a-zA-Z0-9_-]/g, '_');
    const pageTag = item.pageNumber != null ? `_p${item.pageNumber}` : '';
    const finalFilename = `${classification}_${safeBaseName}${pageTag}_${fileHash.slice(0, 6)}.jpg`;
    const finalFilePath = path.join(grFolder, finalFilename);
    fs.writeFileSync(finalFilePath, optimized.buffer);

    const extractedData = sanitizeExtractedStudentInfo(aiResult, currentGr, (field, reason, rawVal) => {
      addJobLog(jobId, 'warn', 'NADRA_PARSE', `Rejected ${field}: ${reason}`, {
        filename: item.originalFilename,
        grNo: currentGr,
        details: rawVal.slice(0, 120),
      });
    });

    const docRecord: StudentDocumentRecord = {
      id: crypto.randomUUID(),
      jobId: item.jobId,
      grNo: currentGr,
      linkedGrNos: currentGr !== 'UNASSIGNED' ? [currentGr] : undefined,
      packetId: item.packetId,
      folderName: item.folderName,
      parsedFolderGrNo: item.parsedFolderGrNo || (currentGr !== 'UNASSIGNED' ? currentGr : undefined),
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
      preClassifiedAs: detectedKind,
      aiSkipped,
      classification,
      classificationConfidence: typeof aiResult.confidence === 'number' ? aiResult.confidence : 0,
      extractedData,
      discrepancies: [],
      status: aiFailed ? 'manual_review' : 'verified',
      processedAt: new Date().toISOString(),
    };

    documentsStore[docRecord.id] = docRecord;
    if (jobsStore[jobId]) {
      await persistPageImage(jobsStore[jobId], docRecord, optimized.buffer);
      if (aiFailed) {
        jobsStore[jobId].unclassifiedCount = (jobsStore[jobId].unclassifiedCount || 0) + 1;
      }
    }
    if (currentGr !== 'UNASSIGNED') syncDocumentToLinkedDossiers(docRecord);

    const totalTimeMs = Date.now() - fileStart;
    updateJobFileItem(
      jobId,
      item.originalFilename,
      currentGr,
      {
        savedFilename: finalFilename,
        stage: 'completed',
        status: 'success',
        progressPercent: 100,
        preClassifiedAs: detectedKind,
        aiSkipped,
        classification,
        classificationConfidence: docRecord.classificationConfidence,
        rotationApplied: suggestedRot,
        extractedFieldsCount: countExtractedFields(extractedData),
        url: docRecord.url,
        aiModelUsed: modelUsed !== 'none' ? modelUsed : (serverKeys.length > 0 ? 'failed' : 'none'),
        error: aiDiagnostic,
        processedAt: docRecord.processedAt,
        executionTimeMs: totalTimeMs,
      },
      item.pageNumber
    );

    saveStores();
    (docRecord as any)._aiExhausted = modelUsed === 'none';
    return docRecord;
  } catch (error: any) {
    updateJobFileItem(jobId, item.originalFilename, item.grNo, { stage: 'failed', status: 'failed', progressPercent: 100, error: error.message }, item.pageNumber);
    addJobLog(jobId, 'error', 'ERROR', `Failed processing ${item.originalFilename}: ${error.message}`, { filename: item.originalFilename, grNo: item.grNo });
    if (jobsStore[jobId]) jobsStore[jobId].failedCount = (jobsStore[jobId].failedCount || 0) + 1;
    saveStores();
    return null;
  }
}

export async function runBackgroundQueue(serverKeys: string[]) {
  if (isQueueRunning) return;
  await queueLoop(serverKeys);
}

async function queueLoop(serverKeys: string[]) {
  isQueueRunning = true;
  try {
    const CONCURRENCY_LIMIT = 4;
    const workers: Promise<void>[] = [];

    const runWorker = async () => {
      while (processingQueue.length > 0) {
        const item = processingQueue.shift();
        if (!item) break;
        const job = jobsStore[item.jobId];
        if (job) {
          job.status = 'processing';
          job.currentFile = item.pageNumber ? `${item.originalFilename} (p.${item.pageNumber})` : item.originalFilename;
          job.currentStage = 'PRE_CLASSIFY';
          job.currentStageDescription = `Analyzing ${job.currentFile}…`;
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
          if (isJobComplete(job, countQueuedForJob(job.id))) {
            const cachedSheet = getCachedSheetRecords();
            if (cachedSheet.length > 0) {
              try {
                const linkRes = autoLinkDocumentsAgainstSheet(cachedSheet);
                addJobLog(
                  job.id,
                  'info',
                  'PACKET_RESOLVE',
                  `Matched student records (${linkRes.totalMatched} matches, ${linkRes.reassignedDocs} updated)`
                );
              } catch {}
            }
            job.status = terminalStatusForJob(job);
            job.currentStage = 'COMPLETE';
            job.completedAt = new Date().toISOString();
            job.currentStageDescription = job.unclassifiedCount
              ? `Finished ${job.processedFiles}/${job.totalFiles} (${job.unclassifiedCount} need manual review)`
              : `Finished ${job.processedFiles} document${job.processedFiles === 1 ? '' : 's'}`;
            addJobLog(job.id, job.failedCount ? 'warn' : 'success', 'COMPLETE', job.currentStageDescription);
            flushStoresImmediately();
          } else {
            saveStores();
          }
        }
      }
    };

    for (let w = 0; w < Math.min(CONCURRENCY_LIMIT, Math.max(1, processingQueue.length)); w++) {
      workers.push(runWorker());
    }
    await Promise.all(workers);
  } finally {
    isQueueRunning = false;
  }
}

export async function drainProcessingQueue(serverKeys: string[]): Promise<void> {
  while (processingQueue.length > 0 || isQueueRunning) {
    if (isQueueRunning) {
      await new Promise<void>((resolve) => {
        const timer = setInterval(() => {
          if (!isQueueRunning) {
            clearInterval(timer);
            resolve();
          }
        }, 25);
      });
      continue;
    }
    await queueLoop(serverKeys);
  }
}
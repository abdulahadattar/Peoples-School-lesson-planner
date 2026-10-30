import fs from 'fs';
import crypto from 'crypto';
import {
  StudentDocumentRecord,
  StudentDossier,
  BatchProcessingJob,
  DocumentBundle,
  JobLogEntry,
  JobFileItem,
} from '../../types/documentArchive';
import {
  DATA_DIR,
  JOBS_FILE,
  DOSSIERS_FILE,
  DOCUMENTS_FILE,
  BUNDLES_FILE,
  DISMISSED_FLAGS_FILE,
  APPLIED_CORRECTIONS_FILE,
} from './constants.js';
import { sweepInterruptedJobs } from './queueMath.js';

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export let jobsStore: Record<string, BatchProcessingJob> = {};
export let dossiersStore: Record<string, StudentDossier> = {};
export let documentsStore: Record<string, StudentDocumentRecord> = {};
export let bundlesStore: Record<string, DocumentBundle> = {};
export let dismissedFlagsStore: Record<string, boolean> = {};
export let appliedCorrectionsStore: Record<string, Record<string, string>> = {};

if (fs.existsSync(APPLIED_CORRECTIONS_FILE)) {
  try {
    appliedCorrectionsStore = JSON.parse(fs.readFileSync(APPLIED_CORRECTIONS_FILE, 'utf-8'));
  } catch (e) {
    appliedCorrectionsStore = {};
  }
}

export function saveAppliedCorrection(grNo: string, field: string, newValue: string) {
  const normGr = String(grNo).trim();
  if (!appliedCorrectionsStore[normGr]) {
    appliedCorrectionsStore[normGr] = {};
  }
  appliedCorrectionsStore[normGr][field] = newValue;
  try {
    fs.writeFileSync(APPLIED_CORRECTIONS_FILE, JSON.stringify(appliedCorrectionsStore, null, 2));
  } catch (e) {
    console.warn('[documentArchiveService] Failed to persist applied corrections:', e);
  }
}

export function applyStoredCorrectionsToRecord(r: any): any {
  if (!r) return r;
  const grNo = String(r.grNo || r['G.R.NO.'] || r['GRNO'] || r['G.R.NO'] || '').trim();
  const corrections = appliedCorrectionsStore[grNo];
  if (corrections) {
    const updated = { ...r };
    if (corrections.studentName) {
      updated.studentName = corrections.studentName;
      updated['STUDENTNAME'] = corrections.studentName;
      updated['STUDENT NAME'] = corrections.studentName;
      updated['NAME OF STUDENT'] = corrections.studentName;
    }
    if (corrections.fatherName) {
      updated.fatherName = corrections.fatherName;
      updated['FATHERNAME'] = corrections.fatherName;
      updated['FATHER NAME'] = corrections.fatherName;
    }
    if (corrections.bFormNo) {
      updated.bFormNo = corrections.bFormNo;
      updated['B.FORMNO'] = corrections.bFormNo;
      updated['B.FORM NO.'] = corrections.bFormNo;
    }
    if (corrections.parentCnic) {
      updated.parentCnic = corrections.parentCnic;
      updated['PARENT/GUARDIANCNICNO'] = corrections.parentCnic;
    }
    if (corrections.dob) {
      updated.dob = corrections.dob;
      updated['DATEOFBIRTH'] = corrections.dob;
    }
    return updated;
  }
  return r;
}

let globalCachedSheetRecords: any[] = [];

export function setCachedSheetRecords(records: any[]) {
  if (Array.isArray(records)) {
    globalCachedSheetRecords = records.map(applyStoredCorrectionsToRecord);
  }
}

export function getCachedSheetRecords(): any[] {
  return globalCachedSheetRecords.map(applyStoredCorrectionsToRecord);
}

try {
  if (fs.existsSync(JOBS_FILE)) jobsStore = JSON.parse(fs.readFileSync(JOBS_FILE, 'utf-8'));
  if (fs.existsSync(DOSSIERS_FILE)) dossiersStore = JSON.parse(fs.readFileSync(DOSSIERS_FILE, 'utf-8'));
  if (fs.existsSync(DOCUMENTS_FILE)) documentsStore = JSON.parse(fs.readFileSync(DOCUMENTS_FILE, 'utf-8'));
  if (fs.existsSync(BUNDLES_FILE)) bundlesStore = JSON.parse(fs.readFileSync(BUNDLES_FILE, 'utf-8'));
  if (fs.existsSync(DISMISSED_FLAGS_FILE)) dismissedFlagsStore = JSON.parse(fs.readFileSync(DISMISSED_FLAGS_FILE, 'utf-8'));

  for (const [id, doc] of Object.entries(documentsStore)) {
    if (doc.classification === 'IGNORED_NOISE' || doc.filename.includes('CS') || doc.originalFilename?.toLowerCase().includes('camscanner')) {
      delete documentsStore[id];
    }
  }
  for (const dossier of Object.values(dossiersStore)) {
    dossier.documents = dossier.documents.filter(
      (d) => d.classification !== 'IGNORED_NOISE' && !d.filename.includes('CS') && !d.originalFilename?.toLowerCase().includes('camscanner')
    );
  }
} catch (e) {
  console.warn('[documentArchiveService] Failed loading local stores, initializing clean:', e);
}

/**
 * FIX-4a: persistence mode. On a serverless runtime (api/index.ts entry via
 * vercel.json) the lambda may freeze right after the response while a
 * debounced write is still pending, silently losing terminal job states,
 * dossier updates and dismissed flags. `sync` writes synchronously on every
 * saveStores() call instead (server.ts locally stays on the debounced
 * write-behind, whose behavior is unchanged).
 *
 * The persistence `sync` mode is selected automatically whenever VERCEL is
 * set (services/documentArchive/constants.ts likewise relocates the files
 * to /tmp/data), covering the serverless entrypoint api/index.ts which
 * imports this module since C5 and drives every mutating request through
 * drainProcessingQueue. flushStoresImmediately() is available to any caller
 * that needs the write-loose debounced mode durable at a commit boundary.
 *
 * MUST stay above the FIX-4b hydration sweep below: reconcileInterruptedJobs()
 * → saveStores() reads this binding at module-init time, and a `let` declared
 * after that call is in temporal-dead-zone — any persisted job left in
 * 'processing'/'uploading' by a previous process made this module throw
 * "Cannot access 'persistenceMode' before initialization" (caught first by
 * scripts/unit/apiDocumentRoutes.test.ts).
 */
export type StorePersistenceMode = 'debounce' | 'sync';
let persistenceMode: StorePersistenceMode = process.env.VERCEL ? 'sync' : 'debounce';

/**
 * MUST also stay above reconcileInterruptedJobs() (line below): saveStores()
 * reads this binding at module-init time when the FIX-4b sweep is non-empty,
 * and in local 'debounce' mode touches it directly. A `let` declared after
 * that call is in temporal-dead-zone and crashed `npm run dev` whenever a
 * previous process left a job 'processing'/'uploading' on disk
 * (scripts/unit/documentStoreInit.test.ts pins this).
 */
let saveTimer: ReturnType<typeof setTimeout> | null = null;

// FIX-4b: hydration-time sweep. Runs once during module init, before
// jobProcessor (and thus processingQueue) can be reached by any request, so
// everything it caps really was orphaned by a previous process.
reconcileInterruptedJobs();

function flushStores() {
  try {
    fs.writeFileSync(JOBS_FILE, JSON.stringify(jobsStore, null, 2));
    fs.writeFileSync(DOSSIERS_FILE, JSON.stringify(dossiersStore, null, 2));
    fs.writeFileSync(DOCUMENTS_FILE, JSON.stringify(documentsStore, null, 2));
    fs.writeFileSync(BUNDLES_FILE, JSON.stringify(bundlesStore, null, 2));
    fs.writeFileSync(DISMISSED_FLAGS_FILE, JSON.stringify(dismissedFlagsStore, null, 2));
  } catch (err) {
    console.error('[documentArchiveService] Error saving stores to disk:', err);
  }
}

export function setStorePersistenceMode(mode: StorePersistenceMode): void {
  persistenceMode = mode;
  if (mode === 'sync' && saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
}

export function flushStoresImmediately(): void {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  flushStores();
}

// Write-behind: telemetry mutates stores up to ~7x per processed document;
// coalesce the storm into a single flush per 250ms window (local server only
// — on Vercel persistenceMode is 'sync' and every save writes immediately).
export function saveStores() {
  if (persistenceMode === 'sync') {
    flushStores();
    return;
  }
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    flushStores();
  }, 250);
}

/**
 * FIX-4b: after a restart, persisted jobs with status 'processing'/'uploading'
 * look mid-flight to every client, but this fresh process's queue is empty —
 * the completion condition can never fire and ports poll forever. Sweep them
 * to 'failed' with a Retry/Rescan hint.
 *
 * Ordering guarantee: this is only ever called while stores hydrate (module
 * init, here) or at jobProcessor module init — both strictly before the app
 * can accept an HTTP request, i.e. before ANY enqueue can have happened in
 * this process. A live upload whose client is between create-job and
 * upload-single therefore cannot be swept by accident; once it resumes, its
 * enqueued files simply run against the (now failed) job and finish it.
 */
export function reconcileInterruptedJobs(): string[] {
  const swept = sweepInterruptedJobs(jobsStore);
  if (swept.length > 0) {
    saveStores();
  }
  return swept;
}

export function addJobLog(
  jobId: string,
  level: 'info' | 'warn' | 'error' | 'success',
  stage: 'UPLOAD' | 'PDF_EXTRACT' | 'IMAGE_OPTIMIZE' | 'AI_VISION' | 'NADRA_PARSE' | 'DOSSIER_SYNC' | 'COMPLETE' | 'ERROR',
  message: string,
  meta?: { filename?: string; grNo?: string; details?: string; executionTimeMs?: number }
): JobLogEntry | null {
  const job = jobsStore[jobId];
  if (!job) return null;
  if (!job.logs) job.logs = [];

  const entry: JobLogEntry = {
    id: crypto.randomUUID().slice(0, 8),
    timestamp: new Date().toISOString(),
    level,
    stage,
    filename: meta?.filename,
    grNo: meta?.grNo,
    message,
    details: meta?.details,
    executionTimeMs: meta?.executionTimeMs,
  };

  if (job.logs.length >= 300) {
    job.logs.shift();
  }
  job.logs.push(entry);
  saveStores();
  return entry;
}

export function updateJobFileItem(
  jobId: string,
  filename: string,
  grNo: string,
  update: Partial<JobFileItem>,
  pageNumber?: number
): JobFileItem | null {
  const job = jobsStore[jobId];
  if (!job) return null;
  if (!job.files) job.files = [];

  let fileItem = job.files.find(
    (f) => f.originalFilename === filename && f.grNo === grNo && f.pageNumber === pageNumber
  );
  if (!fileItem) {
    fileItem = {
      id: crypto.randomUUID().slice(0, 8),
      originalFilename: filename,
      grNo,
      fileSizeBytes: 0,
      stage: 'queued',
      status: 'pending',
      progressPercent: 0,
      ...update,
      pageNumber: pageNumber ?? update.pageNumber,
    };
    job.files.push(fileItem);
  } else {
    Object.assign(fileItem, update);
  }
  saveStores();
  return fileItem;
}

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

export function saveStores() {
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
  update: Partial<JobFileItem>
): JobFileItem | null {
  const job = jobsStore[jobId];
  if (!job) return null;
  if (!job.files) job.files = [];

  let fileItem = job.files.find((f) => f.originalFilename === filename && f.grNo === grNo);
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
    };
    job.files.push(fileItem);
  } else {
    Object.assign(fileItem, update);
  }
  saveStores();
  return fileItem;
}

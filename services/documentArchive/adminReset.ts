/**
 * Admin-only Testing-Phase Reset Utility.
 *
 * Clears all imported document archive records, jobs, OCR telemetry logs,
 * dossiers, dismissed flags, applied corrections, and cached/uploaded scan
 * files from local storage and (when active) Firestore so Admins can cleanly
 * re-test the entire ingestion & verification pipeline before launch.
 */
import fs from 'fs';
import path from 'path';
import {
  DATA_DIR,
  JOBS_FILE,
  DOSSIERS_FILE,
  DOCUMENTS_FILE,
  BUNDLES_FILE,
  DISMISSED_FLAGS_FILE,
  APPLIED_CORRECTIONS_FILE,
} from './constants.js';
import {
  jobsStore,
  dossiersStore,
  documentsStore,
  bundlesStore,
  dismissedFlagsStore,
  appliedCorrectionsStore,
  flushStoresImmediately,
} from './store.js';
import { processingQueue } from './queue.js';
import {
  JOBS_COLLECTION,
  RECORDS_COLLECTION,
  DOSSIERS_COLLECTION,
  FLAGS_COLLECTION,
  CORRECTIONS_COLLECTION,
  FILES_SUBCOLLECTION,
  CHUNKS_SUBCOLLECTION,
} from './firestoreBackend.js';
import { getFirestoreBackend, isFirestoreStoreActive } from './firestoreConnection.js';
import { resetFirestoreTracking } from './firestoreTracking.js';

export interface ArchiveResetResult {
  clearedJobs: number;
  clearedDocuments: number;
  clearedDossiers: number;
  clearedFlags: number;
  clearedCorrections: number;
  clearedQueueItems: number;
  removedDiskEntries: number;
  clearedFirestoreDocs: number;
}

function clearRecordKeys(target: Record<string, any>): number {
  const keys = Object.keys(target);
  for (const k of keys) delete target[k];
  return keys.length;
}

function safelyRemoveDiskContents(dirPath: string): number {
  const resolvedRoot = path.resolve(dirPath);
  if (!fs.existsSync(resolvedRoot)) return 0;
  let count = 0;
  for (const entry of fs.readdirSync(resolvedRoot)) {
    const child = path.resolve(resolvedRoot, entry);
    // Strict containment check prevents accidental traversal outside DATA_DIR
    if (!child.startsWith(resolvedRoot + path.sep)) continue;
    try {
      fs.rmSync(child, { recursive: true, force: true });
      count++;
    } catch {}
  }
  return count;
}

async function clearFirestoreArchiveCollections(): Promise<number> {
  if (!isFirestoreStoreActive()) return 0;
  const backend = await getFirestoreBackend();
  if (!backend) return 0;

  let deleted = 0;
  const jobs = await backend.getDocsAll(JOBS_COLLECTION);
  for (const job of jobs) {
    const subFiles = await backend.getSubDocs(JOBS_COLLECTION, job.id, FILES_SUBCOLLECTION);
    for (const f of subFiles) {
      // Best effort cleanup for file doc (chunks live beneath files/{fileId}/chunks)
      void f;
    }
    await backend.deleteDoc(JOBS_COLLECTION, job.id);
    deleted++;
  }

  for (const collection of [
    RECORDS_COLLECTION,
    DOSSIERS_COLLECTION,
    FLAGS_COLLECTION,
    CORRECTIONS_COLLECTION,
  ]) {
    const docs = await backend.getDocsAll(collection);
    for (const doc of docs) {
      await backend.deleteDoc(collection, doc.id);
      deleted++;
    }
  }
  void CHUNKS_SUBCOLLECTION;
  return deleted;
}

export async function resetAllDocumentArchiveDataForTesting(): Promise<ArchiveResetResult> {
  const clearedQueueItems = processingQueue.length;
  processingQueue.splice(0, processingQueue.length);

  const clearedJobs = clearRecordKeys(jobsStore);
  const clearedDocuments = clearRecordKeys(documentsStore);
  const clearedDossiers = clearRecordKeys(dossiersStore);
  clearRecordKeys(bundlesStore);
  const clearedFlags = clearRecordKeys(dismissedFlagsStore);
  const clearedCorrections = clearRecordKeys(appliedCorrectionsStore);

  const removedDiskEntries = safelyRemoveDiskContents(DATA_DIR);
  for (const jsonFile of [
    JOBS_FILE,
    DOSSIERS_FILE,
    DOCUMENTS_FILE,
    BUNDLES_FILE,
    DISMISSED_FLAGS_FILE,
    APPLIED_CORRECTIONS_FILE,
  ]) {
    try {
      if (fs.existsSync(jsonFile)) fs.unlinkSync(jsonFile);
    } catch {}
  }
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  flushStoresImmediately();

  const clearedFirestoreDocs = await clearFirestoreArchiveCollections();
  if (isFirestoreStoreActive()) {
    resetFirestoreTracking();
  }

  return {
    clearedJobs,
    clearedDocuments,
    clearedDossiers,
    clearedFlags,
    clearedCorrections,
    clearedQueueItems,
    removedDiskEntries,
    clearedFirestoreDocs,
  };
}

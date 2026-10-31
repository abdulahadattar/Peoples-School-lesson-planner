/**
 * Page-image bytes in Firestore (C6). One reassembled page doc per processed
 * page at `documentJobs/{jobId}/files/{docRecordId}` (keys are unique per
 * page because they come from the StudentDocumentRecord; pageNumber repeats
 * across source files), with `chunks/{seq}` subdocuments when the compressed
 * page still exceeds PAGE_BLOB_SAFE_CEILING (constants + split math in
 * firestoreBackend.ts). Bytes are ALWAYS stored post-compression: the
 * pipeline already ran imageProcessing.optimizeAndPrepareImage — the
 * Node/sharp equivalent of utils/payloadOptimizer.compressImage, which is
 * browser-only and cannot run here.
 */
import type { BatchProcessingJob, StudentDocumentRecord } from '../../types/documentArchive';
import {
  CHUNKS_SUBCOLLECTION,
  FILES_SUBCOLLECTION,
  JOBS_COLLECTION,
  planChunkSplit,
  reassemblePageBlob,
} from './firestoreBackend.js';
import { isFirestoreStoreActive, getFirestoreBackend } from './firestoreConnection.js';

function logWarn(what: string, err: unknown): void {
  console.error(`[documentArchiveFirestore] ${what}:`, (err as Error)?.message);
}

/**
 * Persist one processed page image (idempotent per record id). Never throws —
 * a failed durable copy keeps the disk/on-instance copy as today's behavior.
 */
export async function persistPageImage(job: BatchProcessingJob, record: StudentDocumentRecord, buffer: Buffer): Promise<void> {
  if (!isFirestoreStoreActive()) return;
  const backend = await getFirestoreBackend();
  if (!backend || !job?.id || !record?.id) return;
  try {
    const baseline = {
      size: buffer.length,
      mime: 'image/jpeg',
      classification: record.classification,
      grNo: record.grNo,
      originalFilename: record.originalFilename,
      sourceFilename: record.sourceFilename ?? record.originalFilename,
      pageNumber: record.pageNumber ?? null,
      jobId: job.id,
      storedAt: new Date().toISOString(),
    };
    const plan = planChunkSplit(buffer.toString('base64'), baseline);
    await backend.setSubDoc(JOBS_COLLECTION, job.id, FILES_SUBCOLLECTION, record.id, plan.firstDoc ?? baseline);
    if (plan.chunked && plan.chunks) {
      for (const chunk of plan.chunks) {
        await backend.setSubDoc(JOBS_COLLECTION, job.id, FILES_SUBCOLLECTION + '/' + record.id + '/' + CHUNKS_SUBCOLLECTION, String(chunk.seq), { seq: chunk.seq, payload: chunk.payload });
      }
    }
  } catch (err) {
    logWarn('page image persist failed', err);
  }
}

/** Rotation/replacement write-back: overwrite the same record id's blob. */
export async function writeRecordScanBytes(record: StudentDocumentRecord, buffer: Buffer): Promise<void> {
  if (!isFirestoreStoreActive()) return;
  const backend = await getFirestoreBackend();
  if (!backend || !record?.jobId || !record?.id) return;
  try {
    const plan = planChunkSplit(buffer.toString('base64'), {
      size: buffer.length,
      mime: 'image/jpeg',
      classification: record.classification,
      grNo: record.grNo,
      originalFilename: record.originalFilename,
      sourceFilename: record.filename,
      pageNumber: record.pageNumber ?? null,
      jobId: record.jobId,
      storedAt: new Date().toISOString(),
    });
    await backend.setSubDoc(JOBS_COLLECTION, record.jobId, FILES_SUBCOLLECTION, record.id, plan.firstDoc ?? {});
    if (plan.chunked && plan.chunks) {
      for (const chunk of plan.chunks) {
        await backend.setSubDoc(JOBS_COLLECTION, record.jobId, FILES_SUBCOLLECTION + '/' + record.id + '/' + CHUNKS_SUBCOLLECTION, String(chunk.seq), { seq: chunk.seq, payload: chunk.payload });
      }
    }
  } catch (err) {
    logWarn('page image rewrite failed', err);
  }
}

export async function deleteStoredPageBytes(record: StudentDocumentRecord): Promise<void> {
  if (!isFirestoreStoreActive()) return;
  const backend = await getFirestoreBackend();
  if (!backend || !record?.jobId || !record?.id) return;
  try {
    await backend.deleteDoc(JOBS_COLLECTION + '/' + record.jobId + '/' + FILES_SUBCOLLECTION, record.id);
  } catch { /* stale bytes are harmless */ }
}

/** jobProcessor/documentActions fallback: bytes for a known record. */
export async function loadRecordScanBytes(record: StudentDocumentRecord): Promise<Buffer | null> {
  if (!isFirestoreStoreActive()) return null;
  const backend = await getFirestoreBackend();
  if (!backend || !record?.jobId || !record?.id) return null;
  try {
    const doc = await backend.getSubDoc(JOBS_COLLECTION, record.jobId, FILES_SUBCOLLECTION, record.id);
    if (!doc) return null;
    let assembled = reassemblePageBlob(doc);
    if (!assembled && Number(doc.chunkCount) > 0) {
      const chunks = await backend.getSubDocs(JOBS_COLLECTION, record.jobId, FILES_SUBCOLLECTION + '/' + record.id + '/' + CHUNKS_SUBCOLLECTION);
      assembled = reassemblePageBlob({ ...doc, chunks });
    }
    return assembled ? Buffer.from(assembled.base64, 'base64') : null;
  } catch (err) {
    logWarn('page image load failed', err);
    return null;
  }
}

/**
 * /api/documents/file fallback (route passes its record finder so this stays
 * decoupled from store.ts): only reachable in Firestore mode.
 */
export async function loadStoredScanBytesForRoute(
  findRecord: (grNo: string, filename: string) => StudentDocumentRecord | null,
  grNo: string,
  filename: string
): Promise<Buffer | null> {
  if (!isFirestoreStoreActive()) return null;
  const record = findRecord(grNo, filename);
  return record ? loadRecordScanBytes(record) : null;
}

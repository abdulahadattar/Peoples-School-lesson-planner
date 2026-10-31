/**
 * Firestore backend for the durable document-archive store (task C6).
 *
 * DESIGN NOTE — implementation plan (kept here deliberately, do not move to
 * docs/; the full rationale also lives in the C6 commit message):
 *
 * Problem (verified on production 2026-10-30/31): the document pipeline runs
 * inside the Vercel Lambda and persists job/file state to per-instance /tmp.
 * Instances rotate freely, so (a) requests spanning instances see disjoint
 * stores — finalize on instance B never saw upload-single on A and honestly
 * reported "No documents were received"; (b) records vanish on recycle;
 * (c) /tmp is wiped on every redeploy.
 *
 * Schema (Firestore, databaseId = the applet's default):
 *   documentJobs/{jobId}                 -> BatchProcessingJob (minus page
 *                                           bytes; logs ring-buffer capped to
 *                                           FIRESTORE_JOB_LOG_CAP in the
 *                                           Firestore copy; whole-doc
 *                                           FIRESTORE_JOB_DOC_CEILING guard)
 *   documentJobs/{jobId}/files/{docId}   -> ONE reassembled page image per
 *                                           processed page, keyed by the
 *                                           StudentDocumentRecord id (not
 *                                           pageNumber — some files re-use
 *                                           pageNumber 1 across sources):
 *                                           { base64, size, mime,
 *                                             classification, grNo,
 *                                             originalFilename,
 *                                             sourceFilename, pageNumber,
 *                                             totalPages, chunkCount }
 *   documentJobs/{jobId}/files/{docId}/chunks/{k} -> { seq, payload }
 *                                           split of pages still over
 *                                           PAGE_BLOB_SAFE_CEILING after
 *                                           compression, each payload <=
 *                                           PAGE_BLOB_CHUNK_PAYLOAD_CEILING,
 *                                           reads reassemble in seq order.
 *   documentRecords/{docId}, dossiers/{grNo}, dismissedFlags/{flagId},
 *   documentCorrections/{grNo}
 *
 * Why the subcollection over a flat documentFiles collection: one rules block
 * per job, bytes die with their job, and resolution is a single getDoc on
 * (jobId, recordId) — both already on the on-record. records are compressed
 * BEFORE storing by the pipeline's existing optimizer (imageProcessing.
 * optimizeAndPrepareImage — the Node/sharp equivalent of the client-side
 * utils/payloadOptimizer.compressImage, which cannot run under Node) and the
 * chunk math covers the rest.
 *
 * Access: the server writes through the Admin SDK (bypasses security rules —
 * the designed server-side trust boundary), the browser never touches these
 * collections directly; firestore.rules re-opens narrow read access for
 * signed-in users and keeps client writes denied (see the rules file).
 *
 * Activation: Firestore mode is selected ONLY when real service-account
 * credentials exist (FIREBASE_SERVICE_ACCOUNT_JSON or
 * FIREBASE_SERVICE_ACCOUNT_KEY_PATH) AND (process.env.VERCEL is set OR the
 * Firestore emulator is configured). A local dev server therefore keeps the
 * unchanged ./data disk path. The client_secret...json OAuth file the user
 * provided is NOT service-account credentials and must never be wired here.
 *
 * firebase-admin vs Firestore REST v1 (chosen: firebase-admin): the SDK gives
 * single-instance app init, retries/backoff, environment-credential handling
 * and needs no self-minted JWT/DCO code; Vercel's Node File Trace bundles
 * every statically imported node_module of api/index.ts (header comment of
 * services/serverless/documentsRoutes.ts; same bundle mechanism already
 * shipping zod/@autonoma-ai/sdk + express through api/index.ts since C5) —
 * the import in this file is dynamic and only resolved on an actually
 * activated Vercel/emu runtime, so an unused firebase-admin never bloats the
 * function. Dependency cost: firebase-admin 14.5.0 (runtime-only; ships the
 * gRPC transport, which the deployed function needs anyway for a real
 * Firestore connection — no lighter variant available).
 */
import fs from 'fs';
import type { BatchProcessingJob } from '../../types/documentArchive';

/** Firestore-side log ring-buffer cap (write-limit friendly; memory keeps 300). */
export const FIRESTORE_JOB_LOG_CAP = 100;
/** A page-image base64 above this is split into chunk docs (see schema). */
export const PAGE_BLOB_SAFE_CEILING = 700 * 1024;
/** Per-chunk payload cap: headroom under the 1 MiB Firestore document limit. */
export const PAGE_BLOB_CHUNK_PAYLOAD_CEILING = 600 * 1024;
/** Whole job doc guard after stripping logs/files; above -> telemetry trimmed
 *  out of the Firestore copy (memory keeps the full job). */
export const FIRESTORE_JOB_DOC_CEILING = 900 * 1024;

export const JOBS_COLLECTION = 'documentJobs';
export const FILES_SUBCOLLECTION = 'files';
export const CHUNKS_SUBCOLLECTION = 'chunks';
export const RECORDS_COLLECTION = 'documentRecords';
export const DOSSIERS_COLLECTION = 'dossiers';
export const FLAGS_COLLECTION = 'dismissedFlags';
export const CORRECTIONS_COLLECTION = 'documentCorrections';

/**
 * Minimal structural surface firestoreStore.ts needs. The Admin SDK
 * implementation is created lazily; unit tests inject an in-memory fake via
 * setDocumentStoreBackendForTests — no network, no firebase-admin import.
 */
export interface DocumentStoreBackend {
  getDoc(collection: string, id: string): Promise<Record<string, unknown> | null>;
  getDocsAll(collection: string): Promise<Array<{ id: string; data: Record<string, unknown> }>>;
  /** `in` query over up to FIRESTORE_QUERY_BATCH statuses/fields. */
  getDocsWhereIn(collection: string, field: string, values: string[]): Promise<Array<{ id: string; data: Record<string, unknown> }>>;
  /** Most recent document by an ISO-timestamp field (for /jobs-latest). */
  getLatest(collection: string, orderField: string): Promise<Record<string, unknown> | null>;
  setDoc(collection: string, id: string, data: unknown): Promise<void>;
  deleteDoc(collection: string, id: string): Promise<void>;
  getSubDoc(collection: string, parentId: string, sub: string, id: string): Promise<Record<string, unknown> | null>;
  setSubDoc(collection: string, parentId: string, sub: string, id: string, data: unknown): Promise<void>;
  getSubDocs(collection: string, parentId: string, sub: string): Promise<Array<{ id: string; data: Record<string, unknown> }>>;
}

let testBackendOverride: DocumentStoreBackend | null = null;

export function setDocumentStoreBackendForTests(backend: DocumentStoreBackend | null): void {
  testBackendOverride = backend;
}

export function getDocumentStoreBackend(): DocumentStoreBackend | null {
  if (testBackendOverride) return testBackendOverride;
  return null;
}

/**
 * Credential detection only — never reads anything else, never logs any key
 * material (only the boolean outcome below). A malformed
 * FIREBASE_SERVICE_ACCOUNT_JSON is treated as NOT configured so the safe
 * local disk mode always wins over a half-broken cold start.
 */
export function hasServiceAccountCredentials(): boolean {
  if (testBackendOverride) return true;
  const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (rawJson && rawJson.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(rawJson) as Record<string, unknown>;
      return Boolean(parsed.client_email && parsed.private_key);
    } catch {
      return false;
    }
  }
  const keyPath = process.env.FIREBASE_SERVICE_ACCOUNT_KEY_PATH;
  if (keyPath && keyPath.trim().length > 0) {
    try {
      if (fs.existsSync(keyPath)) {
        const parsed = JSON.parse(fs.readFileSync(keyPath, 'utf-8')) as Record<string, unknown>;
        return Boolean(parsed.client_email && parsed.private_key);
      }
    } catch {
      return false;
    }
  }
  return false;
}

/** FAST-PATH rule from the mission: real credentials AND (Vercel OR emulator). */
export function isFirestoreDocumentModeRequested(): boolean {
  if (process.env.FIRESTORE_DOCUMENT_ARCHIVE === '0') return false; // explicit opt-out
  if (!hasServiceAccountCredentials()) return false;
  return Boolean(process.env.VERCEL || process.env.FIRESTORE_EMULATOR_HOST);
}

/** Full structural job shape sanitizer for Firestore round-trips. */
export function sanitizeFirestoreValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Prepare the Firestore COPY of a job: clone, cap logs, guard doc size. */
export function buildFirestoreJobDoc(job: BatchProcessingJob): Record<string, unknown> {
  const clone: any = JSON.parse(JSON.stringify(job));
  if (Array.isArray(clone.logs) && clone.logs.length > FIRESTORE_JOB_LOG_CAP) {
    clone.logs = clone.logs.slice(-FIRESTORE_JOB_LOG_CAP);
  }
  const json = JSON.stringify(clone);
  if (json.length <= FIRESTORE_JOB_DOC_CEILING) return clone;
  // Engineered fallback for pathologically large jobs: keep the counters and
  // identity, drop telemetry arrays from the shared copy (memory keeps both).
  return {
    ...clone,
    logs: Array.isArray(clone.logs) ? clone.logs.slice(-10) : [],
    files: [],
    firestoreTelemetryTruncated: true,
  };
}

/** Split an oversized base64 payload into chunk records (pure; unit-tested). */
export function planChunkSplit(
  base64: string,
  header: Record<string, unknown>
): { chunked: boolean; firstDoc?: Record<string, unknown>; chunks?: Array<{ seq: number; payload: string }> } {
  if (base64.length <= PAGE_BLOB_SAFE_CEILING) {
    return { chunked: false, firstDoc: { ...header, base64, chunkCount: 0 } };
  }
  const payloadCap = PAGE_BLOB_CHUNK_PAYLOAD_CEILING;
  const chunks: Array<{ seq: number; payload: string }> = [];
  for (let offset = 0; offset < base64.length; offset += payloadCap) {
    chunks.push({ seq: chunks.length, payload: base64.slice(offset, offset + payloadCap) });
  }
  return {
    chunked: true,
    firstDoc: { ...header, chunkCount: chunks.length, size: base64.length },
    chunks,
  };
}

/** Reassemble a chunked page blob (pure; unit-tested). */
export function reassemblePageBlob(doc: Record<string, unknown>): { base64: string; size: number } | null {
  if (typeof doc.base64 === 'string' && doc.base64.length > 0) {
    return { base64: doc.base64, size: Number(doc.size) || Buffer.byteLength(doc.base64, 'base64') };
  }
  const count = Number(doc.chunkCount) || 0;
  if (count <= 0 || !Array.isArray(doc.chunks)) return null;
  const parts = doc.chunks
    .map((c: any) => ({ seq: Number(c?.seq) || 0, payload: String(c?.payload || '') }))
    .sort((a, b) => a.seq - b.seq);
  if (parts.length !== count) return null;
  const base64 = parts.map((p) => p.payload).join('');
  return { base64, size: Number(doc.size) || Buffer.byteLength(base64, 'base64') };
}

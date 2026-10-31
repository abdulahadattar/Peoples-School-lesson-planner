/**
 * Firestore orchestration for the document archive (C6 — schema and design
 * rationale live in firestoreBackend.ts; this module is the store seam and stays
 * under the 350-LOC rule by sharing firestorePageBlobs/firestoreConnection).
 *
 * Activation contract (FAST-PATH): in-memory stores stay the per-process
 * cache; Firestore is the source of truth, hydrated lazily per instance on
 * the first request (hydrateDocumentStores — non-terminal jobs from a status
 * `in` query + the whole documentRecords/dossiers/dismissedFlags sets), every
 * mutation dispatches an idempotent key-level setDoc immediately, and the
 * serverless res.json guard awaits commitDocumentStoreWrites() so all writes
 * are durable ahead of the HTTP response. Unknown job ids get a single
 * ensureJobLoaded() round-trip (negative-result cached), which is what makes
 * create-job on instance A visible to finalize-job on instance B — the
 * multi-instance failure this task fixes.
 */
import type { BatchProcessingJob } from '../../types/documentArchive';
import { JOBS_COLLECTION, buildFirestoreJobDoc, sanitizeFirestoreValue, setDocumentStoreBackendForTests } from './firestoreBackend.js';
import {
  commitDocumentStoreWrites,
  dispatchTrackedDelta,
  resetFirestoreTracking,
  seedFirestoreSnapshot,
  trackStore,
  type FirestoreWriter,
  type TrackedStoreKind,
} from './firestoreTracking.js';
import { activateFirestoreDocumentStoreIfConfigured, getFirestoreBackend } from './firestoreConnection.js';
import { applyInterruptedJobState } from './queueMath.js';

/**
 * FIX-4b in the shared-store world: a non-terminal Firestore job is NOT
 * necessarily orphaned — it may be mid-flight on a LIVE sibling instance. A
 * hydrate-time Firestore sweep may therefore only cap jobs older than this
 * staleness window (no live upload runs longer than minutes; the client's
 * amber "record unavailable" state covers shorter poll misses).
 */
const FIRESTORE_SWEEP_STALENESS_MS = 20 * 60 * 1000;

function isStaleOrphan(job: BatchProcessingJob): boolean {
  const started = Date.parse(job.startedAt || '');
  if (!Number.isFinite(started)) return false;
  return Date.now() - started > FIRESTORE_SWEEP_STALENESS_MS;
}

export { isFirestoreStoreActive } from './firestoreConnection.js';
export { commitDocumentStoreWrites, resetFirestoreTracking, setDocumentStoreBackendForTests } ;

interface StoreBindings {
  raw(kind: TrackedStoreKind): Record<string, unknown>;
  rebind(kind: TrackedStoreKind, proxy: Record<string, unknown>): void;
}

let bindings: StoreBindings | null = null;
let hydratePromise: Promise<void> | null = null;
let hydrationStarted = false;
const negativeJobIds = new Set<string>();

const COLLECTIONS: Record<Exclude<TrackedStoreKind, 'jobs'>, string> = {
  records: 'documentRecords',
  dossiers: 'dossiers',
  flags: 'dismissedFlags',
  corrections: 'documentCorrections',
};

function collectionForKind(kind: TrackedStoreKind): string {
  return kind === 'jobs' ? JOBS_COLLECTION : COLLECTIONS[kind as Exclude<TrackedStoreKind, 'jobs'>];
}

function firestoreWriter(): FirestoreWriter | null {
  if (!bindings) return null;
  return {
    async setKey(kind, id, data) {
      const backend = await getFirestoreBackend();
      if (backend) await backend.setDoc(collectionForKind(kind), id, data);
    },
    async deleteKey(kind, id) {
      const backend = await getFirestoreBackend();
      if (backend) await backend.deleteDoc(collectionForKind(kind), id);
    },
  };
}

/** prepareDoc callback for dispatchTrackedDelta (undefined-dropping + caps). */
function prepareFirestoreDoc(kind: TrackedStoreKind, _id: string, value: unknown): Record<string, unknown> {
  const clone = sanitizeFirestoreValue(value) as Record<string, unknown>;
  if (kind === 'jobs') return buildFirestoreJobDoc(clone as unknown as BatchProcessingJob);
  // booleans must ride inside a doc-shaped value (Firestore has no scalars).
  if (kind === 'flags') return { value: Boolean(value) };
  return clone;
}

/** Called from store.ts saveStores() on every mutation in Firestore mode. */
export function dispatchFirestoreDelta(): void {
  dispatchTrackedDelta(firestoreWriter(), prepareFirestoreDoc);
}

/**
 * store.ts calls this once at module init, before the FIX-4b sweep: it
 * activates Firestore mode (credentials + VERCEL/emulator only) and wraps the
 * exported store records in candidate-tracking proxies.
 */
export function bindFirestoreDocumentStores(bind: StoreBindings): void {
  if (!activateFirestoreDocumentStoreIfConfigured()) return;
  bindings = bind;
  for (const kind of ['jobs', 'records', 'dossiers', 'flags', 'corrections'] as TrackedStoreKind[]) {
    bind.rebind(kind, trackStore(kind));
  }
}

/**
 * Hydrate this instance from Firestore (single-flight; awaited at the entry
 * of every serverless request through the res guard). After loading, the
 * FIX-4b restart sweep runs against the hydrated jobs — but ONLY stale ones
 * (FIRESTORE_SWEEP_STALENESS_MS): with a shared store a non-terminal job can
 * legitimately be mid-flight on a sibling instance.
 */
export async function hydrateDocumentStores(): Promise<void> {
  if (!bindings) return;
  if (hydrationStarted) return hydratePromise ?? undefined;
  hydrationStarted = true;
  hydratePromise = (async () => {
    try {
      const backend = await getFirestoreBackend();
      if (!backend) return;
      const jobs = bindings!.raw('jobs');
      const [liveJobs, latestJob, recordDocs, dossierDocs, flagDocs, correctionDocs] = await Promise.all([
        backend.getDocsWhereIn(JOBS_COLLECTION, 'status', ['uploading', 'processing']),
        backend.getLatest(JOBS_COLLECTION, 'startedAt'),
        backend.getDocsAll(COLLECTIONS.records),
        backend.getDocsAll(COLLECTIONS.dossiers),
        backend.getDocsAll(COLLECTIONS.flags),
        backend.getDocsAll(COLLECTIONS.corrections),
      ]);
      const sweepTargets: string[] = [];
      for (const docLike of [...liveJobs, ...(latestJob ? [latestJob] : [])]) {
        const seedData = sanitizeFirestoreValue(docLike) as unknown as BatchProcessingJob;
        if (!seedData?.id) continue;
        jobs[seedData.id] = seedData;
        // C6 sweep: with the shared store a non-terminal job may be mid-
        // flight on a LIVE sibling instance — only cap stale ones (and let
        // the terminal job objects pass straight through).
        if ((seedData.status === 'processing' || seedData.status === 'uploading') && isStaleOrphan(seedData)) {
          sweepTargets.push(seedData.id);
        }
      }
      for (const { id, data } of recordDocs) bindings!.raw('records')[id] = data;
      for (const { id, data } of dossierDocs) bindings!.raw('dossiers')[id] = data;
      for (const { id, data } of flagDocs) bindings!.raw('flags')[id] = Boolean((data as any)?.value);
      for (const { id, data } of correctionDocs) bindings!.raw('corrections')[id] = data;

      // Seed snapshots from what Firestore already holds so hydrated keys
      // never re-emit writes; then cap interrupted jobs and dispatch.
      for (const kind of ['jobs', 'records', 'dossiers', 'flags', 'corrections'] as TrackedStoreKind[]) {
        seedFirestoreSnapshot(kind, bindings!.raw(kind));
      }
      for (const jobId of sweepTargets) {
        const orphan = jobs[jobId] as BatchProcessingJob | undefined;
        if (orphan) applyInterruptedJobState(orphan);
      }
      dispatchFirestoreDelta();
      await commitDocumentStoreWrites();
    } catch (err) {
      console.error('[documentArchiveFirestore] hydration failed; serving from memory:', (err as Error)?.message);
    }
  })();
  return hydratePromise;
}/**
 * Per-key lazy load for jobs the hydrate's `in` query skipped (terminal or
 * created on another instance after hydrate). Unknown ids are negative-
 * cached forever — job ids are single-shot UUID fragments.
 */
export async function ensureJobLoaded(jobId: string): Promise<void> {
  if (!bindings || !jobId || negativeJobIds.has(jobId)) return;
  if (bindings.raw('jobs')[jobId] !== undefined) return;
  await hydrateDocumentStores();
  if (bindings.raw('jobs')[jobId] !== undefined) return;
  const backend = await getFirestoreBackend();
  if (!backend) return;
  try {
    const data = await backend.getDoc(JOBS_COLLECTION, jobId);
    if (!data) { negativeJobIds.add(jobId); return; }
    const job = sanitizeFirestoreValue(data) as unknown as BatchProcessingJob;
    job.id = job.id || jobId;
    bindings.raw('jobs')[jobId] = job;
    seedFirestoreSnapshot('jobs', { [jobId]: job });
  } catch (err) {
    console.error('[documentArchiveFirestore] lazy job load failed:', (err as Error)?.message);
  }
}

export { loadStoredScanBytesForRoute, persistPageImage, writeRecordScanBytes, loadRecordScanBytes, deleteStoredPageBytes } from './firestorePageBlobs.js';

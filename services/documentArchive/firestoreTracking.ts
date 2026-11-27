/**
 * Repair-free write-through for the Firestore-backed document stores (C6).
 *
 * Every documentArchive mutation follows the same shape: read an entry from
 * the store record, mutate it (or add/delete it), then call saveStores().
 * That shape lets a Proxy on the OUTER store record observe the candidate
 * keys — get/ownKeys mark reads, set/deleteProperty mark writes/removals —
 * so saveStores() only ever re-serializes entries that were recently touched
 * instead of the whole archive on every call (a full collection diff per
 * processed page became quadratic fast; the read-candidate heuristic is
 * precise for the actual call sites, see grep documentsStore\[ | .
 * dossiersStore\[]).
 *
 * Semantics:
 *  - Firestore is the source of truth; this module only knows key-level
 *    dirtiness. Firestore writes fire immediately as un-awaited tasks and are
 *    tracked; commitDocumentStoreWrites() awaits every outstanding one — the
 *    serverless res.json guard calls it so all writes are durable ahead of
 *    the HTTP response (no debounce in this mode).
 *  - Every write is a full, idempotent per-key setDoc (deterministic ids:
 *    jobId / docId / grNo / flagId) — safe to retry and to replay after a
 *    crash; deletes are idempotent deleteDocs.
 *  - values are JSON round-tripped before writing so Firestore-undefined
 *    fields become absent keys.
 */
import { sanitizeFirestoreValue, type DocumentStoreBackend } from './firestoreBackend.js';

export type TrackedStoreKind = 'jobs' | 'records' | 'dossiers' | 'flags' | 'corrections';

/** Writes a prepared, idempotent key-level document (or removes it). */
export interface FirestoreWriter {
  setKey(kind: TrackedStoreKind, id: string, data: unknown): Promise<void>;
  deleteKey(kind: TrackedStoreKind, id: string): Promise<void>;
}

interface StoreTracker {
  target: Record<string, unknown>;
  candidates: Map<string, 'changed' | 'missing'>;
  /** Firestore-side serialization per key; hydrate seeds it. */
  snapshot: Map<string, string>;
}

const trackers = new Map<TrackedStoreKind, StoreTracker>();

const outstandingWrites = new Set<Promise<void>>();
let writeErrorLoggedAt = 0;

function trackerFor(kind: TrackedStoreKind): StoreTracker | null {
  return trackers.get(kind) ?? null;
}

function note(kind: TrackedStoreKind, id: string, state: 'changed' | 'missing') {
  const t = trackers.get(kind);
  if (!t || typeof id !== 'string') return;
  t.candidates.set(id, state);
}

/**
 * Wrap one exported store record so candidates are observed. The raw target
 * stays the source of truth for reads; hydrate writes into it directly and
 * seeds snapshots, so swept/hydrated keys do not re-emit writes.
 */
export function trackStore(kind: TrackedStoreKind): Record<string, unknown> {
  const existing = trackerFor(kind);
  const tracker: StoreTracker = existing ?? {
    target: {},
    candidates: new Map(),
    snapshot: new Map(),
  };
  trackers.set(kind, tracker);
  const target = tracker.target;
  return new Proxy(target, {
    get(t, key) {
      if (typeof key === 'string') note(kind, key, 'changed');
      return Reflect.get(t, key);
    },
    has(t, key) {
      if (typeof key === 'string') note(kind, key, 'changed');
      return Reflect.has(t, key);
    },
    ownKeys(t) {
      for (const key of Object.keys(t)) note(kind, key, 'changed');
      return Reflect.ownKeys(t);
    },
    set(t, key, value) {
      if (typeof key === 'string') note(kind, key, 'changed');
      Reflect.set(t, key, value);
      return true;
    },
    deleteProperty(t, key) {
      if (typeof key === 'string') note(kind, key, 'missing');
      Reflect.deleteProperty(t, key);
      return true;
    },
  });
}

/** Seed a key-level snapshot after hydrate/load writes (no write emitted). */
export function seedFirestoreSnapshot(kind: TrackedStoreKind, entries: Record<string, unknown>): void {
  const tracker = trackers.get(kind);
  if (!tracker) return;
  for (const [id, value] of Object.entries(entries)) {
    tracker.snapshot.set(id, JSON.stringify(value));
  }
}

/** Drop snapshot + candidates (emulator/test teardown). */
export function resetFirestoreTracking(): void {
  trackers.clear();
  outstandingWrites.clear();
}

/**
 * Diff candidate keys against the snapshots and dispatch writes. Returns how
 * many Firestore writes were queued (0 in non-Firestore modes).
 */
export function dispatchTrackedDelta(
  writer: FirestoreWriter | null,
  prepareDoc: (kind: TrackedStoreKind, id: string, data: unknown) => Record<string, unknown>
): number {
  if (!writer) return 0;
  let queued = 0;
  for (const [kind, tracker] of trackers) {
    if (tracker.candidates.size === 0) continue;
    const candidateKeys = [...tracker.candidates];
    tracker.candidates.clear();
    for (const [id, state] of candidateKeys) {
      if (state === 'missing') {
        if (!tracker.snapshot.has(id)) continue;
        tracker.snapshot.delete(id);
        queueWrite(writer.deleteKey(kind, id));
        queued++;
        continue;
      }
      const live = tracker.target[id];
      if (live === undefined) continue; // vanished between read and diff
      const json = JSON.stringify(live);
      if (tracker.snapshot.get(id) === json) continue;
      tracker.snapshot.set(id, json);
      queueWrite(writer.setKey(kind, id, prepareDoc(kind, id, live)));
      queued++;
    }
  }
  return queued;
}

function queueWrite(promise: Promise<void>): void {
  const tracked = promise.then(
    () => { outstandingWrites.delete(tracked); },
    (err) => {
      outstandingWrites.delete(tracked);
      const now = Date.now();
      if (now - writeErrorLoggedAt > 30_000) {
        writeErrorLoggedAt = now;
        console.error('[documentArchiveFirestore] write-through failed:', (err as Error)?.message);
      }
    }
  );
  outstandingWrites.add(tracked);
}

/** Resolves once every Firestore write dispatched here is settled. */
export async function commitDocumentStoreWrites(): Promise<void> {
  const pending = [...outstandingWrites];
  await Promise.allSettled(pending);
}

/** Test-only: expose raw target so hydrate can bypass the proxy. */
export function rawTrackedTarget(kind: TrackedStoreKind): Record<string, unknown> | null {
  return trackers.get(kind)?.target ?? null;
}

export type { DocumentStoreBackend };

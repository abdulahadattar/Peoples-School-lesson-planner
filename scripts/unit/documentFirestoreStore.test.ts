/**
 * Firestore durable-store adapter logic (C6) — pure pieces only, driven by a
 * thin in-memory fake (no network, no firebase-admin import).
 *
 * Covers what can be verified without a live Firestore: the FAST-PATH
 * activation rule, job-doc preparation (log cap + size guard), undefined
 * sanitization, the page-blob chunk math (ceiling constants are part of the
 * contract), and the candidate-tracking write-through (idempotent per key,
 * deletions, commit bookkeeping).
 *
 * End-to-end cross-instance behavior (create on instance A visible to
 * finalize on instance C) needs a REAL Firestore — see
 * scripts/unit/documentFirestoreInstances.test.ts, which runs only when a
 * Firestore emulator is reachable (skipped here: Java 11+ is not installed
 * on this machine, and firebase-tools was deliberately not added).
 *
 * Run: npm run test:unit (aggregated by scripts/unit-tests.ts)
 */
import assert from 'node:assert/strict';
import {
  FIRESTORE_JOB_DOC_CEILING,
  FIRESTORE_JOB_LOG_CAP,
  PAGE_BLOB_CHUNK_PAYLOAD_CEILING,
  PAGE_BLOB_SAFE_CEILING,
  buildFirestoreJobDoc,
  hasServiceAccountCredentials,
  isFirestoreDocumentModeRequested,
  planChunkSplit,
  reassemblePageBlob,
  sanitizeFirestoreValue,
} from '../../services/documentArchive/firestoreBackend.js';
import {
  commitDocumentStoreWrites,
  dispatchTrackedDelta,
  resetFirestoreTracking,
  seedFirestoreSnapshot,
  trackStore,
  type FirestoreWriter,
} from '../../services/documentArchive/firestoreTracking.js';

type Harness = {
  describe: (name: string) => void;
  it: (name: string, fn: () => void) => void;
  eq: (actual: unknown, expected: unknown, msg?: string) => void;
};

const eq: (a: unknown, b: unknown, msg?: string) => void = assert.deepStrictEqual;
const ok = (v: unknown, msg?: string) => assert(v, msg);

/** Valid-SHAPED service account fixture (cred detection checks 2 fields). */
const SERVICE_ACCOUNT_FIXTURE = JSON.stringify({
  client_email: 'document-archive@phssjportal.iam.gserviceaccount.com',
  private_key: '-----BEGIN PRIVATE KEY-----AAAA----END PRIVATE KEY-----\n',
});

/** Deterministic env sandbox for activation tests. */
function withEnv(overrides: Record<string, string | null>, fn: () => void): void {
  const touched = ['GEMINI_API_KEY', 'VERCEL', 'FIRESTORE_EMULATOR_HOST', 'FIREBASE_SERVICE_ACCOUNT_JSON', 'FIREBASE_SERVICE_ACCOUNT_KEY_PATH', 'FIRESTORE_DOCUMENT_ARCHIVE'];
  const saved: Record<string, string | undefined> = {};
  for (const k of touched) {
    saved[k] = process.env[k];
    const v = overrides[k];
    if (v === null) delete process.env[k];
    else if (v !== undefined) process.env[k] = v;
  }
  try {
    fn();
  } finally {
    for (const k of touched) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

function makeJob(overrides: Partial<any> = {}): any {
  return {
    id: 'jobc6a', totalFiles: 1, processedFiles: 0, remainingFiles: 1,
    flaggedCount: 0, duplicateCount: 0, failedCount: 0, successCount: 0,
    status: 'processing', logs: [], files: [],
    startedAt: new Date().toISOString(),
    ...overrides,
  };
}

export function runDocumentFirestoreStoreTests(h: Harness) {
  const { describe, it } = h;

  describe('documentFirestore: FAST-PATH activation');
  it('is inactive without any credentials, even on VERCEL', () => {
    withEnv({ VERCEL: '1', FIRESTORE_EMULATOR_HOST: null }, () => {
      eq(isFirestoreDocumentModeRequested(), false);
      eq(hasServiceAccountCredentials(), false);
    });
  });
  it('is inactive for an OAuth web-client secret (NOT service-account material)', () => {
    withEnv({ FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({ client_id: '752785162701.apps.googleusercontent.com', client_secret: 'x' }) }, () => {
      eq(isFirestoreDocumentModeRequested(), false);
    });
  });
  it('is inactive on malformed credential JSON (safe fallback to disk mode)', () => {
    withEnv({ FIREBASE_SERVICE_ACCOUNT_JSON: '{not json', VERCEL: '1' }, () => {
      eq(isFirestoreDocumentModeRequested(), false);
    });
  });
  it('is inactive with credentials but neither VERCEL nor the emulator (local ./data path intact)', () => {
    withEnv({ FIREBASE_SERVICE_ACCOUNT_JSON: SERVICE_ACCOUNT_FIXTURE, VERCEL: null, FIRESTORE_EMULATOR_HOST: null }, () => {
      eq(isFirestoreDocumentModeRequested(), false);
    });
  });
  it('activates with credentials on VERCEL', () => {
    withEnv({ FIREBASE_SERVICE_ACCOUNT_JSON: SERVICE_ACCOUNT_FIXTURE, VERCEL: '1', FIRESTORE_DOCUMENT_ARCHIVE: null }, () => {
      eq(isFirestoreDocumentModeRequested(), true);
    });
  });
  it('activates with credentials when the Firestore emulator is configured', () => {
    withEnv({ FIREBASE_SERVICE_ACCOUNT_JSON: SERVICE_ACCOUNT_FIXTURE, VERCEL: null, FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080' }, () => {
      eq(isFirestoreDocumentModeRequested(), true);
    });
  });
  it('honours FIRESTORE_DOCUMENT_ARCHIVE=0 as an explicit opt-out', () => {
    withEnv({ FIREBASE_SERVICE_ACCOUNT_JSON: SERVICE_ACCOUNT_FIXTURE, VERCEL: '1', FIRESTORE_DOCUMENT_ARCHIVE: '0' }, () => {
      eq(isFirestoreDocumentModeRequested(), false);
    });
  });
  it('rejects a non-service-account JSON file at FIREBASE_SERVICE_ACCOUNT_KEY_PATH', () => {
    withEnv({ FIREBASE_SERVICE_ACCOUNT_JSON: null, FIREBASE_SERVICE_ACCOUNT_KEY_PATH: './firestore.rules', VERCEL: '1' }, () => {
      eq(isFirestoreDocumentModeRequested(), false);
      eq(hasServiceAccountCredentials(), false);
    });
  });

  describe('documentFirestore: buildFirestoreJobDoc');
  it('caps the Firestore copy logs at the ring-buffer limit (memory keeps 300)', () => {
    const logs = Array.from({ length: 150 }, (_, i) => ({ id: String(i), timestamp: 't', level: 'info', stage: 'UPLOAD', message: `m${i}` }));
    const doc = buildFirestoreJobDoc(makeJob({ logs }));
    eq((doc.logs as unknown[]).length, FIRESTORE_JOB_LOG_CAP);
    eq((doc.logs as any[]).at(-1)?.message, 'm149', 'cap must keep the newest entries');
    ok(JSON.stringify(doc).length <= FIRESTORE_JOB_DOC_CEILING);
  });
  it('drops undefined fields the Firestore client would reject', () => {
    const doc = buildFirestoreJobDoc(makeJob({
      files: [{ id: 'f1', grNo: '3021', originalFilename: 'a.png', fileSizeBytes: 5, stage: 'completed', status: 'success', progressPercent: 100, error: undefined, savedFilename: undefined }],
    }));
    const f = (doc.files as any[])[0];
    eq('error' in f, false, 'undefined error must not survive a Firestore round-trip');
    eq('savedFilename' in f, false);
    eq(f.fileSizeBytes, 5);
  });
  it('trims telemetry arrays out of the shared copy for pathologically large jobs', () => {
    const hugeFile = { id: 'big', grNo: '3021', originalFilename: 'a.png', fileSizeBytes: 4, stage: 'completed', status: 'success', progressPercent: 100, extractedData: { filler: 'x'.repeat(2_000_000) } };
    const doc: any = buildFirestoreJobDoc(makeJob({ files: [hugeFile] }));
    eq(doc.firestoreTelemetryTruncated, true, 'over-ceiling job must not attempt a >1MiB Firestore write');
    eq(doc.files.length, 0);
    eq(typeof doc.status, 'string');
    eq(doc.processedFiles, 0);
  });

  describe('documentFirestore: sanitizeFirestoreValue');
  it('is a JSON round-trip (undefined fields vanish)', () => {
    const src = { a: 1, b: undefined, c: [undefined, 2], d: { e: undefined, f: 'ok' } };
    eq(sanitizeFirestoreValue(src), { a: 1, c: [null, 2], d: { f: 'ok' } });
  });

  describe('documentFirestore: page-blob chunk math (ceilings are contract)');
  it('keeps a page under the ceiling whole and reassemblable', () => {
    const buffer = Buffer.alloc(1200, 7);
    const base64 = buffer.toString('base64');
    const plan = planChunkSplit(base64, { size: buffer.length });
    eq(plan.chunked, false);
    const assembled = reassemblePageBlob(plan.firstDoc!);
    ok(assembled);
    eq(assembled.size, buffer.length);
    eq(Buffer.from(assembled.base64, 'base64').toString('hex'), buffer.toString('hex'));
  });
  it('splits pages above the ceiling into ordered, capped chunk docs', () => {
    const big = Buffer.alloc(PAGE_BLOB_SAFE_CEILING + 10_000, 3).toString('base64');
    const plan = planChunkSplit(big, { size: big.length });
    eq(plan.chunked, true);
    const chunks = plan.chunks!;
    ok(chunks.length > 1, 'must split');
    for (const { seq, payload } of chunks) {
      ok(payload.length > 0);
      ok(payload.length <= PAGE_BLOB_CHUNK_PAYLOAD_CEILING, `chunk seq ${seq} over payload ceiling`);
    }
    eq(chunks.map((c) => c.seq), chunks.map((_, i) => i));
    eq((plan.firstDoc as any).chunkCount, chunks.length);
    eq('base64' in (plan.firstDoc as any), false, 'chunked page doc must not carry the full payload too');
    const assembled = reassemblePageBlob({ size: chunks.join('').length, chunkCount: chunks.length, chunks });
    ok(assembled);
    eq(assembled.base64, big, 'reassembly must reproduce the base64 in seq order');
  });
  it('rejects incomplete chunk sets during reassembly (reads tolerate missing docs)', () => {
    eq(reassemblePageBlob({ chunkCount: 3, chunks: [{ seq: 0, payload: 'a' }] }), null);
    eq(reassemblePageBlob({}), null);
    eq(reassemblePageBlob({ base64: '', chunkCount: 0 }), null);
  });

  describe('documentFirestore: write-through tracking (fake writer, idempotency)');
  it('dispatches one idempotent write per changed key and none for no-op changes', async () => {
    resetFirestoreTracking();
    const writes: string[] = [];
    const deletes: string[] = [];
    const writer: FirestoreWriter = {
      setKey: (kind, id) => { writes.push(`${kind}:${id}`); return Promise.resolve(); },
      deleteKey: (_kind, id) => { deletes.push(id); return Promise.resolve(); },
    };
    const prepare = (_kind: string, _id: string, value: any): Record<string, unknown> =>
      ({ value: Boolean(value.value) });
    const kind = 'flags' as const;

    const tracked = trackStore(kind);
    tracked['g-1'] = { value: true };
    seedFirestoreSnapshot(kind, JSON.parse(JSON.stringify({ 'g-1': { value: true } })));
    dispatchTrackedDelta(writer, prepare);
    await commitDocumentStoreWrites();
    eq(writes.length, 0, 'seeded snapshot must suppress redundant writes');

    tracked['g-2'] = { value: false };
    dispatchTrackedDelta(writer, prepare);
    await commitDocumentStoreWrites();
    eq(writes.length, 1, 'new key must dispatch');
    eq(writes[0], 'flags:g-2');

    (tracked['g-2'] as any).value = true; // read-then-mutate shape from the pipeline
    dispatchTrackedDelta(writer, prepare);
    await commitDocumentStoreWrites();
    eq(writes.length, 2, 'mutated key re-dispatches');

    delete tracked['g-2'];
    dispatchTrackedDelta(writer, prepare);
    await commitDocumentStoreWrites();
    eq(deletes.includes('g-2'), true, 'missing keys delete through the writer');

    resetFirestoreTracking();
  });
}

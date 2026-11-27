/**
 * Integration regression for the Vercel serverless document routes (C5).
 *
 * Drives the REAL Express app exported by api/index.ts — the entrypoint that
 * vercel.json routes /api/(.*) to — without any dev server, by lifting it
 * onto an ephemeral node:http listener (supertest-style).
 *
 * The module initializes api/index.ts inside a simulated Vercel runtime so
 * every serverless behavior under test is exercised exactly as deployed:
 *   - VERCEL=1            → documentArchive stores persist under /tmp in
 *                           'sync' mode (fixtures may land on D:\tmp\data on
 *                           a Windows dev box — outside this repo).
 *   - distinct Autonoma secrets (VERCEL makes IS_PRODUCTION true, and the
 *     entrypoint fails fast when secrets are missing).
 *   - no Gemini keys      → classification falls back to OTHER_UNCLASSIFIED.
 *
 * Flows asserted (mirroring services/documentClient/clientUpload.ts):
 *   1. create-job(expectedCount:1) → upload-single(png) → finalize-job →
 *      GET /documents/jobs/{jobId} shows status 'completed', totalFiles 1,
 *      processedFiles 1 with per-file telemetry — NOT a forever-'processing'
 *      stub (the production bug this regression pins).
 *   2. create-job → 2x upload-chunk → finalize-job → completed.
 *   3. GET /documents/jobs/undefined → JSON 404, never a 500.
 *   4. Every returned job carries BOTH id and jobId with the same value
 *      (the transparency modal reads id; the upload client reads jobId ?? id).
 *   5. Jobs file on disk is terminal after finalize (sync flush proof —
 *      the Lambda freezes right after the response).
 *
 * Run: npm run test:unit (aggregated by scripts/unit-tests.ts)
 */
import assert from 'node:assert/strict';
import http from 'node:http';

type Harness = {
  describe: (name: string) => void;
  itAsync: (name: string, fn: () => Promise<void> | void) => Promise<void>;
  eq: (actual: unknown, expected: unknown, msg?: string) => void;
};

export async function runApiDocumentRoutesTests(h: Harness) {
  const { describe, itAsync, eq } = h;

  /* Deterministic stub-free runtime: no Gemini keys anywhere. */
  for (const k of ['GEMINI_API_KEY', 'GEMINI_API_KEYS', 'VITE_API_KEY', 'VITE_API_KEYS']) {
    delete process.env[k];
  }
  process.env.VERCEL = '1';
  process.env.AUTONOMA_SHARED_SECRET = 'c5-integration-shared-secret';
  process.env.AUTONOMA_SIGNING_SECRET = 'c5-integration-signing-secret';

  const App = (await import('../../api/index')).default;
  const { JOBS_FILE } = await import('../../services/documentArchive/constants');

  const server = http.createServer(App as any);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const base = `http://127.0.0.1:${(server.address() as any).port}/api`;

  const post = async (p: string, body: unknown) => {
    const res = await fetch(`${base}${p}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  const get = async (p: string) => {
    const res = await fetch(`${base}${p}`);
    return { status: res.status, body: await res.json().catch(() => null) };
  };

  /** A fresh, uniquely-noised document-sized PNG per call (dedup-safe). */
  const makePng = async () => {
    const sharp = (await import('sharp')).default;
    const noise = Math.floor(Math.random() * 256);
    return sharp({
      create: { width: 420, height: 420, channels: 3, background: { r: 100 + noise, g: noise, b: 255 - noise } },
    }).png().toBuffer();
  };

  describe('apiDocumentRoutes (C5): schema parity of create-job');
  await itAsync('returns a job carrying both id and jobId, status uploading', async () => {
    const res = await post('/documents/create-job', { expectedCount: 1 });
    eq(res.status, 200);
    const job = res.body?.job;
    eq(typeof job?.id, 'string', 'job must have id (client modal reads it)');
    eq(job?.jobId, job?.id, 'jobId must alias id identically');
    eq(job?.status, 'uploading');
    /* createBatchJob seeds totalFiles with the client's expectedCount (the
       FIX-1a finalize recompute makes it authoritative before the queue
       drains — jobCompletionFlow.test.ts pins that). */
    eq(job?.totalFiles, 1);
    eq(job?.processedFiles, 0);
    eq(Array.isArray(job?.files), true);
  });

  describe('apiDocumentRoutes (C5): create → upload-single → finalize runs the pipeline to completion');
  await itAsync('finalize-job returns a terminal job and GET shows completed 1/1', async () => {
    const created = await post('/documents/create-job', { expectedCount: 1 });
    const jobId = created.body.job.jobId;

    const uploaded = await post('/documents/upload-single', {
      jobId, filename: 'scan420.png', base64Data: (await makePng()).toString('base64'),
    });
    eq(uploaded.status, 200, `upload-single must accept the file: ${JSON.stringify(uploaded.body)}`);

    const finalized = await post('/documents/finalize-job', { jobId });
    eq(finalized.status, 200);
    const fjob = finalized.body?.job;
    eq(fjob?.totalFiles, 1, 'one uploaded single file == one queue item');
    eq(fjob?.processedFiles, 1, 'pipeline must have run synchronously inside the request');
    eq(['completed', 'failed'].includes(fjob?.status), true, `terminal status, got "${fjob?.status}"`);
    eq(fjob?.status, 'completed', 'A clean no-key run must complete, not fail');
    const fileItem = fjob?.files?.[0];
    eq(fileItem?.status, 'success');
    eq(['OTHER_UNCLASSIFIED', 'IGNORED_NOISE'].includes(fileItem?.classification), true);
    eq(typeof fileItem?.grNo, 'string');

    const polled = await get(`/documents/jobs/${encodeURIComponent(jobId)}`);
    eq(polled.status, 200);
    eq(polled.body?.job?.status, 'completed', 'client polling must see a completed job');
    eq(polled.body?.job?.totalFiles, 1);
    eq(polled.body?.job?.processedFiles, 1);
    eq(polled.body?.job?.jobId, jobId, 'polled job must serve the jobId alias too');
  });

  describe('apiDocumentRoutes (C5): chunked upload flow');
  await itAsync('two chunks assemble, enqueue into the caller job, finalize completes', async () => {
    const created = await post('/documents/create-job', { expectedCount: 1 });
    const jobId = created.body.job.jobId;

    const png = await makePng();
    const mid = Math.floor(png.length / 2);
    const uploadId = `c5chunk_${Date.now()}_a`; // fixed, exactly like uploadFileInChunks
    const c1 = png.subarray(0, mid).toString('base64');
    const c2 = png.subarray(mid).toString('base64');

    const r1 = await post('/documents/upload-chunk', {
      uploadId, chunkIndex: 0, totalChunks: 2,
      chunkBase64: c1, filename: 'chunked420.png', jobId,
    });
    eq(r1.status, 200);
    eq(r1.body?.completed, false, 'non-final chunk must not declare completion');

    const r2 = await post('/documents/upload-chunk', {
      uploadId, chunkIndex: 1, totalChunks: 2,
      chunkBase64: c2, filename: 'chunked420.png', jobId,
    });
    eq(r2.status, 200);
    eq(r2.body?.completed, true, 'final chunk must report completion');
    eq(r2.body?.job?.jobId ?? r2.body?.job?.id, jobId, 'FIX-1b: chunk must land in the caller job');

    const finalized = await post('/documents/finalize-job', { jobId });
    const fjob = finalized.body?.job;
    eq(fjob?.totalFiles, 1);
    eq(fjob?.processedFiles, 1);
    eq(fjob?.status, 'completed');
  });

  describe('apiDocumentRoutes (C5): bad client state never 500s');
  await itAsync('GET /documents/jobs/undefined answers 404 JSON (poll guard pinned)', async () => {
    const res = await get('/documents/jobs/undefined');
    assert.notEqual(res.status, 500, 'a stub-era poll target must never produce a 500');
    eq(res.status, 404);
    eq(typeof res.body?.error, 'string');
  });

  describe('apiDocumentRoutes (C5): serverless persistence semantics');
  await itAsync('jobs store is flushed synchronously to disk (sync mode) before the response', async () => {
    const created = await post('/documents/create-job', { expectedCount: 1 });
    const jobId = created.body.job.jobId as string;
    await post('/documents/upload-single', {
      jobId, filename: 'flush420.png', base64Data: (await makePng()).toString('base64'),
    });
    await post('/documents/finalize-job', { jobId });

    /* VERCEL=1 routes all documentArchive files under /tmp — same layout. */
    const persisted = JSON.parse(await (await import('node:fs/promises')).readFile(JOBS_FILE, 'utf-8'));
    const job = persisted[jobId];
    eq(job?.status, 'completed', 'sync persistence: the frozen Lambda must leave a terminal job on disk');
    eq(job?.processedFiles, 1);
  });

  await new Promise<void>((resolve) => server.close(() => resolve()));
}

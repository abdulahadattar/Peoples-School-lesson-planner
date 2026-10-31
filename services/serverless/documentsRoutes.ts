/**
 * Serverless document routes — the api/index.ts entrypoint of the real
 * documentArchive pipeline (task C5).
 *
 * Why these live here and not in api/_lib: Vercel compiles every source file
 * under api/ as its own serverless function ("Keep route modules and shared
 * utilities outside the root api/ directory", vercel.com/docs/functions/
 * quickstart, retrieved 2026-10-30). Shared modules are fine anywhere in the
 * repo because Vercel's Node File Trace bundles every statically imported
 * file plus its node_modules (vercel.com/kb/guide/
 * how-can-i-use-files-in-serverless-functions, retrieved 2026-10-30) — so
 * importing services/documentArchive/* needs no vercel.json change.
 *
 * Behavior contract (identical shape to the live server, which mounts
 * services/routes/documentUploadRouter.ts + documentManageRouter.ts):
 *   - Responses carry the full BatchProcessingJob; `jobId` is aliased to `id`
 *     because the pre-C5 stub schema exposed only jobId and the client reads
 *     both (clientUpload: `initialJob.jobId ?? initialJob.id`; the
 *     transparency modal header reads id).
 *   - Serverless semantics: every request that enqueues or advances a job
 *     passes { awaitCompletion: true } so the queue drains to completion
 *     within the request (a Lambda freezes after the response), and the
 *     stores' VERCEL-default 'sync' persistence mode makes every step
 *     durable before it returns.
 */
import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import type { BatchProcessingJob } from '../../types/documentArchive';
import { createDocumentManageRouter } from '../routes/documentManageRouter.js';
import { DATA_DIR } from '../documentArchive/constants.js';
import {
  createBatchJob,
  addSingleFileToJob,
  finalizeBatchJob,
  handleChunkUpload,
  ingestUploadedArchive,
  ingestIndividualFiles,
  retryFailedDocumentsInJob,
  stopProcessingJob,
  getJobStatus,
  getLatestJob,
  flushStoresImmediately,
  drainProcessingQueue,
  documentsStore,
} from '../documentArchiveService.js';
// C6: Firestore durability guards (no-ops without service-account credentials).
import { documentStoreRequestGuards } from '../documentArchive/firestoreRequestGuards.js';
import { ensureJobLoaded, loadStoredScanBytesForRoute } from '../documentArchive/firestoreStore.js';
/** Serverless: the request must finish the pipeline, never hand it off. */
const AWAIT_COMPLETION = { awaitCompletion: true } as const;

function getDocumentApiKeys(): string[] {
  const rawKeys: string[] = [];
  if (process.env.GEMINI_API_KEY) rawKeys.push(process.env.GEMINI_API_KEY);
  if (process.env.GEMINI_API_KEYS) rawKeys.push(...process.env.GEMINI_API_KEYS.split(','));
  if (process.env.VITE_API_KEY) rawKeys.push(process.env.VITE_API_KEY);
  if (process.env.VITE_API_KEYS) rawKeys.push(...process.env.VITE_API_KEYS.split(','));
  return Array.from(new Set(rawKeys.map((k) => k.trim()).filter(Boolean)));
}

/** Schema parity: `jobId` always aliases `id` in serverless responses. */
function withJobId(job: BatchProcessingJob | null): any {
  if (!job) return job;
  return { ...job, jobId: job.id };
}

export function createServerlessDocumentRoutes(): Router {
  const router = Router();

  // C6 guard FIRST: hydrates the shared Firestore-backed stores before any
  // handler runs and awaits all write-throughs inside res.json. No-op
  // without Firestore credentials, so the local pipeline is untouched.
  router.use(documentStoreRequestGuards);

  router.post('/documents/create-job', (req, res) => {
    try {
      const { expectedCount = 0 } = req.body || {};
      const job = createBatchJob(Number(expectedCount) || 0);
      res.json({ ok: true, job: withJobId(job) });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  router.post('/documents/upload-single', async (req, res) => {
    try {
      const { jobId, filename, base64Data, grNo } = req.body || {};
      if (!jobId || !base64Data || !filename) {
        res.status(400).json({ error: 'jobId, filename, and base64Data are required' });
        return;
      }
      const buffer = Buffer.from(base64Data, 'base64');
      const result = await addSingleFileToJob(jobId, filename, buffer, grNo);
      // C6: the per-request queue is memory-only, while the JOB RECORD is
      // now shared across Lambda instances (Firestore). Process this upload
      // synchronously here — finalize may run on a DIFFERENT instance that
      // can never see this instance's queue items.
      await drainProcessingQueue(getDocumentApiKeys());
      flushStoresImmediately();
      res.json({ ok: true, jobId, filename, size: buffer.length, enqueued: result.enqueued, job: withJobId(result.job) });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  router.post('/documents/finalize-job', async (req, res) => {
    try {
      const { jobId } = req.body || {};
      if (!jobId) {
        res.status(400).json({ error: 'jobId is required' });
        return;
      }
      const job = await finalizeBatchJob(jobId, getDocumentApiKeys(), AWAIT_COMPLETION);
      res.json({ ok: true, job: withJobId(job) });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  router.post('/documents/upload-chunk', async (req, res) => {
    try {
      const { uploadId, chunkIndex, totalChunks, chunkBase64, filename, grNo, isZip, jobId } = req.body || {};
      if (!uploadId || chunkIndex === undefined || !totalChunks || !chunkBase64 || !filename) {
        res.status(400).json({ error: 'Missing required chunk parameters' });
        return;
      }
      const result = await handleChunkUpload(
        uploadId,
        Number(chunkIndex),
        Number(totalChunks),
        chunkBase64,
        filename,
        grNo,
        Boolean(isZip),
        getDocumentApiKeys(),
        typeof jobId === 'string' ? jobId : undefined,
        AWAIT_COMPLETION
      );
      flushStoresImmediately();
      res.json({ ok: true, uploadId, chunkIndex, totalChunks, completed: result.completed, job: withJobId(result.job ?? null) });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  router.post('/documents/upload-zip', async (req, res) => {
    try {
      const { base64Data, filename = 'upload.zip' } = req.body || {};
      if (!base64Data) {
        res.status(400).json({ error: 'base64Data is required' });
        return;
      }
      const buffer = Buffer.from(base64Data, 'base64');
      const job = await ingestUploadedArchive(buffer, filename, getDocumentApiKeys(), AWAIT_COMPLETION);
      res.json({ ok: true, job: withJobId(job) });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  router.post('/documents/upload-files', async (req, res) => {
    try {
      const { files } = req.body || {};
      if (!Array.isArray(files) || files.length === 0) {
        res.status(400).json({ error: 'files array is required' });
        return;
      }
      const fileBuffers = files.map((f: any) => ({
        filename: f.filename || 'doc.jpg',
        buffer: Buffer.from(f.base64Data, 'base64'),
        grNo: f.grNo,
      }));
      const job = await ingestIndividualFiles(fileBuffers, getDocumentApiKeys(), AWAIT_COMPLETION);
      res.json({ ok: true, job: withJobId(job) });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  router.get('/documents/jobs/:jobId', async (req, res) => {
    // C6: lazy per-key load — the job may have been created on another
    // instance after this one hydrated.
    await ensureJobLoaded(req.params.jobId);
    const job = getJobStatus(req.params.jobId);
    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }
    res.json({ ok: true, job: withJobId(job) });
  });

  router.get('/documents/jobs-latest', (_req, res) => {
    res.json({ ok: true, job: withJobId(getLatestJob()) });
  });

  router.post('/documents/jobs/:jobId/retry', async (req, res) => {
    try {
      const job = await retryFailedDocumentsInJob(req.params.jobId, getDocumentApiKeys(), AWAIT_COMPLETION);
      if (!job) {
        res.status(404).json({ error: 'Job not found' });
        return;
      }
      flushStoresImmediately();
      res.json({ ok: true, job: withJobId(job) });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  router.post('/documents/jobs/:jobId/stop', async (req, res) => {
    try {
      // C6: the job may live in the shared store only.
      await ensureJobLoaded(req.params.jobId);
      const success = stopProcessingJob(req.params.jobId);
      flushStoresImmediately();
      res.json({ ok: true, success, job: withJobId(getJobStatus(req.params.jobId)) });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Same contract as the live server; jobProcessor writes optimized scans to
  // DATA_DIR/GR_<gr>/ (which is /tmp/data/student_documents on Vercel),
  // identical to the path the pre-C5 stub served. C6: in Firestore mode a
  // fresh instance's /tmp cannot hold bytes it never processed — fall back
  // to the durable page blob before giving up.
  router.get('/documents/file/:grNo/:filename', async (req, res) => {
    try {
      const { grNo, filename } = req.params;
      const safeGr = path.basename(decodeURIComponent(grNo));
      const safeFilename = path.basename(decodeURIComponent(filename));
      const filePath = path.join(DATA_DIR, `GR_${safeGr}`, safeFilename);
      const ext = path.extname(safeFilename).toLowerCase();
      if (!filePath.startsWith(DATA_DIR) || !fs.existsSync(filePath)) {
        const blobBytes = await loadStoredScanBytesForRoute(
          (gr, fname) =>
            (Object.values(documentsStore) as Array<any>).find((d) => d.grNo === gr && d.filename === fname) ?? null,
          safeGr,
          safeFilename
        );
        if (!blobBytes) {
          res.status(404).send('File not found');
          return;
        }
        res.setHeader('Content-Type', 'image/jpeg');
        res.setHeader('Cache-Control', 'no-store');
        res.end(blobBytes);
        return;
      }
      const mime: Record<string, string> = {
        '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
        '.webp': 'image/webp', '.gif': 'image/gif', '.pdf': 'application/pdf',
      };
      res.setHeader('Content-Type', mime[ext] || 'application/octet-stream');
      res.setHeader('Cache-Control', 'no-store');
      fs.createReadStream(filePath).pipe(res);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Streaming ZIP export reads from disk; kept off the serverless path the
  // same way the pre-C5 stub was (NEEDS-DECISION: could now stream from /tmp).
  router.get('/documents/export-zip', (_req, res) => {
    res.status(400).json({ error: 'Export not available in serverless mode' });
  });

  // Everything else the client reads — dossiers, all-docs, audit-all,
  // discrepancies, assign/delete/rescan/reprocess — is the real manage
  // router, exactly the one services/app.ts mounts for the live server.
  router.use(createDocumentManageRouter(getDocumentApiKeys));

  return router;
}

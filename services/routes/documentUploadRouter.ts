import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import {
  createBatchJob,
  addSingleFileToJob,
  finalizeBatchJob,
  handleChunkUpload,
  ingestUploadedArchive,
  ingestIndividualFiles,
  getJobStatus,
  getLatestJob,
  retryFailedDocumentsInJob,
  stopProcessingJob,
  createArchiveZipStream,
} from '../documentArchiveService.js';

export function createDocumentUploadRouter(getDocumentApiKeys: () => string[]): Router {
  const router = Router();

  router.post('/documents/create-job', (req, res) => {
    try {
      const { expectedCount = 0 } = req.body || {};
      const job = createBatchJob(Number(expectedCount) || 0);
      res.json({ ok: true, job });
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
      res.json({ ok: true, ...result });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  router.post('/documents/finalize-job', (req, res) => {
    try {
      const { jobId } = req.body || {};
      if (!jobId) {
        res.status(400).json({ error: 'jobId is required' });
        return;
      }
      const keys = getDocumentApiKeys();
      const job = finalizeBatchJob(jobId, keys);
      res.json({ ok: true, job });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  router.post('/documents/upload-chunk', async (req, res) => {
    try {
      const { uploadId, chunkIndex, totalChunks, chunkBase64, filename, grNo, isZip } = req.body || {};
      if (!uploadId || chunkIndex === undefined || !totalChunks || !chunkBase64 || !filename) {
        res.status(400).json({ error: 'Missing required chunk parameters' });
        return;
      }
      const keys = getDocumentApiKeys();
      const result = await handleChunkUpload(
        uploadId,
        Number(chunkIndex),
        Number(totalChunks),
        chunkBase64,
        filename,
        grNo,
        Boolean(isZip),
        keys
      );
      res.json({ ok: true, ...result });
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
      const keys = getDocumentApiKeys();
      const job = await ingestUploadedArchive(buffer, filename, keys);
      res.json({ ok: true, job });
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
      const keys = getDocumentApiKeys();
      const job = await ingestIndividualFiles(fileBuffers, keys);
      res.json({ ok: true, job });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  router.get('/documents/jobs/:jobId', (req, res) => {
    const job = getJobStatus(req.params.jobId);
    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }
    res.json({ ok: true, job });
  });

  router.get('/documents/jobs-latest', (_req, res) => {
    const job = getLatestJob();
    res.json({ ok: true, job });
  });

  router.post('/documents/jobs/:jobId/retry', async (req, res) => {
    try {
      const keys = getDocumentApiKeys();
      const job = await retryFailedDocumentsInJob(req.params.jobId, keys);
      if (!job) {
        res.status(404).json({ error: 'Job not found' });
        return;
      }
      res.json({ ok: true, job });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  router.post('/documents/jobs/:jobId/stop', (req, res) => {
    try {
      const { jobId } = req.params;
      const success = stopProcessingJob(jobId);
      res.json({ ok: true, success, job: getJobStatus(jobId) });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  router.get('/documents/file/:grNo/:filename', (req, res) => {
    try {
      const { grNo, filename } = req.params;
      const decodedFilename = decodeURIComponent(filename);
      const decodedGr = decodeURIComponent(grNo);
      const safeFilename = path.basename(decodedFilename);
      const safeGr = path.basename(decodedGr);
      const filePath = path.join(process.cwd(), 'data', 'student_documents', `GR_${safeGr}`, safeFilename);

      if (!fs.existsSync(filePath)) {
        res.status(404).send('File not found');
        return;
      }

      const ext = path.extname(safeFilename).toLowerCase();
      let mimeType = 'image/jpeg';
      if (ext === '.png') mimeType = 'image/png';
      else if (ext === '.webp') mimeType = 'image/webp';
      else if (ext === '.pdf') mimeType = 'application/pdf';
      else if (ext === '.gif') mimeType = 'image/gif';
      else if (ext === '.svg') mimeType = 'image/svg+xml';

      res.setHeader('Content-Type', mimeType);
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      fs.createReadStream(filePath).pipe(res);
    } catch (err) {
      res.status(500).send((err as Error).message);
    }
  });

  router.get('/documents/export-zip', (req, res) => {
    try {
      const targetClass = (req.query.class as string) || 'ALL';
      const zipName =
        targetClass === 'ALL'
          ? 'PHSSJ_All_Students_Documents.zip'
          : `PHSSJ_Class_${targetClass}_Documents.zip`;

      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);

      const zipStream = createArchiveZipStream(targetClass);
      zipStream.pipe(res);
    } catch (err) {
      res.status(500).send((err as Error).message);
    }
  });

  return router;
}

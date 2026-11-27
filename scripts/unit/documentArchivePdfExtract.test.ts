import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { extractImagesFromPdf } from '../../services/documentArchive/imageProcessing';

type Harness = {
  describe: (name: string) => void;
  itAsync: (name: string, fn: () => Promise<void> | void) => Promise<void>;
  eq: (actual: unknown, expected: unknown, msg?: string) => void;
};

export async function runDocumentArchivePdfExtractTests(h: Harness) {
  const { describe, itAsync, eq } = h;

  describe('documentArchive.pdfExtractAndPipeline');

  await itAsync('extracts sequential page images from real sample student PDFs in public/assets/aistudio', async () => {
    const sampleFiles = ['65_d27c0255.pdf', '516_5668e648.pdf'];
    for (const file of sampleFiles) {
      const absPath = path.join(process.cwd(), 'public', 'assets', 'aistudio', file);
      if (!fs.existsSync(absPath)) continue;
      const buf = fs.readFileSync(absPath);
      const extracted = await extractImagesFromPdf(buf);
      eq(extracted.length >= 1, true, `${file} must extract at least 1 document image`);
      let prevPage = 0;
      for (const page of extracted) {
        eq(page.pageNumber >= prevPage, true, `${file} page order must be non-decreasing`);
        prevPage = page.pageNumber;
        const meta = await sharp(page.buffer).metadata();
        eq(meta.format, 'jpeg', `${file} p.${page.pageNumber} must decode as JPEG`);
        eq((meta.width || 0) >= 320 && (meta.height || 0) >= 320, true, `${file} p.${page.pageNumber} must skip icons`);
      }
    }
  });

  await itAsync('enqueues multi-page PDF into distinct page files without filename collisions and retains CS/CamScanner docs', async () => {
    const samplePath = path.join(process.cwd(), 'public', 'assets', 'aistudio', '65_d27c0255.pdf');
    if (!fs.existsSync(samplePath)) return;

    if (!process.env.VERCEL) process.env.VERCEL = '1';
    const { createBatchJob, addSingleFileToJob, finalizeBatchJob } = await import('../../services/documentArchive/jobIntake');
    const { documentsStore } = await import('../../services/documentArchive/store');

    const testGr = `65T${Date.now().toString().slice(-5)}`;
    const job = createBatchJob(1);
    const pdfBuf = fs.readFileSync(samplePath);
    const { enqueued } = await addSingleFileToJob(job.id, 'CS_CamScanner_65.pdf', pdfBuf, testGr);
    eq(enqueued >= 1, true, 'PDF must enqueue at least 1 page');

    const finalized = await finalizeBatchJob(job.id, [], { awaitCompletion: true });
    eq(finalized.status, 'completed');
    eq((finalized.unclassifiedCount || 0) >= enqueued, true, 'Missing keys must record unclassifiedCount honestly');

    const jobDocs = Object.values(documentsStore).filter((d) => d.jobId === job.id);
    eq(jobDocs.length, enqueued, 'Every extracted PDF page must create a unique persisted document record (no overwrites)');
    const uniqueFilenames = new Set(jobDocs.map((d) => d.filename));
    eq(uniqueFilenames.size, jobDocs.length, 'Every page must have a unique filename on disk');
    eq(jobDocs.every((d) => d.status === 'manual_review'), true, 'Offline AI saves pages in manual_review');
  });
}

const isDirect =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv.some((a) => a.includes('documentArchivePdfExtract.test'));

if (isDirect) {
  const { test, describe } = await import('node:test');
  await runDocumentArchivePdfExtractTests({
    describe: (name) => {
      describe(name, () => {});
    },
    itAsync: async (name, fn) => {
      await test(name, fn);
    },
    eq: (a, b, m) => assert.deepStrictEqual(a, b, m),
  });
}

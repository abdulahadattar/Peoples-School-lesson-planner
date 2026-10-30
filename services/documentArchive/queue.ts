/**
 * Document processing queue: the single place that pushes items into the
 * background queue and owns `totalFiles` accounting.
 *
 * FIX-1a invariant: `job.totalFiles` is a count of queue items enqueued for
 * that job, never the client's declared upload intent. Before this module the
 * per-file path seeded totalFiles with the client's expectedCount and then
 * added +1 per uploaded file, so an N-file batch ended at totalFiles = 2N and
 * the completion check in runBackgroundQueue could never fire. Every enqueue
 * path now goes through enqueueFileForJob, which accumulates exactly what it
 * pushes; finalizeBatchJob recomputes authoritative totals once before the
 * queue drains (services/documentArchive/queueMath.ts).
 *
 * This module imports imageProcessing (sharp) — jobProcessor still hosts
 * runBackgroundQueue / processSingleDocument so the AI-heavy execution stays
 * in one file.
 */
import crypto from 'crypto';
import path from 'path';
import AdmZip from 'adm-zip';
import type { BatchProcessingJob } from '../../types/documentArchive';
import { extractGrFromPath } from './nameMatching.js';
import { extractImagesFromPdf } from './imageProcessing.js';
import { addJobLog, updateJobFileItem, saveStores } from './store.js';

export interface QueueItem {
  id: string;
  jobId: string;
  grNo: string;
  originalFilename: string;
  sourceBuffer: Buffer;
  mimeType: string;
  bundleId?: string;
  sourceFilename?: string;
  pageNumber?: number;
  totalPages?: number;
}

export const processingQueue: QueueItem[] = [];

export function countQueuedForJob(jobId: string): number {
  return processingQueue.filter((q) => q.jobId === jobId).length;
}

export function isPdfFile(filename: string, buffer: Buffer): boolean {
  return (
    filename.toLowerCase().endsWith('.pdf') ||
    buffer.subarray(0, 5).toString('latin1').startsWith('%PDF-')
  );
}

export function isZipFile(filename: string, buffer: Buffer): boolean {
  return (
    filename.toLowerCase().endsWith('.zip') ||
    buffer.subarray(0, 4).toString('latin1').startsWith('PK\x03\x04')
  );
}

const DOC_ENTRY_RE = /\.(jpe?g|png|webp|pdf)$/i;

/**
 * Enqueue one uploaded file against `job`, splitting PDFs into per-page items
 * and ZIPs into per-entry items. Returns the number of queue items pushed.
 *
 * Invariant (FIX-1a): the only place `totalFiles` grows. Each pushed item adds
 * exactly 1, so totalFiles always equals the number of queue items ever
 * enqueued for the job.
 */
export async function enqueueFileForJob(
  job: BatchProcessingJob,
  filename: string,
  buffer: Buffer,
  grNo?: string,
  opts?: { fromZipEntry?: boolean }
): Promise<number> {
  // A standalone ZIP arriving through the per-file upload path unpacks into
  // the caller's job (the chunked ZIP route instead ingests into its own
  // self-contained job — see handleChunkUpload; ZIP-in-ZIP is not unpacked).
  if (!opts?.fromZipEntry && isZipFile(filename, buffer)) {
    return enqueueZipContents(job, filename, buffer, grNo);
  }

  const resolvedGr = grNo || extractGrFromPath(filename);

  // FIX-1c: PDFs are not images — sharp would reject the raw buffer at the
  // optimize stage. Split every embedded document image into its own queue
  // item, with the same telemetry pages the per-file path always used.
  if (isPdfFile(filename, buffer)) {
    const pages = await extractImagesFromPdf(buffer);
    if (pages.length > 0) {
      const bundleId = crypto.randomUUID().slice(0, 8);
      for (const page of pages) {
        processingQueue.push({
          id: crypto.randomUUID().slice(0, 8), jobId: job.id, grNo: resolvedGr,
          originalFilename: filename, sourceBuffer: page.buffer, mimeType: 'image/jpeg',
          bundleId, sourceFilename: filename, pageNumber: page.pageNumber, totalPages: pages.length,
        });
        // One telemetry entry per page, keyed by pageNumber — a single entry
        // keyed (filename, grNo) would be overwritten by every page.
        updateJobFileItem(job.id, filename, resolvedGr, {
          sourceFilename: filename,
          fileSizeBytes: page.buffer.length,
          totalPages: pages.length,
          stage: 'queued', status: 'pending', progressPercent: 0,
        }, page.pageNumber);
      }
      bumpJobTotals(job, pages.length);
      addJobLog(job.id, 'info', 'PDF_EXTRACT', `Split ${filename} into ${pages.length} page image(s)`, { filename, grNo: resolvedGr });
      return pages.length;
    }
    // Same message as the per-file path always logged; the raw file is then
    // enqueued below and will fail honestly in processSingleDocument.
    addJobLog(job.id, 'warn', 'PDF_EXTRACT', `No page images found in ${filename}; enqueuing raw file`, { filename, grNo: resolvedGr });
  }

  processingQueue.push({
    id: crypto.randomUUID().slice(0, 8), jobId: job.id, grNo: resolvedGr,
    originalFilename: filename, sourceBuffer: buffer, mimeType: 'image/jpeg',
  });
  updateJobFileItem(job.id, filename, resolvedGr, {
    fileSizeBytes: buffer.length, stage: 'queued', status: 'pending', progressPercent: 0,
  });
  bumpJobTotals(job, 1);
  return 1;
}

/** FIX-1a: the only mutation of totalFiles. 1 pushed queue item == +1. */
function bumpJobTotals(job: BatchProcessingJob, pushedCount: number): void {
  job.totalFiles = (job.totalFiles || 0) + pushedCount;
  job.remainingFiles = Math.max(0, job.totalFiles - (job.processedFiles || 0));
}

/** Unpack a ZIP buffer and enqueue every supported document entry. */
async function enqueueZipContents(
  job: BatchProcessingJob,
  filename: string,
  buffer: Buffer,
  grNo?: string
): Promise<number> {
  let entries: { entryName: string; data: Buffer }[] = [];
  try {
    entries = new AdmZip(buffer)
      .getEntries()
      .filter((e) => !e.isDirectory && !e.entryName.includes('__MACOSX') && DOC_ENTRY_RE.test(e.entryName))
      .map((e) => ({ entryName: e.entryName, data: e.getData() }));
  } catch (err: any) {
    addJobLog(job.id, 'warn', 'UPLOAD', `Could not unpack ${filename}: ${err.message}`, { filename });
    return 0;
  }
  let pushed = 0;
  for (const entry of entries) {
    pushed += await enqueueFileForJob(
      job,
      path.basename(entry.entryName),
      entry.data,
      extractGrFromPath(entry.entryName) || grNo,
      { fromZipEntry: true }
    );
  }
  if (pushed === 0) {
    addJobLog(job.id, 'warn', 'UPLOAD', `No supported document entries found in ${filename}`, { filename });
  } else {
    addJobLog(job.id, 'info', 'UPLOAD', `Unpacked ${pushed} document(s) from ${filename}`, { filename });
  }
  return pushed;
}

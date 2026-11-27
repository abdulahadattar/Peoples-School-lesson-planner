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
import { parseFolderGrInfo } from './nameMatching.js';
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
  folderName?: string;
  packetId?: string;
  parsedFolderGrNo?: string;
  preClassifiedAs?: 'portrait' | 'document';
  aiSkipped?: boolean;
}

export interface EnqueueFileMeta {
  fromZipEntry?: boolean;
  folderName?: string;
  packetId?: string;
  parsedFolderGrNo?: string;
  preClassifiedAs?: 'portrait' | 'document';
  aiSkipped?: boolean;
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
 */
export async function enqueueFileForJob(
  job: BatchProcessingJob,
  filename: string,
  buffer: Buffer,
  grNo?: string,
  opts?: EnqueueFileMeta
): Promise<number> {
  if (!opts?.fromZipEntry && isZipFile(filename, buffer)) {
    return enqueueZipContents(job, filename, buffer, grNo);
  }

  const folderParsed = parseFolderGrInfo(opts?.folderName || filename);
  const parsedFolderGrNo = opts?.parsedFolderGrNo || (grNo && grNo !== 'UNASSIGNED' ? grNo : folderParsed.grNo);
  const resolvedGr = grNo || parsedFolderGrNo || 'UNASSIGNED';
  const folderName = opts?.folderName || folderParsed.folderName;
  const packetId = opts?.packetId || (folderName ? `${job.id}_${folderName}` : undefined);

  if (isPdfFile(filename, buffer)) {
    const pages = await extractImagesFromPdf(buffer);
    if (pages.length > 0) {
      const bundleId = crypto.randomUUID().slice(0, 8);
      for (const page of pages) {
        processingQueue.push({
          id: crypto.randomUUID().slice(0, 8),
          jobId: job.id,
          grNo: resolvedGr,
          originalFilename: filename,
          sourceBuffer: page.buffer,
          mimeType: 'image/jpeg',
          bundleId,
          sourceFilename: filename,
          pageNumber: page.pageNumber,
          totalPages: pages.length,
          folderName,
          packetId: packetId || `pdf_${bundleId}`,
          parsedFolderGrNo,
        });
        updateJobFileItem(job.id, filename, resolvedGr, {
          sourceFilename: filename,
          folderName,
          packetId: packetId || `pdf_${bundleId}`,
          fileSizeBytes: page.buffer.length,
          totalPages: pages.length,
          stage: 'queued',
          status: 'pending',
          progressPercent: 0,
        }, page.pageNumber);
      }
      bumpJobTotals(job, pages.length);
      addJobLog(job.id, 'info', 'PDF_EXTRACT', `Split ${filename} into ${pages.length} page image(s)`, { filename, grNo: resolvedGr });
      return pages.length;
    }
    addJobLog(job.id, 'warn', 'PDF_EXTRACT', `No page images found in ${filename}; enqueuing raw file`, { filename, grNo: resolvedGr });
  }

  processingQueue.push({
    id: crypto.randomUUID().slice(0, 8),
    jobId: job.id,
    grNo: resolvedGr,
    originalFilename: filename,
    sourceBuffer: buffer,
    mimeType: 'image/jpeg',
    folderName,
    packetId,
    parsedFolderGrNo,
    preClassifiedAs: opts?.preClassifiedAs,
    aiSkipped: opts?.aiSkipped,
  });
  updateJobFileItem(job.id, filename, resolvedGr, {
    folderName,
    packetId,
    preClassifiedAs: opts?.preClassifiedAs,
    aiSkipped: opts?.aiSkipped,
    fileSizeBytes: buffer.length,
    stage: 'queued',
    status: 'pending',
    progressPercent: 0,
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
    const parsed = parseFolderGrInfo(entry.entryName);
    const entryGr = parsed.grNo !== 'UNASSIGNED' ? parsed.grNo : (grNo || 'UNASSIGNED');
    const folderKey = parsed.folderName || (entryGr !== 'UNASSIGNED' ? `GR_${entryGr}` : 'root');
    pushed += await enqueueFileForJob(
      job,
      path.basename(entry.entryName),
      entry.data,
      entryGr,
      {
        fromZipEntry: true,
        folderName: parsed.folderName,
        packetId: `${job.id}_${folderKey}`,
        parsedFolderGrNo: entryGr,
      }
    );
  }
  if (pushed === 0) {
    addJobLog(job.id, 'warn', 'UPLOAD', `No supported document entries found in ${filename}`, { filename });
  } else {
    addJobLog(job.id, 'info', 'UPLOAD', `Unpacked ${pushed} document(s) from ${filename}`, { filename });
  }
  return pushed;
}

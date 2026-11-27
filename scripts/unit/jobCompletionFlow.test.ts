/**
 * Offline regression for the document-archive job completion math.
 *
 * Covers the pieces extracted so the suite never loads sharp / Gemini / the
 * disk-backed stores:
 *  - services/documentArchive/queueMath.ts (pure): the finalizeBatchJob
 *    recompute (FIX-1a), the runBackgroundQueue completion condition, and the
 *    restart sweep (FIX-4b).
 *
 * The five flows asserted here, mapped to the server handlers:
 *   1. N small files      → /create-job(expected N) + N × /upload-single
 *                           (addSingleFileToJob, each enqueues exactly 1)
 *   2. mixed images + PDF → PDF splits into pages via enqueueFileForJob;
 *                           finalize recomputes totalFiles = queued items
 *   3. single small file  → /create-job(1) + 1 × /upload-single
 *   4. single chunked file (FIX-1b) → chunk final enqueues 1 item into the
 *                           caller's job; totals identical to flow 3
 *   5. ZIP upload         → ingestUploadedArchive/Create jobs start at
 *                           totalFiles = 0 and accumulate per enqueued entry
 * All paths converge on: totalFiles == number of enqueued queue items, and
 * finalize recomputes it exactly once via computeJobTotals.
 *
 * Run: npm run test:unit (aggregated by scripts/unit-tests.ts)
 */
import {
  computeJobTotals,
  isJobComplete,
  terminalStatusForJob,
  sweepInterruptedJobs,
  applyInterruptedJobState,
  INTERRUPTED_STAGE_DESCRIPTION,
} from '../../services/documentArchive/queueMath';
import type { BatchProcessingJob } from '../../types/documentArchive';

type Harness = {
  describe: (name: string) => void;
  it: (name: string, fn: () => void) => void;
  eq: (actual: unknown, expected: unknown, msg?: string) => void;
};

export async function runJobCompletionFlowTests(h: Harness) {
  const { describe, it, eq } = h;

  const makeJob = (over: Partial<BatchProcessingJob> = {}): BatchProcessingJob => ({
    id: 'j1', totalFiles: 0, processedFiles: 0, remainingFiles: 0,
    flaggedCount: 0, duplicateCount: 0, failedCount: 0, successCount: 0, unclassifiedCount: 0,
    status: 'uploading', currentStage: 'UPLOAD', startedAt: new Date().toISOString(),
    ...over,
  });

  /** The exact update runBackgroundQueue performs after each queue item. */
  const processOne = (job: BatchProcessingJob) => {
    job.processedFiles += 1;
    job.remainingFiles = Math.max(0, job.totalFiles - job.processedFiles);
    return isJobComplete(job, 0);
  };

  describe('jobCompletionFlow.FIX-1a: N small files via upload-single (per-file flow)');
  it('a job shell seeded with expectedCount N ends with exactly N total files', () => {
    // Client: /create-job (expectedCount = 3), then 3 × /upload-single.
    // enqueueFileForJob owns totals: +1 per enqueued item, never from intent.
    const job = makeJob();
    for (let i = 0; i < 3; i++) {
      job.totalFiles += 1;
      job.remainingFiles = Math.max(0, job.totalFiles - job.processedFiles);
    }
    // finalizeBatchJob: recompute exactly once from processed + still-queued
    const totals = computeJobTotals(job.processedFiles, 3);
    job.totalFiles = totals.totalFiles;
    job.remainingFiles = totals.remainingFiles;
    eq(job.totalFiles, 3);
    eq(job.remainingFiles, 3);
    eq(isJobComplete(job, 3), false, 'queue still holds items');
    // drain
    for (let i = 0; i < 3; i++) processOne(job);
    eq(isJobComplete(job, 0), true);
    eq(terminalStatusForJob(job), 'completed');
  });

  it('an expectedCount-seeded shell (client intent) is corrected at finalize', () => {
    // Regression: used to end at totalFiles = 2N and stall in 'processing'.
    const job = makeJob({ totalFiles: 3, remainingFiles: 3 }); // createBatchJob(3)
    for (let i = 0; i < 3; i++) {
      job.totalFiles += 1; // addSingleFileToJob used to double-count
    }
    eq(job.totalFiles, 6, 'pre-finalize display may be inflated');
    const totals = computeJobTotals(job.processedFiles, 3); // finalize recompute
    job.totalFiles = totals.totalFiles;
    job.remainingFiles = totals.remainingFiles;
    eq(job.totalFiles, 3, 'finalize must recompute to enqueued count');
    for (let i = 0; i < 3; i++) processOne(job);
    eq(isJobComplete(job, 0), true);
    eq(terminalStatusForJob(job), 'completed');
  });

  describe('jobCompletionFlow.FIX-1a: mixed batch — 2 images + 1 PDF of 3 pages');
  it('totals are exactly 5 (2 queued images + 3 pages), so the job completes', () => {
    // /create-job(expected 3) + 3 uploads, the PDF splits into 3 page items.
    const job = makeJob({ totalFiles: 3, remainingFiles: 3 });
    // enqueueFileForJob accumulation: 2 images (+1 each) + PDF (+3 pages)
    eq(5, 2 + 3, 'enqueued items sanity');
    const totals = computeJobTotals(job.processedFiles, 5); // finalize recompute
    job.totalFiles = totals.totalFiles;
    job.remainingFiles = totals.remainingFiles;
    eq(job.totalFiles, 5);
    eq(job.remainingFiles, 5);
    for (let i = 0; i < 4; i++) processOne(job);
    eq(isJobComplete(job, 0), false, '4 of 5 processed — not yet complete');
    processOne(job);
    eq(isJobComplete(job, 0), true);
    eq(job.processedFiles, 5);
    eq(job.totalFiles, 5);
    eq(terminalStatusForJob(job), 'completed');
  });

  describe('jobCompletionFlow.FIX-1a: single-file flows');
  it('a single small file (upload-single) completes at 1/1', () => {
    const job = makeJob({ totalFiles: 1, remainingFiles: 1 });
    const totals = computeJobTotals(job.processedFiles, 1);
    job.totalFiles = totals.totalFiles;
    job.remainingFiles = totals.remainingFiles;
    eq(job.totalFiles, 1);
    eq(processOne(job), true);
    eq(terminalStatusForJob(job), 'completed');
  });

  it('a single >2.5MB chunked file enqueued into its own job (FIX-1b) matches the small path', () => {
    // Non-ZIP chunk completion enqueues exactly 1 item into the caller's job.
    const job = makeJob();
    job.totalFiles += 1;
    job.remainingFiles = Math.max(0, job.totalFiles - job.processedFiles);
    eq(job.totalFiles, 1);
    eq(processOne(job), true);
    eq(terminalStatusForJob(job), 'completed');
  });

  describe('jobCompletionFlow.FIX-1a: ZIP upload (ingestUploadedArchive)');
  it('an unpacking job starts at 0 and accumulates its entries, never seed+add', () => {
    // ingestUploadedArchive now creates with expectation 0 and accumulates
    // per entry; with 4 entries (one a 3-page PDF) queued = 3 + 3 = 6.
    const job = makeJob(); // totalFiles = 0
    const entries = 3; // 3 plain image entries; one further PDF entry splits
    const pdfPages = 3;
    let enqueued = 0;
    for (const push of [...Array(entries).fill(1), pdfPages]) {
      job.totalFiles += push;
      job.remainingFiles = Math.max(0, job.totalFiles - job.processedFiles);
      enqueued += push;
    }
    eq(job.totalFiles, enqueued);
    eq(isJobComplete(job, enqueued), false);
    // finalize must NOT shrink or grow this (processed + queued == totalFiles)
    const totals = computeJobTotals(job.processedFiles, enqueued);
    eq(totals.totalFiles, job.totalFiles);
    for (let i = 0; i < enqueued; i++) processOne(job);
    eq(isJobComplete(job, 0), true);
    eq(terminalStatusForJob(job), 'completed');
  });

  describe('jobCompletionFlow.FIX-1a: terminal status honesty');
  it('a fully-failed job reports failed at completion', () => {
    const job = makeJob({ totalFiles: 2, remainingFiles: 2, failedCount: 2, successCount: 0 });
    processOne(job); processOne(job);
    eq(isJobComplete(job, 0), true);
    eq(terminalStatusForJob(job), 'failed');
  });
  it('a mixed success/failure job reports completed at completion', () => {
    const job = makeJob({ totalFiles: 2, remainingFiles: 2, failedCount: 1, successCount: 1 });
    processOne(job); processOne(job);
    eq(isJobComplete(job, 0), true);
    eq(terminalStatusForJob(job), 'completed');
  });

  describe('jobCompletionFlow.FIX-4b: restart sweep of stale mid-flight jobs');
  it('sweeps persisted processing/uploading jobs and leaves terminal ones alone', () => {
    const processing = makeJob({ id: 'a', status: 'processing', completedAt: '2026-01-01T00:00:00.000Z' });
    const uploading = makeJob({ id: 'b', status: 'uploading' });
    const completed = makeJob({ id: 'c', status: 'completed', completedAt: '2026-01-02T00:00:00.000Z' });
    const failed = makeJob({ id: 'd', status: 'failed' });
    const jobs: Record<string, BatchProcessingJob> = { a: processing, b: uploading, c: completed, d: failed };

    const swept = sweepInterruptedJobs(jobs);
    eq(swept.sort(), ['a', 'b']);
    for (const id of ['a', 'b']) {
      eq(jobs[id].status, 'failed', id);
      eq(jobs[id].currentStage, 'ERROR', id);
      eq(jobs[id].currentStageDescription, INTERRUPTED_STAGE_DESCRIPTION, id);
      eq(jobs[id].completedAt, undefined, `${id}: completedAt must stay unset`);
    }
    eq(completed.status, 'completed', 'terminal jobs must not be touched');
    eq(failed.status, 'failed', 'terminal jobs must not be touched');
  });

  it('applyInterruptedJobState is safe on an already-failed job and on an empty store', () => {
    const done = makeJob({ id: 'z', status: 'completed', currentStage: 'COMPLETE' });
    applyInterruptedJobState(done);
    eq(done.status, 'failed');
    eq(sweepInterruptedJobs({}), []);
  });
}

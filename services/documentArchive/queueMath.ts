/**
 * Pure decision helpers for the document processing queue.
 *
 * No imports besides types — this module must stay safe to load in offline
 * unit tests (scripts/unit/jobCompletionFlow.test.ts) without dragging in
 * sharp / Gemini / the disk-backed stores.
 *
 * Extracted from jobProcessor so that FIX-1a's completion math and FIX-4b's
 * restart sweep can be regression-tested offline.
 */
import type { BatchProcessingJob } from '../../types/documentArchive';

/** FIX-4b: exact terminal description for jobs orphaned by a process restart. */
export const INTERRUPTED_STAGE_DESCRIPTION =
  'Interrupted by server restart — use Retry or Rescan';

/**
 * FIX-1a: authoritative job totals. `totalFiles` is a count of queue items
 * ever enqueued for the job (processed ones + still-queued ones), never the
 * client's declared upload intent (expectedCount).
 */
export function computeJobTotals(
  processedFiles: number,
  queuedCount: number
): { totalFiles: number; remainingFiles: number } {
  const processed = Math.max(0, processedFiles);
  const queued = Math.max(0, queuedCount);
  const totalFiles = processed + queued;
  return { totalFiles, remainingFiles: Math.max(0, totalFiles - processed) };
}

/**
 * The completion condition from runBackgroundQueue: every enqueued item has
 * been processed and nothing for this job is left in the queue.
 */
export function isJobComplete(
  job: Pick<BatchProcessingJob, 'remainingFiles'>,
  queuedCount: number
): boolean {
  return job.remainingFiles === 0 && queuedCount === 0;
}

/**
 * Terminal status once a job is complete: 'failed' when every processed item
 * failed, 'completed' otherwise (same rule runBackgroundQueue applied).
 */
export function terminalStatusForJob(
  job: Pick<BatchProcessingJob, 'failedCount' | 'successCount'>
): 'completed' | 'failed' {
  return (job.failedCount || 0) > 0 && (job.successCount || 0) === 0
    ? 'failed'
    : 'completed';
}

/**
 * FIX-4b: mark one orphaned job as failed. `completedAt` is deliberately left
 * unset — the job never ran to completion.
 */
export function applyInterruptedJobState(job: BatchProcessingJob): void {
  job.status = 'failed';
  job.currentStage = 'ERROR';
  job.currentStageDescription = INTERRUPTED_STAGE_DESCRIPTION;
  delete job.completedAt;
}

/**
 * FIX-4b: sweep every persisted job that looks like it was mid-flight when the
 * process died. Called only while stores hydrate, before any enqueue can have
 * happened in this process (see reconcileInterruptedJobs in store.ts), so a
 * live upload that merely hasn't enqueued yet cannot be capped here.
 */
export function sweepInterruptedJobs(
  jobs: Record<string, BatchProcessingJob>
): string[] {
  const swept: string[] = [];
  for (const [id, job] of Object.entries(jobs)) {
    if (job.status === 'processing' || job.status === 'uploading') {
      applyInterruptedJobState(job);
      swept.push(id);
    }
  }
  return swept;
}

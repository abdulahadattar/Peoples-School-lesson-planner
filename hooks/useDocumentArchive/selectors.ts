/**
 * Pure decision logic for the active transparency job (C5b).
 *
 * Kept free of React and network imports so `npm run test:unit`
 * (scripts/unit/documentArchiveSelectors.test.ts) can exercise every rule
 * without loading components, services or the disk-backed stores.
 *
 * Incident this guards against (live Vercel, 2026-10-30): the document store
 * lives in per-instance /tmp, instances rotate freely, and
 * /api/documents/jobs-latest can answer with a STALE record of an earlier,
 * dead attempt. Adopting it while the transparency modal was open switched
 * the modal to an unrelated job id with frozen 0/0 counts.
 */
import type { BatchProcessingJob } from '../../types/documentArchive';

/**
 * Consecutive poll misses (404 / network error) after which a job record is
 * declared unreachable for display purposes and polling stops. Vercel
 * instances rotate freely between polls, so 4 straight misses (~8s at the
 * modal's 2s interval) means "not reachable from this server instance",
 * not a transient blip.
 */
export const MAX_JOB_POLL_MISSES = 4;

export function isTerminalJobStatus(status: BatchProcessingJob['status'] | undefined): boolean {
  return status === 'completed' || status === 'failed';
}

/** The id this job carries under both schema generations. */
const jobIdAlias = (job: BatchProcessingJob): string => {
  const paired = job as BatchProcessingJob & { jobId?: string };
  return paired.jobId || job.id;
};

/**
 * Rule — jobs-latest may only SEED the active-job slot.
 *
 * Once this view holds an active job (the user started an upload), a
 * jobs-latest answer may never REPLACE it: an instance-rotated server can
 * report a stale record of an unrelated earlier attempt. It may only refresh
 * the SAME job (same id), and never regress an already-displayed terminal
 * state back to an older non-terminal snapshot.
 */
export function adoptLatestJob(
  current: BatchProcessingJob | null,
  latest: BatchProcessingJob | null,
): BatchProcessingJob | null {
  if (!current) return latest; // nothing active → seed from jobs-latest
  if (!latest || latest.id !== current.id) return current; // stale/other job → ignore
  if (isTerminalJobStatus(current.status) && !isTerminalJobStatus(latest.status)) return current;
  return latest;
}

/**
 * Rule — a status-poll response only updates the job it belongs to. A
 * response whose id does not match the polled id (a mis-adoption slipping
 * through) is ignored for display purposes.
 */
export function adoptPollResponse(
  current: BatchProcessingJob | null,
  expectedJobId: string,
  updated: BatchProcessingJob | null,
): BatchProcessingJob | null {
  if (!updated) return current;
  if (expectedJobId && jobIdAlias(updated) !== expectedJobId) return current;
  return updated;
}

export interface PollMissState {
  misses: number;
  lost: boolean;
}

/** After MAX_JOB_POLL_MISSES consecutive misses the record is declared lost. */
export function recordPollMiss(misses: number): PollMissState {
  const next = misses + 1;
  return { misses: next, lost: next >= MAX_JOB_POLL_MISSES };
}

/** A successful poll resets the consecutive-miss accounting. */
export function resetPollMisses(): PollMissState {
  return { misses: 0, lost: false };
}

/**
 * Whether the transparency modal should (re)start its status-poll interval:
 * never for a lost record or a terminal job, otherwise yes.
 */
export function shouldStartPollInterval(
  job: BatchProcessingJob | null,
  isRecordLost: boolean,
): boolean {
  if (isRecordLost) return false;
  if (isTerminalJobStatus(job?.status)) return false;
  return true;
}

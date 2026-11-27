/**
 * Pure-logic regression for the active-transparency-job ownership rules (C5b).
 *
 * Live-Vercel incident being pinned (2026-10-30): the document store lives in
 * per-instance /tmp, so a rotated instance's /api/documents/jobs-latest can
 * answer with a STALE record from an earlier, dead attempt. While the
 * transparency modal was open, useDocumentArchive.refreshData() adopted that
 * stale record (setActiveJob(latestJob)) and the modal header switched to the
 * old job id with frozen 0/0 counts.
 *
 * The selectors under test stay free of React and network imports so this
 * suite never loads sharp/Gemini/the disk-backed stores.
 *
 * Run: npm run test:unit (aggregated by scripts/unit-tests.ts)
 */
import {
  MAX_JOB_POLL_MISSES,
  adoptLatestJob,
  adoptPollResponse,
  isTerminalJobStatus,
  recordPollMiss,
  resetPollMisses,
  shouldStartPollInterval,
} from '../../hooks/useDocumentArchive/selectors';
import type { BatchProcessingJob } from '../../types/documentArchive';

type Harness = {
  describe: (name: string) => void;
  it: (name: string, fn: () => void) => void;
  eq: (actual: unknown, expected: unknown, msg?: string) => void;
};

export async function runDocumentArchiveSelectorsTests(h: Harness) {
  const { describe, it, eq } = h;

  const makeJob = (over: Partial<BatchProcessingJob> = {}): BatchProcessingJob => ({
    id: 'j-live', totalFiles: 2, processedFiles: 1, remainingFiles: 1,
    flaggedCount: 0, duplicateCount: 0, failedCount: 0, successCount: 1, unclassifiedCount: 0,
    status: 'processing', currentStage: 'AI_VISION', startedAt: new Date().toISOString(),
    ...over,
  });
  const asAliased = (job: BatchProcessingJob): BatchProcessingJob & { jobId?: string } =>
    ({ ...job, jobId: job.id });

  describe('C5b adoptLatestJob: jobs-latest can only SEED the active job slot');
  it('(b) seeds activeJob when none is active', () => {
    const latest = makeJob({ id: 'j-seed' });
    eq(adoptLatestJob(null, latest), latest);
  });
  it('(a) never replaces an in-flight active job with a stale other-job record', () => {
    const current = makeJob({ id: 'j-live', status: 'processing' });
    // Exactly the incident: a rotated instance reports its most recent stored
    // job — an EARLIER dead attempt (id b789d393-style), not the user's upload.
    const staleFromRotatedInstance = makeJob({ id: 'j-dead-prior-attempt', status: 'processing' });
    eq(adoptLatestJob(current, staleFromRotatedInstance), current,
      'jobs-latest must not overwrite a job the user started in this view');
  });
  it('(a) keeps the active job when jobs-latest answers 404 (null)', () => {
    const current = makeJob({ id: 'j-live' });
    eq(adoptLatestJob(current, null), current);
  });
  it('still accepts a same-id rewrite (fresher snapshot of the SAME job)', () => {
    const current = makeJob({ id: 'j-live', processedFiles: 1 });
    const fresher = asAliased(makeJob({ id: 'j-live', processedFiles: 2 }));
    eq(adoptLatestJob(current, fresher), fresher);
  });
  it('never regresses a terminal active job to a non-terminal same-id snapshot', () => {
    const current = makeJob({ id: 'j-live', status: 'completed', processedFiles: 2 });
    const staleSnapshot = asAliased(makeJob({ id: 'j-live', status: 'processing', processedFiles: 1 }));
    eq(adoptLatestJob(current, staleSnapshot), current);
  });
  it('accepts a same-id rewrite that confirms the terminal state', () => {
    const current = makeJob({ id: 'j-live', status: 'processing', processedFiles: 1 });
    const completion = asAliased(makeJob({ id: 'j-live', status: 'completed', processedFiles: 2 }));
    eq(adoptLatestJob(current, completion), completion);
  });

  describe('C5b adoptPollResponse: a status-poll response only updates matching jobs');
  it('(d) ignores a poll response whose id does not match the polled job id', () => {
    const current = makeJob({ id: 'j-live' });
    const otherJob = asAliased(makeJob({ id: 'j-other', processedFiles: 99 }));
    eq(adoptPollResponse(current, 'j-live', otherJob), current,
      'a mis-adoption slipping through must not be shown');
  });
  it('adopts a poll response carrying the expected id (jobId alias counts)', () => {
    const current = makeJob({ id: 'j-live', processedFiles: 1 });
    const updated = asAliased(makeJob({ id: 'j-live', processedFiles: 2 }));
    eq(adoptPollResponse(current, 'j-live', updated), updated);
  });
  it('treats a null/404 poll result as a miss, not a state change', () => {
    const current = makeJob({ id: 'j-live' });
    eq(adoptPollResponse(current, 'j-live', null), current);
  });

  describe('C5b lost-record accounting: after the miss limit the modal stops polling');
  it(`(c) does not flag lost before ${MAX_JOB_POLL_MISSES} consecutive misses`, () => {
    let state = { misses: 0, lost: false };
    for (let i = 0; i < MAX_JOB_POLL_MISSES - 1; i++) state = recordPollMiss(state.misses);
    eq(state.lost, false, 'transient misses/rotation retries must stay below the limit');
    eq(state.misses, MAX_JOB_POLL_MISSES - 1);
  });
  it(`(c) flags lost exactly at ${MAX_JOB_POLL_MISSES} consecutive misses`, () => {
    let state = { misses: 0, lost: false };
    for (let i = 0; i < MAX_JOB_POLL_MISSES; i++) {
      const prevLost = state.lost;
      state = recordPollMiss(state.misses);
      eq(state.lost === prevLost || i === MAX_JOB_POLL_MISSES - 1, true,
        'lost must flip exactly on the miss-limit tick');
    }
    eq(state.lost, true, 'honest lost-record state must surface, not frozen 0/0');
    eq(state.misses, MAX_JOB_POLL_MISSES);
  });
  it('(c) stops the poll interval for a lost record', () => {
    eq(shouldStartPollInterval(makeJob({ status: 'processing' }), true), false,
      'no more polling once the record is declared lost');
  });
  it('(c) keeps normal polling while the record is reachable and processing', () => {
    eq(shouldStartPollInterval(makeJob({ status: 'processing' }), false), true);
  });
  it('(c) never polls a terminal job (completed/failed)', () => {
    eq(shouldStartPollInterval(makeJob({ status: 'completed' }), false), false);
    eq(shouldStartPollInterval(makeJob({ status: 'failed' }), false), false);
  });
  it('a successful poll resets the miss counter (recovers a transient rotation)', () => {
    let state = { misses: 0, lost: false };
    for (let i = 0; i < 3; i++) state = recordPollMiss(state.misses);
    eq(state.misses, 3);
    eq(state.lost, false, 'three misses must stay below the limit');
    // The instance comes back — a hit resets accounting via resetPollMisses().
    state = resetPollMisses();
    eq(state.misses, 0);
    eq(state.lost, false);
    state = recordPollMiss(state.misses);
    eq(state.misses, 1, 'misses accrue only consecutively');
  });
}

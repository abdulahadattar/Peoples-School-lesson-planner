import {
  getKeepAliveSlot,
  trackVisitedViewSlots,
  getDataKeysForView,
  getPredictiveWarmupPlan,
  runWarmupDataTask,
  resetWarmupStateForTesting,
  type KeepAliveSlot,
} from '../../services/portalWarmup';
import {
  peekMarksheetLogoAssets,
  resetMarksheetLogoCacheForTesting,
  fetchMarksheetLogoAssets,
} from '../../services/marksheet/logoAssets';

export async function runPortalWarmupTests(t: {
  describe: (name: string) => void;
  it: (name: string, fn: () => void) => void;
  itAsync: (name: string, fn: () => Promise<void> | void) => Promise<void>;
  eq: (actual: unknown, expected: unknown, msg?: string) => void;
}) {
  const { describe, it, itAsync, eq } = t;

  describe('portalWarmup.trackVisitedViewSlots');
  it('maps primary views to keep-alive slots and shares exams slot for paper/omr-scanner', () => {
    eq(getKeepAliveSlot('home'), 'home');
    eq(getKeepAliveSlot('marksheets'), 'marksheets');
    eq(getKeepAliveSlot('records'), 'records');
    eq(getKeepAliveSlot('paper'), 'exams');
    eq(getKeepAliveSlot('omr-scanner'), 'exams');
    eq(getKeepAliveSlot('results'), null);
  });

  it('appends new slots in visit order without reordering or duplicating existing slots', () => {
    let slots: KeepAliveSlot[] = [];
    slots = trackVisitedViewSlots(slots, 'home');
    slots = trackVisitedViewSlots(slots, 'marksheets');
    slots = trackVisitedViewSlots(slots, 'records');
    eq(slots, ['home', 'marksheets', 'records']);

    // Revisiting marksheets preserves exact reference & order
    const revisited = trackVisitedViewSlots(slots, 'marksheets');
    eq(revisited, slots);

    // Paper + OMR scanner share 'exams'
    const withPaper = trackVisitedViewSlots(slots, 'paper');
    eq(withPaper, ['home', 'marksheets', 'records', 'exams']);
    const withScanner = trackVisitedViewSlots(withPaper, 'omr-scanner');
    eq(withScanner, withPaper);

    // Results view does not pollute keep-alive slots
    const withResults = trackVisitedViewSlots(withScanner, 'results');
    eq(withResults, withScanner);
  });

  describe('portalWarmup.getPredictiveWarmupPlan');
  it('prioritizes predictive neighbors and deduplicates all chunks and data keys', () => {
    const fromRecords = getPredictiveWarmupPlan('records');
    eq(fromRecords.views.includes('home'), false);
    eq(fromRecords.views.includes('results'), false);
    eq(fromRecords.views[0], 'marksheets');
    eq(fromRecords.dataKeys[0], 'sheetData');
    eq(fromRecords.dataKeys[1], 'dossiers');
    eq(new Set(fromRecords.views).size, fromRecords.views.length);
    eq(new Set(fromRecords.dataKeys).size, fromRecords.dataKeys.length);
    eq(fromRecords.dataKeys.length, 8);

    const fromHome = getPredictiveWarmupPlan('home');
    eq(fromHome.views[0], 'lesson');
    eq(getDataKeysForView('marksheets'), ['sheetData', 'marksheetLogos']);
  });

  describe('portalWarmup.runWarmupDataTask');
  await itAsync('deduplicates concurrent warmups and skips already warmed keys', async () => {
    resetWarmupStateForTesting();
    let calls = 0;
    const loader = async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 10));
      return { ok: true };
    };

    await Promise.all([
      runWarmupDataTask('sheetData', loader),
      runWarmupDataTask('sheetData', loader),
      runWarmupDataTask('sheetData', loader),
    ]);
    eq(calls, 1, 'concurrent warmup calls should share one execution');

    await runWarmupDataTask('sheetData', loader);
    eq(calls, 1, 'already warmed key should resolve from session state');
  });

  await itAsync('swallows background errors cleanly without locking future retries', async () => {
    resetWarmupStateForTesting();
    let attempt = 0;
    await runWarmupDataTask('dossiers', async () => {
      attempt++;
      throw new Error('network down');
    });
    eq(attempt, 1);

    await runWarmupDataTask('dossiers', async () => {
      attempt++;
      return [];
    });
    eq(attempt, 2, 'failed background task should remain retryable later');
  });

  describe('marksheet.logoAssets cache');
  await itAsync('returns empty safely outside browser without throwing', async () => {
    resetMarksheetLogoCacheForTesting();
    eq(peekMarksheetLogoAssets(), null);
    const assets = await fetchMarksheetLogoAssets();
    eq(assets, {});
  });
}

/**
 * Unit tests for the 12-hour Google Sheet pull schedule.
 *
 * This rule is the whole point of the read-path redesign: the register must be
 * re-read on a 12-hour cadence instead of after every edit, while an explicit
 * Refresh must always win. It is pure localStorage arithmetic, so it is tested
 * directly rather than through the view that uses it.
 *
 * Run: node node_modules/tsx/dist/cli.mjs scripts/unit/sheetPullSchedule.test.ts
 */
import {
  SHEET_PULL_INTERVAL_MS,
  SHEET_PULL_CHECK_MS,
  LAST_PULL_KEY,
  markSheetPulled,
  lastSheetPullAt,
  shouldPullSheet,
  msUntilNextPull,
} from '../../services/sheetPullSchedule';

/* ── harness ─────────────────────────────────────────────────── */
const c = { g: (s: string) => `\x1b[32m${s}\x1b[0m`, r: (s: string) => `\x1b[31m${s}\x1b[0m`, b: (s: string) => `\x1b[1m${s}\x1b[0m`, cy: (s: string) => `\x1b[36m${s}\x1b[0m` };
let pass = 0, fail = 0;
const failures: string[] = [];
let suite = '';
const log = (m = '') => process.stdout.write(m + '\n');
const describe = (n: string) => { suite = n; log(`\n${c.b(c.cy(`── ${n} ──`))}`); };
function it(name: string, fn: () => void) {
  try { fn(); pass++; log(`${c.g('  ✅')} ${name}`); }
  catch (e: any) {
    fail++; failures.push(`[${suite}] ${name}\n        ${String(e.message).split('\n')[0]}`);
    log(`${c.r('  ❌')} ${name}\n${c.r(`       ${String(e.message).split('\n').slice(0, 2).join('\n       ')}`)}`);
  }
}
const eq = (a: unknown, b: unknown, m = '') => {
  const A = JSON.stringify(a), B = JSON.stringify(b);
  if (A !== B) throw new Error(`${m}\n  expected: ${B}\n  actual:   ${A}`);
};

/* ── localStorage shim ───────────────────────────────────────── */
class MemoryStorage {
  #m = new Map<string, string>();
  get length() { return this.#m.size; }
  key(i: number) { return [...this.#m.keys()][i] ?? null; }
  getItem(k: string) { return this.#m.has(k) ? this.#m.get(k)! : null; }
  setItem(k: string, v: string) { this.#m.set(k, String(v)); }
  removeItem(k: string) { this.#m.delete(k); }
  clear() { this.#m.clear(); }
}
(globalThis as any).localStorage = new MemoryStorage();
const storage = () => (globalThis as any).localStorage as MemoryStorage;
const reset = () => storage().clear();

const HOUR = 60 * 60 * 1000;
const NOW = 1_700_000_000_000;

/* ── the rule ────────────────────────────────────────────────── */
describe('sheetPullSchedule — the 12-hour window');

it('pulls when no pull has ever been recorded', () => {
  reset();
  eq(shouldPullSheet(false, NOW), true, 'an unknown cache age must not be trusted');
});

it('does not pull a minute after the last pull', () => {
  reset();
  markSheetPulled(NOW);
  eq(shouldPullSheet(false, NOW + 60_000), false);
});

it('holds for one millisecond inside the window and flips at the boundary', () => {
  reset();
  markSheetPulled(NOW);
  eq(shouldPullSheet(false, NOW + SHEET_PULL_INTERVAL_MS - 1), false, 'still inside the 12 hours');
  eq(shouldPullSheet(false, NOW + SHEET_PULL_INTERVAL_MS), true, 'the window has elapsed');
});

it('always pulls when forced, even a second after the last pull', () => {
  reset();
  markSheetPulled(NOW);
  eq(shouldPullSheet(true, NOW + 1000), true, 'an explicit Refresh must never be blocked');
});

it('treats a corrupt timestamp as stale rather than fresh', () => {
  reset();
  storage().setItem(LAST_PULL_KEY, 'not-a-number');
  eq(lastSheetPullAt(), 0);
  eq(shouldPullSheet(false, NOW), true, 'garbage must not suppress a needed pull');
});

it('records and reports the pull time', () => {
  reset();
  eq(lastSheetPullAt(), 0, 'nothing recorded yet');
  markSheetPulled(NOW);
  eq(lastSheetPullAt(), NOW);
});

it('counts down to the next pull and clamps at zero', () => {
  reset();
  markSheetPulled(NOW);
  eq(msUntilNextPull(NOW), SHEET_PULL_INTERVAL_MS);
  eq(msUntilNextPull(NOW + HOUR), SHEET_PULL_INTERVAL_MS - HOUR);
  eq(msUntilNextPull(NOW + SHEET_PULL_INTERVAL_MS + HOUR), 0, 'never negative');
});

it('does not throw when storage refuses to write', () => {
  reset();
  const original = storage().setItem;
  storage().setItem = () => { throw new Error('QuotaExceededError'); };
  try {
    markSheetPulled(NOW); // must not throw
  } finally {
    storage().setItem = original;
  }
  eq(lastSheetPullAt(), 0, 'nothing was recorded');
  eq(shouldPullSheet(false, NOW), true, 'and the next attempt still pulls');
});

it('checks far more often than it pulls', () => {
  // The app polls a TIMESTAMP every 5 minutes but only fetches once the 12-hour
  // window elapses, so the open-app check must be much shorter than the window.
  eq(SHEET_PULL_CHECK_MS < SHEET_PULL_INTERVAL_MS, true);
  eq(SHEET_PULL_CHECK_MS, 5 * 60 * 1000);
});

/* ── summary ──────────────────────────────────────────────────── */
log(`\n${'═'.repeat(34)}`);
if (fail === 0) log(`  ${c.g(`${pass} passed`)}`);
else {
  log(`  ${c.g(`${pass} passed`)}  ${c.r(`${fail} failed`)}`);
  failures.forEach(f => log(c.r(`  • ${f}`)));
  process.exitCode = 1;
}

/**
 * Regression tests for the Google Sheet write path and the shared grid parser.
 *
 * Covers two bugs found auditing the timetable <-> Sheet sync:
 *   1. A revoked token used to fail every remaining range, each reported as a
 *      separate "write failed". It now stops at the first one and says
 *      needsReconnect, which also protects the 60-writes/min/user quota.
 *   2. The read path parsed these grids with the trimming, blank-row-dropping
 *      parser while the write path refused to. Both now use parseCsvToGrid.
 *
 * Run: node node_modules/tsx/dist/cli.mjs scripts/unit/timetableSync.test.ts
 */
import {
  applyTimetableWrites,
  parseCsvToGrid,
  groupWritesIntoRanges,
  type TimetableWritePlan,
  type TimetableCellWrite,
} from '../../services/timetableSheetWriter';

/* ── harness ─────────────────────────────────────────────────── */
const c = { g: (s: string) => `\x1b[32m${s}\x1b[0m`, r: (s: string) => `\x1b[31m${s}\x1b[0m`, b: (s: string) => `\x1b[1m${s}\x1b[0m`, cy: (s: string) => `\x1b[36m${s}\x1b[0m` };
let pass = 0, fail = 0;
const failures: string[] = [];
let suite = '';
const log = (m = '') => process.stdout.write(m + '\n');
const describe = (n: string) => { suite = n; log(`\n${c.b(c.cy(`── ${n} ──`))}`); };
async function it(name: string, fn: () => void | Promise<void>) {
  try { await fn(); pass++; log(`${c.g('  ✅')} ${name}`); }
  catch (e: any) {
    fail++; failures.push(`[${suite}] ${name}\n        ${String(e.message).split('\n')[0]}`);
    log(`${c.r('  ❌')} ${name}\n${c.r(`       ${String(e.message).split('\n').slice(0, 3).join('\n       ')}`)}`);
  }
}
const eq = (a: unknown, b: unknown, m = '') => {
  const A = JSON.stringify(a), B = JSON.stringify(b);
  if (A !== B) throw new Error(`${m}\n  expected: ${B}\n  actual:   ${A}`);
};

const cell = (over: Partial<TimetableCellWrite>): TimetableCellWrite => ({
  tabName: 'IX', classLabel: 'IX', a1: 'D4', row1: 4, col0: 3,
  day: 'mon', periodNo: 1, value: 'Math', previous: '', ...over,
});

/** Two tabs, so a full run would issue two requests. */
const twoTabPlan = (): TimetableWritePlan => ({
  writes: [
    cell({}),
    cell({ tabName: 'X-A', classLabel: 'X-A', a1: 'D5', row1: 5, periodNo: 2, value: 'Urdu' }),
  ],
  timeWrites: [],
  skippedTabs: [],
  unchangedTabs: [],
  totalCellsConsidered: 2,
  guards: {
    IX: { tabName: 'IX', periodRows: [4], forbiddenRows: [1, 2], dayColumns: [3], timeColumns: [] },
    'X-A': { tabName: 'X-A', periodRows: [5], forbiddenRows: [1, 2], dayColumns: [3], timeColumns: [] },
  },
} as unknown as TimetableWritePlan);

/** Minimal Response-shaped stub. */
const res = (ok: boolean, status: number, body = '') =>
  ({ ok, status, text: async () => body }) as unknown as Response;

/* ── write path failure handling ──────────────────────────────── */
describe('applyTimetableWrites — failure classification');

await it('stops after an auth failure and asks for a reconnect', async () => {
  const calls: string[] = [];
  const fetchImpl = (async (url: any) => { calls.push(String(url)); return res(false, 401, 'Request was unauthorized'); }) as unknown as typeof fetch;
  const out = await applyTimetableWrites(twoTabPlan(), 'expired-token', { fetchImpl });
  eq(out.needsReconnect, true, 'an auth failure must ask for a reconnect');
  eq(out.ok, false);
  eq(calls.length, 1, 'must not keep spending write requests against a dead token');
  eq(out.cellsWritten, 0);
});

await it('treats a scope failure like an auth failure', async () => {
  const calls: string[] = [];
  const fetchImpl = (async (url: any) => { calls.push(String(url)); return res(false, 403, 'Insufficient Authentication Scopes'); }) as unknown as typeof fetch;
  const out = await applyTimetableWrites(twoTabPlan(), 'token', { fetchImpl });
  eq(out.needsReconnect, true, 'a scope failure needs re-authorising, not a retry');
  eq(calls.length, 1);
});

await it('keeps going when the failure is not sign-in related', async () => {
  const calls: string[] = [];
  const fetchImpl = (async (url: any) => { calls.push(String(url)); return res(false, 500, 'Backend Error'); }) as unknown as typeof fetch;
  const out = await applyTimetableWrites(twoTabPlan(), 'token', { fetchImpl });
  eq(out.needsReconnect, false, 'a server error is not a reconnect problem');
  eq(calls.length, 2, 'other tabs are still worth attempting');
  eq(out.ok, false);
  eq(out.errors.length, 2, 'every failure is reported');
});

await it('reports a successful write without touching needsReconnect', async () => {
  const fetchImpl = (async () => res(true, 200, '{}')) as unknown as typeof fetch;
  const out = await applyTimetableWrites(twoTabPlan(), 'token', { fetchImpl });
  eq(out.ok, true);
  eq(out.needsReconnect, false);
  eq(out.cellsWritten, 2);
  eq(out.tabsWritten.sort(), ['IX', 'X-A']);
});

/* ── range grouping ───────────────────────────────────────────── */
describe('groupWritesIntoRanges — request count');

await it('collapses a contiguous run on one row into a single range', () => {
  const ranges = groupWritesIntoRanges([
    cell({ col0: 3, a1: 'D4' }),
    cell({ col0: 4, a1: 'E4' }),
    cell({ col0: 5, a1: 'F4' }),
  ]);
  eq(ranges.length, 1, 'three adjacent cells on one row are one request');
  eq(ranges[0].values, [['Math', 'Math', 'Math']]);
});

await it('splits a gap and never merges across tabs', () => {
  const ranges = groupWritesIntoRanges([
    cell({ col0: 3, a1: 'D4' }),
    cell({ col0: 6, a1: 'G4' }),
    cell({ tabName: 'X-A', col0: 3, a1: 'D4' }),
  ]);
  eq(ranges.length, 3, 'a gap or a tab change must start a new range');
});

/* ── parser fidelity (the read/write split-brain) ─────────────── */
describe('parseCsvToGrid — row provenance');

await it('preserves a blank row so sheet row numbers stay true', () => {
  const grid = parseCsvToGrid('Title,\nTime,Monday\nP1,Math\n,,\nP5,Urdu\n');
  eq(grid.length, 5, 'the blank separator row must survive, or every row below it renumbers');
  eq(grid[3].every((v: string) => String(v).trim() === ''), true, 'the blank row stays blank');
  eq(grid[0][0], 'Title');
  eq(grid[2][0], 'P1', 'the row above the gap keeps its sheet index');
  eq(grid[4][0], 'P5', 'the row after the gap must still be at its real sheet index');
});

await it('keeps trailing spaces inside a quoted cell', () => {
  const grid = parseCsvToGrid('a,"b  ",c\n');
  eq(grid[0][1], 'b  ', 'hand-typed padding is part of the cell content');
});

await it('handles an escaped quote and an embedded newline', () => {
  const grid = parseCsvToGrid('"He said ""hi""","line1\nline2"\n');
  eq(grid[0][0], 'He said "hi"');
  eq(grid[0][1], 'line1\nline2');
});

/* ── summary ──────────────────────────────────────────────────── */
log(`\n${'═'.repeat(34)}`);
if (fail === 0) log(`  ${c.g(`${pass} passed`)}`);
else {
  log(`  ${c.g(`${pass} passed`)}  ${c.r(`${fail} failed`)}`);
  failures.forEach(f => log(c.r(`  • ${f}`)));
  process.exitCode = 1;
}


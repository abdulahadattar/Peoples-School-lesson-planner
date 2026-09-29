/**
 * Unit tests for the local-first edit services that shipped with no coverage:
 * services/sheetSyncQueue.ts, services/localRecordsOverlay.ts, and a smoke
 * pass over services/timetableSheetLayout.ts + timetableSheetConfig.ts.
 *
 * These modules read localStorage at CALL time (not at import time), so
 * importing them under plain Node is safe; the shim below only needs to exist
 * before the first call.
 *
 * Run: node node_modules/tsx/dist/cli.mjs scripts/unit/localFirst.test.ts
 */
import {
  queueSheetSync, listPendingSync, pendingSyncCount, pendingScopes,
  clearPendingSync, clearAllPendingSync, markSyncAttempt, subscribeSyncQueue,
} from '../../services/sheetSyncQueue';
import {
  saveLocalRecord, clearLocalRecord, getLocalOverlay, localOverlayCount,
  hasLocalRecord, applyLocalOverlay, subscribeLocalOverlay,
} from '../../services/localRecordsOverlay';
import type { StudentRecord } from '../../services/googleSheetsService';

/* ── harness ─────────────────────────────────────────────────── */
const c = { g: s => `\x1b[32m${s}\x1b[0m`, r: s => `\x1b[31m${s}\x1b[0m`, d: s => `\x1b[2m${s}\x1b[0m`, b: s => `\x1b[1m${s}\x1b[0m`, cy: s => `\x1b[36m${s}\x1b[0m` };
let pass = 0, fail = 0;
const failures: string[] = [];
let suite = '';
const log = (m = '') => process.stdout.write(m + '\n');
const describe = (n: string) => { suite = n; log(`\n${c.b(c.cy(`── ${n} ──`))}`); };
function it(name: string, fn: () => void) {
  try { fn(); pass++; log(`${c.g('  ✅')} ${name}`); }
  catch (e: any) {
    fail++; failures.push(`[${suite}] ${name}\n        ${String(e.message).split('\n')[0]}`);
    log(`${c.r('  ❌')} ${name}\n${c.r(`       ${String(e.message).split('\n').slice(0, 3).join('\n       ')}`)}`);
  }
}
const eq = (a: unknown, b: unknown, m = '') => {
  const A = JSON.stringify(a), B = JSON.stringify(b);
  if (A !== B) throw new Error(`${m}\n  expected: ${B}\n  actual:   ${A}`);
};

/* ── localStorage shim ────────────────────────────────────────── */
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
const reset = () => (globalThis as any).localStorage.clear();

const rec = (rowNumber: number, over: Partial<StudentRecord> = {}): StudentRecord => ({
  rowNumber, grNo: `GR${rowNumber}`, studentName: `Student ${rowNumber}`,
  fatherName: `Father ${rowNumber}`, currentClass: 'IX-A', section: 'A',
  gender: 'Male', ...over,
} as unknown as StudentRecord);

/* ── sheetSyncQueue ───────────────────────────────────────────── */
describe('sheetSyncQueue — coalescing and scope');

it('coalesces a re-edit of the same target+scope into one entry', () => {
  reset();
  queueSheetSync({ target: 'attendance', scope: '2026-09-30', label: 'A', payload: { a: 1 } });
  queueSheetSync({ target: 'attendance', scope: '2026-09-30', label: 'A', payload: { a: 2 } });
  eq(pendingSyncCount(), 1, 're-editing the same date must supersede, not stack');
  eq(listPendingSync()[0].payload, { a: 2 }, 'newest payload must win');
});

it('keeps entries for different scopes and different targets apart', () => {
  reset();
  queueSheetSync({ target: 'attendance', scope: '2026-09-29', label: 'x', payload: 1 });
  queueSheetSync({ target: 'attendance', scope: '2026-09-30', label: 'x', payload: 2 });
  queueSheetSync({ target: 'records', scope: '2026-09-30', label: 'x', payload: 3 });
  eq(pendingSyncCount(), 3);
  eq(pendingScopes('attendance').sort(), ['2026-09-29', '2026-09-30']);
  eq(pendingScopes('records'), ['2026-09-30']);
});

it('lists newest first', () => {
  reset();
  queueSheetSync({ target: 'records', scope: '1', label: 'a', payload: 1 });
  queueSheetSync({ target: 'records', scope: '2', label: 'b', payload: 2 });
  eq(listPendingSync().map(e => e.scope), ['2', '1']);
});

it('clearPendingSync removes only the named entry; clearAll empties the queue', () => {
  reset();
  const a = queueSheetSync({ target: 'records', scope: '1', label: 'a', payload: 1 });
  queueSheetSync({ target: 'records', scope: '2', label: 'b', payload: 2 });
  clearPendingSync(a.id);
  eq(listPendingSync().map(e => e.scope), ['2']);
  clearAllPendingSync();
  eq(pendingSyncCount(), 0);
});

it('markSyncAttempt increments attempts and records the error', () => {
  reset();
  const a = queueSheetSync({ target: 'records', scope: '1', label: 'a', payload: 1 });
  markSyncAttempt(a.id, 'HTTP 401');
  markSyncAttempt(a.id, 'HTTP 401');
  const e = listPendingSync()[0];
  eq(e.attempts, 2);
  eq(e.lastError, 'HTTP 401');
});

it('RISK: attempts and queue size are uncapped by design', () => {
  reset();
  const a = queueSheetSync({ target: 'records', scope: '1', label: 'a', payload: 1 });
  for (let i = 0; i < 50; i++) markSyncAttempt(a.id, `err${i}`);
  eq(listPendingSync()[0].attempts, 50, 'attempts grows without limit');
  // The queue itself IS capped, silently dropping the oldest entries.
  for (let i = 0; i < 260; i++) queueSheetSync({ target: 'records', scope: `s${i}`, label: 'x', payload: i });
  eq(pendingSyncCount(), 200, 'MAX_ENTRIES = 200 is enforced');
  eq(listPendingSync().some(e => e.scope === 's0'), false, 'oldest entries dropped silently, no warning');
});

it('survives corrupt localStorage without throwing', () => {
  reset();
  (globalThis as any).localStorage.setItem('phssj_pending_sheet_sync_v1', '{not json');
  eq(pendingSyncCount(), 0, 'corrupt queue must read as empty');
  (globalThis as any).localStorage.setItem('phssj_pending_sheet_sync_v1', '{"a":1}');
  eq(pendingSyncCount(), 0, 'non-array JSON must read as empty');
});

it('subscribeSyncQueue returns a working unsubscribe', () => {
  reset();
  let hits = 0;
  const off = subscribeSyncQueue(() => { hits++; });
  queueSheetSync({ target: 'records', scope: '1', label: 'a', payload: 1 });
  eq(hits, 1, 'subscriber notified on queue');
  off();
  queueSheetSync({ target: 'records', scope: '2', label: 'b', payload: 2 });
  eq(hits, 1, 'no notification after unsubscribe');
});

/* ── localRecordsOverlay ──────────────────────────────────────── */
describe('localRecordsOverlay — save, clear, merge precedence');

it('saves and reads back a local edit', () => {
  reset();
  saveLocalRecord(rec(5, { studentName: 'Edited Name' }));
  eq(localOverlayCount(), 1);
  eq(hasLocalRecord(5), true);
  eq(getLocalOverlay()['5'].studentName, 'Edited Name');
});

it('appends a local-only row the sheet has never seen', () => {
  reset();
  saveLocalRecord(rec(99, { studentName: 'Brand New' }));
  const merged = applyLocalOverlay([rec(1)]);
  eq(merged.length, 2, 'unsynced new student must still be visible');
  eq(merged[1].rowNumber, 99);
  eq(merged[1].studentName, 'Brand New');
});

it('returns the input untouched when the overlay is empty', () => {
  reset();
  const input = [rec(1), rec(2)];
  const merged = applyLocalOverlay(input);
  eq(merged, input, 'no overlay => same rows');
});

it('keeps results sorted by rowNumber regardless of insert order', () => {
  reset();
  saveLocalRecord(rec(1));
  saveLocalRecord(rec(3));
  saveLocalRecord(rec(2));
  const merged = applyLocalOverlay([]);
  eq(merged.map(r => r.rowNumber), [1, 2, 3]);
});

it('clearLocalRecord removes the overlay and the remote value shows again', () => {
  reset();
  saveLocalRecord(rec(5, { studentName: 'Edited' }));
  eq(applyLocalOverlay([rec(5, { studentName: 'FromSheet' })])[0].studentName, 'Edited');
  clearLocalRecord(5);
  eq(applyLocalOverlay([rec(5, { studentName: 'FromSheet' })])[0].studentName, 'FromSheet',
    'after clearing, the sheet is authoritative again');
});

it('does not mutate the caller\'s array or its records', () => {
  reset();
  saveLocalRecord(rec(5, { studentName: 'Edited' }));
  const input = [rec(5, { studentName: 'FromSheet' })];
  const snapshot = JSON.stringify(input);
  applyLocalOverlay(input);
  eq(JSON.stringify(input), snapshot, 'input must be untouched');
});

it('RISK: local copy overwrites sheet identity columns, not just edited fields', () => {
  reset();
  // The code comment says "Keep the sheet's identity columns but take the
  // locally edited values", but the spread is { ...existing, ...local }, so a
  // STALE local copy wins for every field including grNo/currentClass.
  saveLocalRecord(rec(5, { grNo: 'GR5-OLD', currentClass: 'IX-A', studentName: 'Edited' }));
  const merged = applyLocalOverlay([rec(5, { grNo: 'GR5-CORRECTED-BY-SHEET', currentClass: 'XI-B', studentName: 'FromSheet' })]);
  eq(merged[0].grNo, 'GR5-OLD', 'DOCUMENTS the risk: stale local grNo wins');
  eq(merged[0].currentClass, 'IX-A', 'DOCUMENTS the risk: stale local currentClass wins');
  eq(merged[0].studentName, 'Edited', 'and the intended edit does apply');
});

it('survives corrupt localStorage without throwing', () => {
  reset();
  (globalThis as any).localStorage.setItem('phssj_local_record_overlay_v1', 'nope');
  eq(localOverlayCount(), 0);
  eq(applyLocalOverlay([rec(1)]).length, 1, 'corrupt overlay must not lose the sheet rows');
});

it('subscribeLocalOverlay returns a working unsubscribe', () => {
  reset();
  let hits = 0;
  const off = subscribeLocalOverlay(() => { hits++; });
  saveLocalRecord(rec(1));
  eq(hits, 1);
  off();
  saveLocalRecord(rec(2));
  eq(hits, 1, 'no notification after unsubscribe');
});

/* ── timetable sheet modules: column + cell arithmetic ────────── */
describe('timetableSheetLayout — column letters and cell addressing');

const L = await import('../../services/timetableSheetLayout');
const C = await import('../../services/timetableSheetConfig');

it('colLetter maps 0-based index to spreadsheet letters', () => {
  eq(L.colLetter(0), 'A');
  eq(L.colLetter(25), 'Z');
  eq(L.colLetter(26), 'AA');
  eq(L.colLetter(27), 'AB');
  eq(L.colLetter(51), 'AZ');
  eq(L.colLetter(52), 'BA');
});

it('colIndex0 inverts colLetter for the first 60 columns', () => {
  for (let i = 0; i < 60; i++) eq(L.colIndex0(L.colLetter(i)), i, `round trip at ${i}`);
});

it('colIndex0 is case-insensitive and tolerant of whitespace', () => {
  eq(L.colIndex0('a'), 0);
  eq(L.colIndex0(' aa '), 26);
  eq(L.colIndex0('Z'), 25);
});

it('readCell addresses a 1-based row with a 0-based column', () => {
  const grid = [
    ['r1c1', 'r1c2', 'r1c3'],
    ['r2c1', 'r2c2', 'r2c3'],
  ];
  eq(L.readCell(grid, 1, 0), 'r1c1', 'row 1 col A');
  eq(L.readCell(grid, 1, 2), 'r1c3', 'row 1 col C');
  eq(L.readCell(grid, 2, 1), 'r2c2', 'row 2 col B');
});

it('readCell returns an empty string for out-of-range access', () => {
  const grid = [['only']];
  eq(L.readCell(grid, 9, 9), '', 'past the last cell must not throw');
  eq(L.readCell(grid, 0, 0), '', 'row 0 is not a valid 1-based row');
});

it('cellRef builds a reference from the layout day->column map', () => {
  const layout = {
    classLabel: 'IV-A', teacher: 'Miss Daniya', title: 'IV-A\nMiss Daniya',
    headerRow: 2, firstPeriodRow: 3, lastPeriodRow: 9,
    columns: { mon: 2, tue: 3, wed: 4, thu: 5, fri: 6, sat: 7 },
  };
  eq(L.cellRef(layout as any, 3, 'mon'), 'C3', 'mon at column index 2, row 3');
  eq(L.cellRef(layout as any, 9, 'sat'), 'H9', 'sat at column index 7, row 9');
});

it('cellRef returns an empty string for a row or column it cannot address', () => {
  const layout = { columns: { mon: 2, tue: 3, wed: 4, thu: 5, fri: 6, sat: 7 } };
  eq(L.cellRef(layout as any, 0, 'mon'), '', 'row 0 is invalid');
  eq(L.cellRef(layout as any, -5, 'mon'), '', 'negative row is invalid');
  eq(L.cellRef({ columns: {} } as any, 3, 'mon'), '', 'missing column entry');
  eq(L.cellRef({ columns: { mon: -1 } } as any, 3, 'mon'), '', 'negative column is invalid');
});

it('config exposes the timetable sheet id and tab list', () => {
  eq(typeof C.TIMETABLE_SHEET_ID, 'string');
  eq(C.TIMETABLE_SHEET_ID.length > 10, true);
  eq(Array.isArray(C.TIMETABLE_SHEET_TABS), true);
  eq(C.TIMETABLE_SHEET_TABS.length > 0, true);
  eq(C.TIMETABLE_SHEET_URL.includes(C.TIMETABLE_SHEET_ID), true, 'URL must embed the id');
});


/* ── summary ──────────────────────────────────────────────────── */
log(`\n${c.b(c.cy('══════════════════════════════════'))}`);
log(`  ${c.g(`${pass} passed`)}${fail ? c.r(`  ${fail} failed`) : ''}`);
if (failures.length) {
  log(c.r('\n  Failed:'));
  failures.forEach(f => log(c.r(`    • ${f}`)));
}
log('');
process.exitCode = fail > 0 ? 1 : 0;


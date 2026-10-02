/**
 * Unit tests for the shared (Firestore) pending-edit store's pure logic.
 *
 * These cover the merge identity, which is where a real data-loss bug lived: two
 * pending adds used to be keyed by row number, so once two new students shared a
 * synthetic row one silently overwrote the other in the rendered register - and
 * Sync then appended only one of them.
 *
 * The store imports Firebase, so this needs the in-memory idb-keyval stub:
 *   node --import tsx --import ./scripts/test-hooks/alias-idb.mjs \
 *        scripts/unit/sharedEdits.test.ts
 */
import {
  applySharedEdits,
  isPendingAdd,
  type SharedRecordEdit,
} from '../../services/sharedRecordEdits';
import type { StudentRecord } from '../../services/googleSheetsService';

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
    log(`${c.r('  ❌')} ${name}\n${c.r(`       ${String(e.message).split('\n').slice(0, 3).join('\n       ')}`)}`);
  }
}
const eq = (a: unknown, b: unknown, m = '') => {
  const A = JSON.stringify(a), B = JSON.stringify(b);
  if (A !== B) throw new Error(`${m}\n  expected: ${B}\n  actual:   ${A}`);
};

const rec = (rowNumber: number, over: Partial<StudentRecord> = {}): StudentRecord => ({
  rowNumber, grNo: `GR${rowNumber}`, studentName: `Student ${rowNumber}`,
  fatherName: 'Ali Khan', currentClass: 'IX-A', section: 'A', gender: 'Male',
  ...over,
} as unknown as StudentRecord);

const edit = (docId: string, rowNumber: number, over: Partial<StudentRecord> = {}): SharedRecordEdit => ({
  docId, rowNumber, record: rec(rowNumber, over), kind: 'update',
  updatedAt: 1, updatedBy: 'u1', updatedByName: 'T', updatedByEmail: 't@x',
});

/* ── add vs update ───────────────────────────────────────────── */
describe('isPendingAdd');

it('treats an add-<gr> document as a pending add', () => {
  eq(isPendingAdd(edit('add-gr-99', 99)), true);
});

it('treats a rowless or negative row as a pending add', () => {
  eq(isPendingAdd(edit('anything', 0)), true);
  eq(isPendingAdd(edit('anything', -42)), true);
});

it('treats a normal row-keyed document as an update', () => {
  eq(isPendingAdd(edit('1', 1)), false, 'a student legitimately at row 1 must not be mistaken for an add');
  eq(isPendingAdd(edit('12', 12)), false);
});

/* ── merge identity: the regression ──────────────────────────── */
describe('applySharedEdits — merge identity');

it('keeps TWO pending adds that share a row number', () => {
  // The bug: keyed by rowNumber, the second add replaced the first, so only one
  // student was shown - and therefore only one was ever appended.
  const out = applySharedEdits([], [
    edit('add-gr-a', -7, { studentName: 'Asha' }),
    edit('add-gr-b', -7, { studentName: 'Bilal' }),
  ]);
  eq(out.length, 2, 'both new students must survive the merge');
  eq(out.map((s) => s.studentName).sort(), ['Asha', 'Bilal']);
});

it('collapses two documents for the SAME student into one', () => {
  // Same GR means the same docId, so editing a pending add updates it instead of
  // creating a second pending add.
  const out = applySharedEdits([], [
    edit('add-gr-a', -7, { studentName: 'Asha' }),
    edit('add-gr-a', -7, { studentName: 'Asha Khan' }),
  ]);
  eq(out.length, 1, 'one student, one pending entry');
  eq(out[0].studentName, 'Asha Khan', 'the newer edit wins');
});

it('merges an update over the sheet row and keeps the sheet identity', () => {
  const sheet = [rec(5, { grNo: 'GR-SHEET', currentClass: 'X-A', fatherName: 'Sheet Dad' })];
  const out = applySharedEdits(sheet, [edit('5', 5, { fatherName: 'Teacher Dad', grNo: 'GR-STALE', currentClass: 'IX-A' })]);
  eq(out.length, 1);
  eq(out[0].fatherName, 'Teacher Dad', 'the teacher edit wins for an ordinary column');
  eq(out[0].grNo, 'GR-SHEET', 'the sheet stays authoritative for identity');
  eq(out[0].currentClass, 'X-A', 'a stale pending copy must not move a student between classes');
});

it('sorts pending adds ahead of real rows', () => {
  const out = applySharedEdits([rec(3), rec(9)], [edit('add-gr-a', -500, { studentName: 'New' })]);
  eq(out.map((s) => s.rowNumber), [-500, 3, 9]);
});

it('returns the input untouched when there is nothing pending', () => {
  const input = [rec(1), rec(2)];
  eq(applySharedEdits(input, []) === input, true, 'no pending edits must not allocate');
});

/* ── summary ──────────────────────────────────────────────────── */
log(`\n${'═'.repeat(34)}`);
if (fail === 0) log(`  ${c.g(`${pass} passed`)}`);
else {
  log(`  ${c.g(`${pass} passed`)}  ${c.r(`${fail} failed`)}`);
  failures.forEach(f => log(c.r(`  • ${f}`)));
  process.exitCode = 1;
}
// Exited explicitly: importing the Firebase SDK leaves timers and listeners
// alive, so the process would otherwise hang after printing the summary.
process.exit(process.exitCode ?? 0);

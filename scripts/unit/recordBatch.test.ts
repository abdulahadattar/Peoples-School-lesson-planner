/**
 * Unit tests for the batched student-record writer.
 *
 * These lock in the fix for a real data-loss bug: a NEW student carries
 * `rowNumber: 0` (`StudentEditModal` builds adds that way). Writing it through
 * the batch writer produced the A1 range `R0:AO0`, which is not legal, and
 * because `values:batchUpdate` is request-atomic that single bad row failed the
 * whole chunk - taking up to 50 genuine edits down with it, permanently.
 *
 * `batchUpdateSheetRecords` uses the global `fetch`, so these tests stub it.
 *
 * Run: node node_modules/tsx/dist/cli.mjs scripts/unit/recordBatch.test.ts
 */
import {
  batchUpdateSheetRecords,
  RECORD_BATCH_SIZE,
  type StudentRecord,
} from '../../services/googleSheetsService';

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

const SHEET = 'Test Sheet';
const rec = (rowNumber: number, over: Partial<StudentRecord> = {}): StudentRecord => ({
  rowNumber, grNo: `GR${rowNumber}`, studentName: `Student ${rowNumber}`,
  fatherName: 'Ali Khan', currentClass: 'IX-A', section: 'A', gender: 'Male',
  ...over,
} as unknown as StudentRecord);

interface Sent { url: string; body: any }
let sent: Sent[] = [];
const realFetch = globalThis.fetch;

function stubFetch(respond: (n: number) => Response | Promise<Response>) {
  sent = [];
  (globalThis as any).fetch = async (url: any, init: any = {}) => {
    sent.push({ url: String(url), body: init?.body ? JSON.parse(init.body) : undefined });
    return respond(sent.length);
  };
}
const okResponse = () => ({ ok: true, status: 200, text: async () => '{}' }) as unknown as Response;
const errResponse = (status: number, body: string) =>
  ({ ok: false, status, text: async () => body }) as unknown as Response;
const rangesSent = () => sent.flatMap((s) => (s.body?.data ?? []).map((d: any) => d.range));
const restoreFetch = () => { (globalThis as any).fetch = realFetch; };
const many = (n: number, from = 2) =>
  Array.from({ length: n }, (_, i) => rec(i + from));

/* ── the regression that caused the bug ──────────────────────── */
describe('batchUpdateSheetRecords — new students must not reach the wire');

await it('sends nothing at all for a new student (rowNumber 0)', async () => {
  stubFetch(() => okResponse());
  try {
    const out = await batchUpdateSheetRecords([rec(0)], 'token', 'sheet-id', SHEET);
    eq(sent.length, 0, 'a request was sent for an illegal R0:AO0 range');
    eq(out.updated, 0);
    eq(out.failures.length, 1);
    eq(out.failures[0].rowNumber, 0);
  } finally { restoreFetch(); }
});

await it('does not let a new student poison the real edits beside it', async () => {
  stubFetch(() => okResponse());
  try {
    // The whole point: values:batchUpdate is request-atomic, so one bad row in
    // the array would otherwise fail the request carrying 49 good edits.
    const out = await batchUpdateSheetRecords(
      [rec(5), rec(0), rec(9), rec(-1)],
      'token', 'sheet-id', SHEET
    );
    eq(out.updated, 2, 'both valid rows must still be written');
    eq(out.failures.length, 2, 'the two rowless records are reported, not written');
    eq(rangesSent().every((r) => !/R0|:AO0|:-/.test(r)), true, `illegal range sent: ${rangesSent()}`);
  } finally { restoreFetch(); }
});

await it('rejects a non-integer or negative row rather than emitting a bad range', async () => {
  stubFetch(() => okResponse());
  try {
    const out = await batchUpdateSheetRecords([rec(1.5), rec(-4), rec(0)], 'token', 'sheet-id', SHEET);
    eq(sent.length, 0);
    eq(out.failures.length, 3);
  } finally { restoreFetch(); }
});

/* ── batching behaviour ──────────────────────────────────────── */
describe('batchUpdateSheetRecords — request economy');

await it('collapses many edits into one request', async () => {
  stubFetch(() => okResponse());
  try {
    const out = await batchUpdateSheetRecords(many(40), 'token', 'sheet-id', SHEET);
    eq(out.requests, 1, 'a class of 40 must not cost 40 writes against a 60/min quota');
    eq(out.updated, 40);
    eq(rangesSent().length, 40, 'all 40 rows ride in that single request');
  } finally { restoreFetch(); }
});

await it('splits into one request per RECORD_BATCH_SIZE rows', async () => {
  stubFetch(() => okResponse());
  try {
    const out = await batchUpdateSheetRecords(
      many(RECORD_BATCH_SIZE * 2 + 5), 'token', 'sheet-id', SHEET
    );
    eq(out.requests, 3, 'a chunk boundary must produce exactly one extra request');
    eq(out.updated, RECORD_BATCH_SIZE * 2 + 5);
  } finally { restoreFetch(); }
});

await it('writes only the app-owned columns', async () => {
  stubFetch(() => okResponse());
  try {
    await batchUpdateSheetRecords([rec(7)], 'token', 'sheet-id', SHEET);
    eq(rangesSent(), [`'${SHEET}'!R7:AO7`], 'columns A-Q belong to the sheet and must not be rewritten');
  } finally { restoreFetch(); }
});

/* ── failure handling ────────────────────────────────────────── */
describe('batchUpdateSheetRecords — failures');

await it('reports every row of a failed chunk and keeps going', async () => {
  stubFetch(() => errResponse(500, 'Backend Error'));
  try {
    const out = await batchUpdateSheetRecords(
      many(RECORD_BATCH_SIZE * 2 + 5), 'token', 'sheet-id', SHEET
    );
    eq(out.requests, 3, 'a server error is not a sign-in problem, so each chunk is tried');
    eq(out.updated, 0);
    eq(out.failures.length, RECORD_BATCH_SIZE * 2 + 5, 'every row stays queued for the next Sync');
  } finally { restoreFetch(); }
});

await it('stops after an auth failure instead of burning the quota', async () => {
  stubFetch(() => errResponse(401, 'Request was unauthorized'));
  try {
    const out = await batchUpdateSheetRecords(many(RECORD_BATCH_SIZE * 3), 'token', 'sheet-id', SHEET);
    eq(out.requests, 1, 'a dead token cannot succeed on the next chunk');
    eq(out.failures.length, RECORD_BATCH_SIZE * 3, 'the unsent rows are still reported as waiting');
  } finally { restoreFetch(); }
});

await it('does nothing for an empty list', async () => {
  stubFetch(() => okResponse());
  try {
    const out = await batchUpdateSheetRecords([], 'token', 'sheet-id', SHEET);
    eq(sent.length, 0);
    eq(out, { updated: 0, failures: [], requests: 0 });
  } finally { restoreFetch(); }
});

/* ── summary ──────────────────────────────────────────────────── */
log(`\n${'═'.repeat(34)}`);
if (fail === 0) log(`  ${c.g(`${pass} passed`)}`);
else {
  log(`  ${c.g(`${pass} passed`)}  ${c.r(`${fail} failed`)}`);
  failures.forEach(f => log(c.r(`  • ${f}`)));
  process.exitCode = 1;
}

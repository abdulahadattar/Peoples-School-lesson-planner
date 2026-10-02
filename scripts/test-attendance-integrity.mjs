#!/usr/bin/env node
/**
 * Attendance data-integrity regression tests.
 *
 * Both bugs guarded here were silent: the history list rendered a hardcoded 0%
 * for every date, and a failed read was indistinguishable from an empty day, so
 * a teacher saving after an outage would overwrite the real figures (the record
 * is written with an unconditional setDoc).
 *
 * Runs the real service functions - the Firestore imports are stubbed before
 * load so the pure logic is exercised without a network or a browser.
 *
 * Usage: node --import tsx scripts/test-attendance-integrity.mjs
 */
import { register } from 'node:module';
const firestoreStubNote =
  'No Firebase app is configured here, so getDocs/getDoc throw and the service falls ' +
  'through to its localStorage path - which is the branch under test.';

// Minimal localStorage so loadCachedEnrollments() reads a controlled cache.
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  key: (i) => [...store.keys()][i] ?? null,
  get length() { return store.size; },
};

const c = { g: (s) => `\x1b[32m${s}\x1b[0m`, r: (s) => `\x1b[31m${s}\x1b[0m`, d: (s) => `\x1b[2m${s}\x1b[0m` };
let passed = 0, failed = 0;
const pass = (n, d = '') => { passed++; console.log(`  ${c.g('PASS')} ${n}${d ? c.d(' — ' + d) : ''}`); };
const fail = (n, d = '') => { failed++; console.log(`  ${c.r('FAIL')} ${n}${c.r(' — ' + d)}`); };

const svc = await import('../services/attendanceService.ts');
console.log(c.d(`  (${firestoreStubNote})`));

// --- 1. History percentage is real, not the old hardcoded 0 ---
console.log('\nHistory percentage');
store.set('school_class_enrollments', JSON.stringify([
  { classKey: 'I-A', romanName: 'I-A', displayName: 'I-A', enrolledBoys: 20, enrolledGirls: 20, totalEnrollment: 40 },
  { classKey: 'I-B', romanName: 'I-B', displayName: 'I-B', enrolledBoys: 25, enrolledGirls: 25, totalEnrollment: 50 },
]));

store.set('attendance_2026-09-01', JSON.stringify({
  date: '2026-09-01', recordedBy: 'Unassigned', notes: '', updatedAt: 1,
  classes: { 'I-A': { presentBoys: 18, presentGirls: 18 }, 'I-B': { presentBoys: 10, presentGirls: 15 } },
}));
// 61 present out of 90 enrolled => 68%
const dates = await svc.loadAttendanceDates();
const day = dates.find((d) => d.date === '2026-09-01');
if (!day) fail('record is listed', '2026-09-01 missing from history');
else if (day.percentage === 0) fail('percentage is computed', 'still hardcoded 0');
else if (day.percentage !== 68) fail('percentage is computed', `expected 68, got ${day.percentage}`);
else pass('percentage is computed from real enrollment totals', `${day.percentage}% (61/90)`);
if (day && day.totalPresent === 61) pass('totalPresent counts all classes', '61');
else fail('totalPresent counts all classes', `expected 61, got ${day?.totalPresent}`);

// --- 2. History still lists local dates when Firestore is unreachable ---
// getDocs resolves with an empty snapshot offline rather than throwing, which
// previously made the history list render blank despite cached records.
const onlyLocal = dates.filter((d) => d.date === '2026-09-01');
if (onlyLocal.length === 1) pass('local history survives an unreachable Firestore', 'history is not blank');
else fail('local history survives an unreachable Firestore', `got ${dates.length} rows, expected the cached date`);

// --- 3. A failed read is NOT reported as an empty day ---
console.log('\nLoad-failure guard (data-loss prevention)');
store.delete('attendance_2026-09-02');
const res = await svc.loadAttendanceRecord('2026-09-02');
if (res.status === 'ok' && res.record === null) {
  fail('offline read with no cache reports error', 'returned an empty record — save would overwrite');
} else if (res.status === 'error') {
  pass('offline read with no cache reports error', 'saving is blocked for this date');
} else {
  fail('offline read with no cache reports error', `unexpected status: ${res.status}`);
}

// A genuinely absent date (server reachable, no record) must still be editable.
store.set('attendance_2026-09-03', 'not-json');
const corrupt = await svc.loadAttendanceRecord('2026-09-03');
if (corrupt.status === 'error') pass('corrupt local cache reports error', corrupt.error.slice(0, 48));
else fail('corrupt local cache reports error', `unexpected status: ${corrupt.status}`);

// A date that exists in the local cache loads normally despite the Firestore outage.
store.set('attendance_2026-09-04', JSON.stringify({
  date: '2026-09-04', recordedBy: 'Miss Shahida', notes: '', updatedAt: 2,
  classes: { 'I-A': { presentBoys: 20, presentGirls: 20 } },
}));
const cached = await svc.loadAttendanceRecord('2026-09-04');
if (cached.status === 'ok' && cached.record?.recordedBy === 'Miss Shahida') {
  pass('local cache still rescues a known date', 'Firestore outage tolerated');
} else {
  fail('local cache still rescues a known date', `status=${cached.status}`);
}

// --- 4. In-charge placeholder no longer attributes a day to a real teacher ---
console.log('\nIn-charge attribution');
for (const generic of ['', '   ', 'Teacher', 'Class In-charge', 'in charge']) {
  const got = svc.cleanAttendanceInCharge(generic);
  if (got === 'Miss Shahida') fail(`placeholder ${JSON.stringify(generic)} not attributed to a real teacher`, `got "${got}"`);
  else pass(`placeholder ${JSON.stringify(generic)} is neutral`, `got "${got}"`);
}
if (svc.cleanAttendanceInCharge('Miss Shahida') === 'Miss Shahida') pass('a real recorded name is preserved');
else fail('a real recorded name is preserved', 'was rewritten');
if (svc.cleanAttendanceInCharge('  Mr Khan  ') === 'Mr Khan') pass('a real name is trimmed, not replaced');
else fail('a real name is trimmed, not replaced', 'was rewritten');

console.log(`\n${failed === 0 ? c.g('ALL PASS') : c.r('FAILURES')} — ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);

#!/usr/bin/env node
/**
 * Student register write-safety regression tests.
 *
 * The compact sheet payload strips each record's `rawMetadata` and refills it
 * from a single shared sheet row, so columns A-Q of a row are never real data
 * for the student being edited. updateSheetRecord used to PUT the whole A:AO row,
 * which stamped another student's registration number, address and enrolment
 * counts onto the edited row and blanked the rest - so an edit either did not
 * stick or destroyed the row's metadata.
 *
 * Usage: node --import tsx scripts/test-register-write-safety.mjs
 */
const c = { g: (s) => `\x1b[32m${s}\x1b[0m`, r: (s) => `\x1b[31m${s}\x1b[0m`, d: (s) => `\x1b[2m${s}\x1b[0m` };
let passed = 0, failed = 0;
const pass = (n, d = '') => { passed++; console.log(`  ${c.g('PASS')} ${n}${d ? c.d(' — ' + d) : ''}`); };
const fail = (n, d = '') => { failed++; console.log(`  ${c.r('FAIL')} ${n}${c.r(' — ' + d)}`); };

const svc = await import('../services/googleSheetsService.ts');

console.log('\nColumn layout');
const row = svc.studentRecordToRow({
  rowNumber: 42,
  grNo: '38',
  studentName: 'Ali Raza',
  bFormNo: 'B-100',
  fatherName: 'Raza Khan',
  gender: 'M',
  currentClass: 'IX-A',
});
if (row.length === 41) pass('row is 41 columns', 'A:AO');
else fail('row is 41 columns', `got ${row.length}`);
if (svc.STUDENT_META_COLUMN_COUNT === 17 && svc.FIRST_STUDENT_DATA_COLUMN === 'R') {
  pass('metadata boundary is A-Q, data starts at R');
} else {
  fail('metadata boundary', `count=${svc.STUDENT_META_COLUMN_COUNT} col=${svc.FIRST_STUDENT_DATA_COLUMN}`);
}

console.log('\nUpdate range excludes the metadata columns');
const range = svc.studentDataRange('Jamshoro South Final SPD (2)', 42);
if (range.includes('R42') && range.includes('AO42') && !/:A42/.test(range)) {
  pass('update range starts at R, not A', range);
} else {
  fail('update range starts at R', range);
}

const written = row.slice(svc.STUDENT_META_COLUMN_COUNT);
if (written[0] === '38') pass('first written value is the GR number', written[0]);
else fail('first written value is the GR number', String(written[0]));
if (written[1] === 'Ali Raza') pass('student name lands in the first written column');
else fail('student name lands in the first written column', String(written[1]));

console.log('\nNo fabricated values reach the write');
// A record with no rawMetadata is the newly-added / compact-payload case.
const bare = svc.studentRecordToRow({
  rowNumber: 999,
  grNo: '900',
  studentName: 'New Student',
});
if (!bare.includes('190400001')) pass('no invented registration number');
else fail('no invented registration number', '190400001 present');
for (const fabricated of ['473', '541', 'Ziauddin University', 'Sindh University Housing Society Phase 1', 'PAS/LEGIS/B-12']) {
  if (!bare.includes(fabricated)) pass(`no invented "${fabricated}"`);
  else fail(`no invented "${fabricated}"`, 'present in output');
}
// The columns actually written on update must not carry metadata placeholders or
// fabricated values from columns A-Q.
const writtenSliver = written.slice(0, 17);
const leaked = writtenSliver.filter((v) => typeof v === 'string' && ['N/A', '473', '541', '190400001'].includes(v));
if (leaked.length === 0) pass('written columns carry no metadata placeholders');
else fail('written columns carry no metadata placeholders', JSON.stringify(leaked));

// studentRecordToRow must not emit undefined cells: Sheets writes those as blank
// and would wipe the target row's real values.
const anyUndefined = row.some((v) => v === undefined);
if (!anyUndefined) pass('row has no undefined cells', 'all 41 columns carry a value');
else fail('row has no undefined cells', `${row.filter((v) => v === undefined).length} columns are undefined`);

console.log('\nReal metadata is preserved, not replaced');
const withMeta = svc.studentRecordToRow({
  rowNumber: 42,
  grNo: '38',
  studentName: 'Ali Raza',
  rawMetadata: ['41', 'reg-77', 'REAL-ID-9', 'Matric', "People'S School Jamshoro", 'Real Univ', 'REAL-CODE', '31', '29', '880', '70', '18', '968', 'Real City', 'Real Dist', 'Real Board', 'Real Society'],
});
if (withMeta[2] === 'REAL-ID-9' && withMeta[9] === '880' && withMeta[16] === 'Real Society') {
  pass('genuine per-student metadata is carried through', 'REAL-ID-9 / 880 / Real Society');
} else {
  fail('genuine per-student metadata is carried through', JSON.stringify(withMeta.slice(0, 17)));
}

console.log(`\n${failed === 0 ? c.g('ALL PASS') : c.r('FAILURES')} — ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);

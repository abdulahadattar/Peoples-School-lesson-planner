#!/usr/bin/env node
/**
 * Paper History regression tests.
 *
 * Editing a question (add / edit / delete) used to call saveExamPaperToDb every
 * time, which mints a fresh id and prepends the result. Opening one paper from
 * History and making three edits therefore left four rows in the archive instead
 * of one. updateSavedPaperInDb existed to do the right thing but was never
 * called.
 *
 * Usage: node --import tsx --import ./scripts/test-hooks/alias-idb.mjs scripts/test-paper-history.mjs
 */
const c = { g: (s) => `\x1b[32m${s}\x1b[0m`, r: (s) => `\x1b[31m${s}\x1b[0m`, d: (s) => `\x1b[2m${s}\x1b[0m` };
let passed = 0, failed = 0;
const pass = (n, d = '') => { passed++; console.log(`  ${c.g('PASS')} ${n}${d ? c.d(' — ' + d) : ''}`); };
const fail = (n, d = '') => { failed++; console.log(`  ${c.r('FAIL')} ${n}${c.r(' — ' + d)}`); };

const svc = await import('../services/storageService.ts');
const { __mem } = await import('./stubs/idb-keyval-stub.mjs');
const PAPERS = 'phssj_saved_exam_papers_v1';

const makePaper = (qCount = 2) => ({
  title: 'Math Weekly Test',
  gradeLevel: 'IX-A',
  subject: 'Mathematics',
  chapterName: 'Algebra',
  totalMarks: qCount * 5,
  durationMinutes: 60,
  sections: [{
    title: 'Question Section',
    instruction: 'Answer all questions.',
    questions: Array.from({ length: qCount }, (_, i) => ({
      id: `q_${i}`, type: 'short', question: `Question ${i + 1}`, marks: 5,
    })),
  }],
});

// --- 1. A brand new paper creates exactly one record ---
console.log('\nNew paper');
__mem().clear();
const first = await svc.saveExamPaperToDb(makePaper(2), { name: 'Ms Teacher', schoolName: 'PHSSJ' });
let rows = (await svc.getSavedPapers());
if (rows.length === 1) pass('first save creates one record', rows[0].id);
else fail('first save creates one record', `got ${rows.length}`);
if (rows[0]?.teacherInfo?.name === 'Ms Teacher') pass('teacher info is stored on save');
else fail('teacher info is stored on save', 'not persisted');

// --- 2. Editing that paper in place does NOT add a row ---
console.log('\nEditing a paper opened from History');
for (const label of ['edit Q1', 'add Q3', 'delete Q2']) {
  const edited = JSON.parse(JSON.stringify(rows[0].paper));
  if (label === 'edit Q1') edited.sections[0].questions[0].question = 'Question 1 (revised)';
  if (label === 'add Q3') {
    edited.sections[0].questions.push({ id: 'q_new', type: 'short', question: 'Question 3', marks: 5 });
  }
  if (label === 'delete Q2') edited.sections[0].questions.splice(1, 1);
  // The id stamped by HistoryView is what makes this an update rather than an insert.
  await svc.updateSavedPaperInDb(rows[0].id, edited);
  rows = await svc.getSavedPapers();
  if (rows.length === 1) pass(`"${label}" updates in place, no duplicate row`, 'still 1 record');
  else fail(`"${label}" updates in place`, `history grew to ${rows.length} rows`);
}

// --- 3. The edit is actually persisted, and identity is preserved ---
console.log('\nPersisted result');
if (rows[0].id === first.id) pass('record id is stable across edits', first.id);
else fail('record id is stable across edits', `id changed to ${rows[0].id}`);
if (rows[0].createdAt === first.createdAt) pass('createdAt is preserved, not reset');
else fail('createdAt is preserved', 'timestamp was rewritten');
if (rows[0].teacherInfo?.name === 'Ms Teacher') pass('teacher info survives the edit');
else fail('teacher info survives the edit', 'was dropped');
const qs = rows[0].paper.sections[0].questions;
if (qs.length === 2 && qs[0].question === 'Question 1 (revised)') {
  pass('the actual edit is saved', `${qs.length} questions, Q1 revised`);
} else {
  fail('the edit is saved', `unexpected questions: ${JSON.stringify(qs.map((x) => x.question))}`);
}

// --- 4. A stale id must not silently discard the edit ---
console.log('\nStale id resilience');
__mem().clear();
await svc.saveExamPaperToDb(makePaper(1), { name: 'Ms Teacher', schoolName: 'PHSSJ' });
const orphan = makePaper(2);
orphan.savedPaperId = 'paper_does_not_exist';
const updated = await svc.updateSavedPaperInDb('paper_does_not_exist', orphan);
rows = await svc.getSavedPapers();
if (updated === false && rows.length === 2) {
  pass('unknown id falls back to creating a record instead of dropping the edit');
} else {
  fail('unknown id falls back to creating a record', `returned ${updated}, ${rows.length} rows`);
}
if (rows.some((r) => r.id === orphan.savedPaperId)) pass('the new id is written back for later edits', orphan.savedPaperId);
else fail('the new id is written back for later edits', 'savedPaperId not updated');

console.log(`\n${failed === 0 ? c.g('ALL PASS') : c.r('FAILURES')} — ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);

/**
 * Final coverage batch: the exam-paper renderers, the timetable sheet layout
 * detector, the sheet config, and the exported constants that other modules
 * depend on.
 *
 * Run: node node_modules/tsx/dist/cli.mjs scripts/unit/rendering.test.ts
 */
import {
  OPTION_CIRCLE, optionLine, sanitizeSingleQuestion, paperSectionNote,
  sectionInstruction, sectionMarkingNote, layoutOptions, cleanQuestionText,
  questionNumber, optionLetter,
} from '../../services/paperLayout';
import { detectLayout, colLetter, colIndex0, readCell, cellRef } from '../../services/timetableSheetLayout';
import {
  TIMETABLE_SHEET_ID, TIMETABLE_SHEET_URL, TIMETABLE_SHEET_TABS,
  timetableCsvUrl, TIMETABLE_SHEET_CACHE_TTL_MS, TIMETABLE_SHEET_POLL_MS,
} from '../../services/timetableSheetConfig';
import { TIER_CONFIG, getClassTier } from '../../services/tierHelpers';
import { DUTIES_SCHEDULE, getActiveDutyStatus } from '../../services/breakDuties';
import { LATEX_COMMANDS } from '../../services/mathDetection';
import { getPakistanDate } from '../../services/timetable';
import { DAY_KEYS } from '../../services/timetable';

let pass = 0, fail = 0;
const failures: string[] = [];
let suite = '';
const log = (m = '') => process.stdout.write(m + '\n');
const describe = (n: string) => { suite = n; log(`\n── ${n} ──`); };
function it(name: string, fn: () => void) {
  try { fn(); pass++; log(`  ✅ ${name}`); }
  catch (e: any) {
    fail++; failures.push(`[${suite}] ${name}\n        ${String(e.message).split('\n')[0]}`);
    log(`  ❌ ${name}\n       ${String(e.message).split('\n')[0]}`);
  }
}
const eq = (a: unknown, b: unknown, m = '') => {
  const A = JSON.stringify(a), B = JSON.stringify(b);
  if (A !== B) throw new Error(`${m}\n  expected: ${B}\n  actual:   ${A}`);
};
const q = (over: any = {}) => ({ id: 'q1', type: 'mcq', question: 'What is pressure?', marks: 1, options: ['a', 'b'], ...over } as any);
const sec = (over: any = {}) => ({ id: 's1', title: 'MCQs', instruction: 'Choose one', questions: [q()], ...over } as any);

describe('paperLayout — option and question rendering');

it('OPTION_CIRCLE is the hollow circle students fill in', () => {
  eq(OPTION_CIRCLE, '○');
  eq(optionLine(0, 'x').startsWith(OPTION_CIRCLE), true, 'optionLine must build on OPTION_CIRCLE');
  eq(optionLine(0, 'x').includes('a)'), true);
});
it('optionLine renders circle + letter + cleaned text, and never double-prefixes', () => {
  eq(optionLine(0, '12 m/s'), '○ a) 12 m/s');
  eq(optionLine(3, 'D) 48 m/s'), '○ d) 48 m/s', 'an AI-supplied option letter is stripped first');
  eq(optionLine(1, '12 m/s').includes('a)'), false, 'must not leave a stray a)');
});
it('option letters and question numbers are 0-based in code, 1-based on the page', () => {
  eq(optionLetter(0), 'a');
  eq(optionLetter(25), 'z');
  eq(questionNumber(0), 'Q1');
  eq(questionNumber(8), 'Q9');
});
it('sanitizeSingleQuestion cleans the text and keeps the options', () => {
  const r = sanitizeSingleQuestion(q({ question: 'Q1: What is pressure? (1 Mark)' }));
  eq(r.question, 'What is pressure?');
  eq(r.options, ['a', 'b']);
  eq(r.marks, 1, 'marks must survive');
});
it('sanitizeSingleQuestion rescues options the AI crammed into the question', () => {
  const r = sanitizeSingleQuestion(q({ question: 'What is pressure? A) 10 B) 20 C) 30', options: [] }));
  eq(r.options.length, 3, `expected 3 recovered options, got ${JSON.stringify(r.options)}`);
  eq(r.options[0], '10');
  eq(r.question.includes('A)'), false, 'option text must be removed from the question');
});
it('sanitizeSingleQuestion does not invent options for a non-MCQ', () => {
  const r = sanitizeSingleQuestion(q({ type: 'short', question: 'Define pressure', options: undefined }));
  eq(r.options, undefined);
  eq(r.question, 'Define pressure');
});
it('sanitizeSingleQuestion is idempotent', () => {
  const once = sanitizeSingleQuestion(q({ question: 'Q1: What is pressure? (1 Mark)' }));
  eq(sanitizeSingleQuestion(once), once, 'cleaning twice must equal cleaning once');
});
it('paperSectionNote uses the blueprint when the paper has one', () => {
  const paper = { sectionBlueprints: [{ perQuestionMarks: 2, questionCount: 7, attemptCount: 5 }] } as any;
  eq(paperSectionNote(paper, 0, sec()), 'Attempt any 5 of the 7 questions. Each question carries 2 marks.');
  // Falls back to the section's own first question, and uses the singular.
  eq(paperSectionNote({} as any, 0, sec()), 'Each question carries 1 mark.');
});
it('sectionInstruction is suppressed when the AI already stated the marking rule', () => {
  eq(sectionInstruction(sec({ instruction: 'Each question carries 2 marks.' })), '');
  eq(sectionInstruction(sec({ instruction: 'Attempt any 5 questions.' })), '');
  eq(sectionInstruction(sec({ instruction: 'Answer all questions.' })), 'Answer all questions.');
  eq(sectionInstruction(sec({ instruction: '' })), '');
});
it('sectionMarkingNote agrees with paperSectionNote for the same inputs', () => {
  const s = sec();
  const bp = { perQuestionMarks: 4, questionCount: 5, attemptCount: 2 } as any;
  eq(sectionMarkingNote(s, bp), paperSectionNote({ sectionBlueprints: [bp] } as any, 0, s));
});
it('layoutOptions still pairs options after the text cleanup', () => {
  const rows = layoutOptions(['A) 12 m/s', 'B) 24 m/s']);
  eq(rows.length, 1);
  eq(rows[0].options.map(o => o.text), ['12 m/s', '24 m/s']);
});

describe('timetableSheetLayout.detectLayout');

it('falls back safely on an empty or malformed grid', () => {
  for (const bad of [[], null as any, 'nope' as any, [[]]]) {
    const l = detectLayout(bad as any);
    eq(typeof l, 'object');
    // columns is a day -> column-index MAP, not an array.
    eq(l.columns && typeof l.columns === 'object', true, 'a fallback layout still needs a columns map');
    eq(typeof l.headerRow, 'number');
    eq(Array.isArray(l.periodRows), true);
  }
});
it('does not throw on a grid with irregular row lengths', () => {
  const l = detectLayout([['A'], ['A', 'B', 'C'], [], ['A', 'B']]);
  eq(typeof l, 'object');
  eq(l.columns && typeof l.columns === 'object', true);
});
it('readCell still reads a known grid after a fallback detection', () => {
  detectLayout([]);
  eq(readCell([['x']], 1, 0), 'x');
});

describe('timetableSheetConfig');

it('embeds one sheet id consistently everywhere', () => {
  eq(typeof TIMETABLE_SHEET_ID, 'string');
  eq(TIMETABLE_SHEET_ID.length > 20, true);
  eq(TIMETABLE_SHEET_URL.includes(TIMETABLE_SHEET_ID), true);
  eq(timetableCsvUrl(123).includes(TIMETABLE_SHEET_ID), true);
  eq(timetableCsvUrl(123).includes('gid=123'), true);
  eq(timetableCsvUrl(123).includes('format=csv'), true);
});
it('csv urls differ per tab gid', () => {
  eq(timetableCsvUrl(1) === timetableCsvUrl(2), false);
});
it('every declared tab has a usable, unique gid', () => {
  eq(Array.isArray(TIMETABLE_SHEET_TABS), true);
  eq(TIMETABLE_SHEET_TABS.length > 0, true);
  for (const t of TIMETABLE_SHEET_TABS) {
    if (typeof t.gid !== 'number' || t.gid < 0) throw new Error(`bad tab: ${JSON.stringify(t)}`);
    if (typeof t.name !== 'string' || !t.name) throw new Error(`tab without a name: ${JSON.stringify(t)}`);
    if (typeof t.classLabel !== 'string' || !t.classLabel) throw new Error(`tab without a classLabel: ${JSON.stringify(t)}`);
  }
  const gids = TIMETABLE_SHEET_TABS.map(t => t.gid);
  eq(new Set(gids).size, gids.length, 'tab gids must be unique');
});
it('cache and poll intervals are minutes, not seconds or milliseconds', () => {
  eq(TIMETABLE_SHEET_CACHE_TTL_MS, 15 * 60 * 1000);
  eq(TIMETABLE_SHEET_POLL_MS, 15 * 60 * 1000);
  for (const v of [TIMETABLE_SHEET_CACHE_TTL_MS, TIMETABLE_SHEET_POLL_MS]) {
    if (v < 60_000) throw new Error(`interval ${v} is under a minute`);
  }
});

describe('exported constants other modules depend on');

it('TIER_CONFIG has an entry for every tier getClassTier can return', () => {
  for (const label of ['ECCE', 'V', 'VI-A', 'XII']) {
    const tier = getClassTier(label);
    eq(tier in TIER_CONFIG, true, `TIER_CONFIG missing ${tier}`);
    eq(TIER_CONFIG[tier as keyof typeof TIER_CONFIG].id, tier, 'id must match the key');
  }
});
it('DUTIES_SCHEDULE covers exactly the school days', () => {
  for (const d of DAY_KEYS) eq(d in DUTIES_SCHEDULE, true, `missing ${d}`);
  eq(Object.keys(DUTIES_SCHEDULE).sort(), [...DAY_KEYS].sort());
});
it('LATEX_COMMANDS lists the commands the sanitizer relies on, as an alternation', () => {
  eq(typeof LATEX_COMMANDS, 'string');
  for (const cmd of ['frac', 'sqrt', 'times', 'pm', 'begin', 'end', 'text', 'alpha']) {
    eq(LATEX_COMMANDS.includes(cmd), true, `LATEX_COMMANDS is missing ${cmd}`);
  }
  eq(/\|/.test(LATEX_COMMANDS), true, 'must stay an alternation so it embeds in a RegExp');
});
it('getPakistanDate returns a real date and keeps the calendar day', () => {
  eq(getPakistanDate() instanceof Date, true);
  const d = getPakistanDate(new Date('2026-09-30T12:00:00Z'));
  eq(d instanceof Date, true);
  eq(Number.isNaN(d.getTime()), false);
  eq(d.getFullYear(), 2026);
  eq(d.getMonth(), 8, 'September is index 8');
  eq(d.getDate(), 30);
});

log(`\n${'='.repeat(60)}`);
log(`  ${pass} passed${fail ? `, ${fail} failed` : ''}`);
if (failures.length) { log('\n  Failed:'); failures.forEach(f => log(`    • ${f}`)); }
log('');
process.exitCode = fail > 0 ? 1 : 0;



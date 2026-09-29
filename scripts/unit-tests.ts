/**
 * Unit tests for the pure-logic modules of the PHSSJ Lesson Planner.
 *
 * Scope: deterministic logic only — no network, no browser, no Firebase.
 * Modules that import Firebase/IndexedDB at module scope (attendanceService,
 * substitutionService) and DOM-only modules (equationRenderer, exportService)
 * are covered by the browser suite (scripts/e2e-smoke.mjs) instead.
 *
 * Run:  npm run test:unit        (tsx scripts/unit-tests.ts)
 */
import assert from 'node:assert/strict';
import { isFormulaText, splitMathSegments, MATH_REGEX } from '../services/mathDetection';
import { sanitizeMathText, sanitizeStringFields, latexToUnicodeText } from '../services/latexSanitizer';
import { getClassTier, getTeacherTiers, getTeacherTierHint } from '../services/tierHelpers';
import { cleanAndParseJson, fixJsonControlChars } from '../services/jsonHelpers';
import {
  getGradeNumber, getGradeName, sortClassesByGrade, findClass, findSubject,
} from '../services/curriculumHelpers';
import {
  questionNumber, optionLetter, optionPrefix, cleanQuestionText, cleanOptionText,
  layoutOptions, sectionMarkingNote, sectionAttemptMarks, hasOptions,
} from '../services/paperLayout';
import { estimatePayloadSize, formatByteSize } from '../utils/payloadOptimizer';
import {
  DAY_KEYS, dayKeyForDate, parseTimeToMinutes, formatMinutes, periodTimeRange,
  locatePeriod, standardSchedule, resolveSlot, computeStaff, loadTimetable,
} from '../services/timetable';
import {
  parseTimetableCell, formatTimetableCell, auditFullTimetable,
} from '../services/timetableConflictEngine';
import { normalizeSubject, isKnownSubject, sectionToClassId } from '../services/teacherRoster';
import { getActiveDutyStatus, matchTeacherForDuty, resolveDutyStaff } from '../services/breakDuties';
import teachersJson from '../data/teachers.json';
import type { Teacher, CurriculumClass } from '../types';

/* ── Tiny harness ─────────────────────────────────────────────── */

const c = { g: s => `\x1b[32m${s}\x1b[0m`, r: s => `\x1b[31m${s}\x1b[0m`, d: s => `\x1b[2m${s}\x1b[0m`, b: s => `\x1b[1m${s}\x1b[0m`, cy: s => `\x1b[36m${s}\x1b[0m` };
let passed = 0;
let failed = 0;
const failures: { suite: string; name: string; reason: string }[] = [];
let suite = '';

const log = (m = '') => process.stdout.write(m + '\n');
const describe = (name: string) => { suite = name; log(`\n${c.b(c.cy(`── ${name} ──`))}`); };

function it(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    log(`${c.g('  ✅')} ${name}`);
  } catch (err) {
    failed++;
    const reason = (err as Error)?.message || String(err);
    failures.push({ suite, name, reason });
    log(`${c.r('  ❌')} ${name}\n${c.r(`       ${reason.split('\n')[0]}`)}`);
  }
}

/** Deep-equality assertion with a readable diff. */
const eq = (actual: unknown, expected: unknown, msg = '') =>
  assert.deepStrictEqual(actual, expected, msg);

const teachers = (teachersJson as { teachers: Teacher[] }).teachers;

/* ── mathDetection: "is this math?" gate ──────────────────────── */

describe('mathDetection.isFormulaText');
it('keeps real formulas as math', () => {
  for (const f of ['F = ma', 'x + y', '\\frac{1}{3}\\rho v^2', '10^{23}', '2NO + O_2', '12 m/s', '3/4', 'v^2']) {
    eq(isFormulaText(f), true, `expected ${JSON.stringify(f)} to be math`);
  }
});
it('demotes prose to plain text', () => {
  for (const p of [
    'Bios',
    'Photosynthesis is the process by which green plants make food',
    'the quick brown fox',
    '',
    'a'.repeat(300),
  ]) {
    eq(isFormulaText(p), false, `expected ${JSON.stringify(p.slice(0, 30))} to be prose`);
  }
});
it('rejects fragments longer than 250 chars', () => {
  eq(isFormulaText('F = ' + 'a'.repeat(300)), false);
});

describe('mathDetection.MATH_REGEX');
it('matches both inline $...$ and display $$...$$', () => {
  MATH_REGEX.lastIndex = 0;
  const hits = 'a $x$ b $$y = z$$ c'.match(MATH_REGEX) || [];
  eq(hits.length, 2);
  eq(hits[0], '$x$');
  eq(hits[1], '$$y = z$$');
});

describe('mathDetection.splitMathSegments');
it('splits prose and math around an inline equation', () => {
  eq(splitMathSegments('The force is $F = ma$ today.'), [
    { text: 'The force is ', math: '', display: false },
    { text: '', math: 'F = ma', display: false },
    { text: ' today.', math: '', display: false },
  ]);
});
it('turns prose wrongly wrapped in $...$ back into text', () => {
  eq(splitMathSegments('$Photosynthesis$ happens'), [
    { text: 'Photosynthesis', math: '', display: false },
    { text: ' happens', math: '', display: false },
  ]);
});

/* ── latexSanitizer ───────────────────────────────────────────── */

describe('latexSanitizer.sanitizeMathText');
it('unwraps prose that the model wrapped in delimiters', () => {
  eq(sanitizeMathText('$Bios$'), 'Bios');
});
it('wraps a bare power in delimiters', () => {
  eq(sanitizeMathText('Area is 10^{23} square metres'), 'Area is $10^{23}$ square metres');
});
it('wraps a bare LaTeX command in delimiters', () => {
  const out = sanitizeMathText('P = \\frac{1}{3}\\rho v^2');
  eq(out.includes('$\\frac{1}{3}$'), true, out);
  eq(out.includes('$\\rho$'), true, out);
  eq(out.includes('$v^2$'), true, out);
});
it('leaves already-correct math untouched', () => {
  eq(sanitizeMathText('Force $F = ma$ applies'), 'Force $F = ma$ applies');
  eq(sanitizeMathText('$$v = u + at$$'), '$$v = u + at$$');
});
it('removes stray unbalanced $ delimiters', () => {
  // Documented trade-off: the text between the stray dollars is preserved but
  // the delimiters (and the space they occupied) are dropped.
  eq(sanitizeMathText('Cost is $5 and rate is $10 per unit').includes('$'), false);
});
it('is a no-op for text with no math at all', () => {
  eq(sanitizeMathText('Plant cells contain chloroplasts.'), 'Plant cells contain chloroplasts.');
});

describe('latexSanitizer.sanitizeStringFields');
it('walks nested objects and arrays', () => {
  eq(
    sanitizeStringFields({ a: '$Bios$', b: ['$Bios$'], c: { d: '$Bios$' }, n: 5 }),
    { a: 'Bios', b: ['Bios'], c: { d: 'Bios' }, n: 5 }
  );
});

describe('latexSanitizer.latexToUnicodeText');
it('converts fractions', () => {
  eq(latexToUnicodeText('\\frac{1}{2}'), '1/2');
  eq(latexToUnicodeText('\\frac{a+b}{c-d}'), '(a+b)/(c-d)');
});
it('converts powers to superscript', () => {
  eq(latexToUnicodeText('v^2'), 'v²');
  eq(latexToUnicodeText('10^{23}'), '10²³');
  eq(latexToUnicodeText('x^{-1}'), 'x⁻¹');
});
it('converts subscripts in chemical formulas (regression: H_2O -> H_(2O))', () => {
  eq(latexToUnicodeText('H_2O'), 'H₂O');
  eq(latexToUnicodeText('CO_2'), 'CO₂');
  eq(latexToUnicodeText('H_2SO_4'), 'H₂SO₄');
});
it('keeps a non-mappable subscript explicit rather than mangling it', () => {
  eq(latexToUnicodeText('x_ab'), 'x_(ab)');
});
it('converts roots, greek letters and operators', () => {
  eq(latexToUnicodeText('\\sqrt{x}'), '√(x)');
  eq(latexToUnicodeText('\\alpha + \\beta \\times \\pi'), 'α + β × π');
});
it('returns empty string for empty input', () => {
  eq(latexToUnicodeText(''), '');
});

/* ── tierHelpers ──────────────────────────────────────────────── */

describe('tierHelpers.getClassTier');
it('maps class labels to school tiers', () => {
  const cases: [string, string][] = [
    ['ECCE', 'primary'], ['I-A', 'primary'], ['IV-B', 'primary'],
    ['V', 'elementary'],
    ['VI-A', 'middle'], ['VII', 'middle'], ['VIII', 'middle'],
    ['IX', 'secondary'], ['X-B', 'secondary'], ['XI', 'secondary'], ['XII', 'secondary'],
  ];
  for (const [label, tier] of cases) eq(getClassTier(label), tier, label);
});
it('is case-insensitive about the label', () => {
  eq(getClassTier(' vii '), 'middle');
});

describe('tierHelpers.getTeacherTiers / getTeacherTierHint');
it('derives tiers from the sections a teacher covers', () => {
  const t = { id: 'x', name: 'X', subjects: [{ name: 'Physics', sections: ['IX', 'X-A'] }] } as unknown as Teacher;
  eq(getTeacherTiers(t), ['secondary']);
  eq(getTeacherTierHint(t).label, 'Secondary');
  eq(getTeacherTierHint(t).isMulti, false);
});
it('reports a mixed-tier teacher as multi', () => {
  const t = {
    id: 'x', name: 'X',
    subjects: [{ name: 'Science', sections: ['VI-A'] }, { name: 'Physics', sections: ['IX'] }],
  } as unknown as Teacher;
  const hint = getTeacherTierHint(t);
  eq(hint.isMulti, true);
  eq(hint.label, 'Mid / Sec');
});
it('defaults to Secondary when a teacher has no sections', () => {
  const t = { id: 'x', name: 'X', subjects: [] } as unknown as Teacher;
  eq(getTeacherTiers(t), []);
  eq(getTeacherTierHint(t).label, 'Secondary');
});

/* ── jsonHelpers ──────────────────────────────────────────────── */

describe('jsonHelpers.cleanAndParseJson');
it('parses JSON wrapped in a markdown fence', () => {
  eq(cleanAndParseJson('```json\n{"a": 1}\n```'), { a: 1 });
});
it('parses JSON surrounded by model chatter', () => {
  eq(cleanAndParseJson('Here you go: {"a": {"b": 2}} hope this helps'), { a: { b: 2 } });
});
it('repairs literal newlines inside string values', () => {
  eq(cleanAndParseJson('{"a": "line1\nline2"}'), { a: 'line1\nline2' });
});
it('keeps escaped quotes intact', () => {
  eq(cleanAndParseJson('{"a": "say \\"hi\\""}'), { a: 'say "hi"' });
});

describe('jsonHelpers.fixJsonControlChars');
it('escapes control characters only inside strings', () => {
  eq(fixJsonControlChars('{"a": "x\ty"}'), '{"a": "x\\ty"}');
  eq(fixJsonControlChars('{"a":\n1}'), '{"a":\n1}');
});

/* ── curriculumHelpers ────────────────────────────────────────── */

describe('curriculumHelpers');
it('extracts the grade number and name from a class id', () => {
  eq(getGradeNumber('class9'), 9);
  eq(getGradeNumber('class11'), 11);
  eq(getGradeName('class9'), 'Grade 9');
});
it('sorts classes numerically, not lexically', () => {
  const classes = [{ id: 'class10' }, { id: 'class2' }, { id: 'class9' }] as CurriculumClass[];
  eq(sortClassesByGrade(classes).map(x => x.id), ['class2', 'class9', 'class10']);
  eq(classes.map(x => x.id), ['class10', 'class2', 'class9'], 'must not mutate input');
});
it('finds classes and subjects', () => {
  const classes = [
    { id: 'class9', subjects: [{ id: 'physics', name: 'Physics' }] },
  ] as unknown as CurriculumClass[];
  eq(findClass(classes, 'class9')?.id, 'class9');
  eq(findClass(classes, 'class99'), undefined);
  eq(findSubject(classes, 'class9', 'physics')?.name, 'Physics');
  eq(findSubject(classes, 'class9', 'math'), undefined);
});

/* ── paperLayout ──────────────────────────────────────────────── */

describe('paperLayout numbering helpers');
it('numbers questions from 1 and letters options from a', () => {
  eq(questionNumber(0), 'Q1');
  eq(questionNumber(9), 'Q10');
  eq(optionLetter(0), 'a');
  eq(optionLetter(3), 'd');
  eq(optionPrefix(0), '○ a) ');
  eq(optionPrefix(1), '○ b) ');
});

describe('paperLayout.cleanQuestionText');
it('strips AI numbering, labels and marks annotations', () => {
  eq(cleanQuestionText('1. What is pressure?'), 'What is pressure?');
  eq(cleanQuestionText("Q1: State Newton's first law."), "State Newton's first law.");
  eq(cleanQuestionText('Question 2. Define acceleration (2 Marks)'), 'Define acceleration');
  eq(cleanQuestionText('(i) Calculate velocity'), 'Calculate velocity');
  eq(cleanQuestionText('**Question 1:** Define force'), 'Define force');
});
it('returns an empty string for empty input', () => {
  eq(cleanQuestionText(''), '');
});

describe('paperLayout.cleanOptionText');
it('strips AI option prefixes', () => {
  eq(cleanOptionText('A) 12 m/s'), '12 m/s');
  eq(cleanOptionText('(b) 24 m/s'), '24 m/s');
  eq(cleanOptionText('C. 36 m/s'), '36 m/s');
  eq(cleanOptionText('○ D) 48 m/s'), '48 m/s');
  eq(cleanOptionText('Option A: 10 m/s'), '10 m/s');
});

describe('paperLayout.layoutOptions');
it('pairs two short options per row', () => {
  eq(layoutOptions(['12 m/s', '24 m/s', '36 m/s', '48 m/s']), [
    { options: [{ index: 0, text: '12 m/s' }, { index: 1, text: '24 m/s' }] },
    { options: [{ index: 2, text: '36 m/s' }, { index: 3, text: '48 m/s' }] },
  ]);
});
it('gives an over-long option its own row', () => {
  const long = 'a very long option text that clearly exceeds the forty eight character budget';
  eq(layoutOptions([long, 'short']), [
    { options: [{ index: 0, text: long }] },
    { options: [{ index: 1, text: 'short' }] },
  ]);
});
it('never splits an equation option across a half-width row', () => {
  eq(layoutOptions(['$F = ma$', 'short']), [
    { options: [{ index: 0, text: '$F = ma$' }] },
    { options: [{ index: 1, text: 'short' }] },
  ]);
});
it('returns no rows for no options', () => {
  eq(layoutOptions([]), []);
});

describe('paperLayout.sectionMarkingNote / sectionAttemptMarks');
it('states the marking rule once per section', () => {
  const section = { id: 's1', title: 'MCQs', instruction: 'Choose one', questions: [{ id: '1', type: 'mcq', question: 'q', marks: 2 }] } as any;
  eq(sectionMarkingNote(section), 'Each question carries 2 marks.');
  eq(sectionMarkingNote(section, { perQuestionMarks: 2, questionCount: 7, attemptCount: 5 } as any),
    'Attempt any 5 of the 7 questions. Each question carries 2 marks.');
});
it('uses the singular "mark" for 1 mark', () => {
  const section = { id: 's1', title: 'X', instruction: '', questions: [{ id: '1', type: 'mcq', question: 'q', marks: 1 }] } as any;
  eq(sectionMarkingNote(section), 'Each question carries 1 mark.');
});
it('computes marks actually earned by a full attempt', () => {
  const section = { id: 's1', title: 'X', instruction: '', questions: [{ id: '1', type: 'mcq', question: 'q', marks: 2 }] } as any;
  eq(sectionAttemptMarks(section), 2);
  eq(sectionAttemptMarks(section, { perQuestionMarks: 4, questionCount: 5, attemptCount: 3 } as any), 12);
});

describe('paperLayout.hasOptions');
it('is true only for MCQs that actually have options', () => {
  eq(hasOptions({ type: 'mcq', options: ['a', 'b'] } as any), true);
  eq(hasOptions({ type: 'mcq', options: [] } as any), false);
  eq(hasOptions({ type: 'short' } as any), false);
});

/* ── payloadOptimizer ─────────────────────────────────────────── */

describe('payloadOptimizer');
it('estimates JSON payload size in bytes', () => {
  eq(estimatePayloadSize({ a: 1 }), 7);
  eq(estimatePayloadSize(null), 4);
});
it('formats byte sizes for humans', () => {
  eq(formatByteSize(512), '512 B');
  eq(formatByteSize(2048), '2.0 KB');
  eq(formatByteSize(5 * 1024 * 1024), '5.00 MB');
});

/* ── teacherRoster ────────────────────────────────────────────── */

describe('teacherRoster subject normalisation');
it('maps aliases to canonical subject labels', () => {
  eq(normalizeSubject('maths'), 'Mathematics');
  eq(normalizeSubject('  MATH  '), 'Mathematics');
  eq(normalizeSubject('General_Science'), 'Science');
});
it('distinguishes a known subject from a teacher name', () => {
  eq(isKnownSubject('Physics'), true);
  eq(isKnownSubject('maths'), true);
  eq(isKnownSubject('Feroz'), false);
});
it('maps section labels to curriculum class ids', () => {
  eq(sectionToClassId('X-A'), 'class10');
  eq(sectionToClassId('ECCE'), 'classECCE');
  eq(sectionToClassId('Nope'), undefined);
});

/* ── timetable clock helpers ──────────────────────────────────── */

describe('timetable clock helpers');
it('exposes the six school days and treats Sunday as closed', () => {
  eq(DAY_KEYS, ['mon', 'tue', 'wed', 'thu', 'fri', 'sat']);
  eq(dayKeyForDate(new Date(2026, 0, 4)), null); // Sunday
  eq(dayKeyForDate(new Date(2026, 0, 5)), 'mon');
  eq(dayKeyForDate(new Date(2026, 0, 10)), 'sat');
});
it('parses school clock times', () => {
  eq(parseTimeToMinutes('8:15 AM'), 495);
  eq(parseTimeToMinutes('01:35 PM'), 815);
  eq(parseTimeToMinutes('12:15'), 735);
  eq(parseTimeToMinutes('8:15'), 495);
  eq(parseTimeToMinutes('1:30'), 810); // bare 1-6 resolves to PM
  eq(Number.isNaN(parseTimeToMinutes('')), true);
  eq(Number.isNaN(parseTimeToMinutes('abc')), true);
});
it('formats minutes back to a 12-hour clock', () => {
  eq(formatMinutes(495), '8:15 AM');
  eq(formatMinutes(815), '1:35 PM');
  eq(formatMinutes(0), '12:00 AM');
  eq(formatMinutes(NaN), '--:--');
  eq(formatMinutes(undefined), '--:--');
});
it('uses Friday timings on Friday and regular timings otherwise', () => {
  const p = { no: 1, start: '8:15 AM', end: '8:50 AM', friStart: '8:00 AM', friEnd: '8:30 AM' } as any;
  eq(periodTimeRange(p, 'mon'), { start: 495, end: 530 });
  eq(periodTimeRange(p, 'fri'), { start: 480, end: 510 });
});
it('reports NaN on Friday when the period has no Friday slot', () => {
  const p = { no: 1, start: '8:15 AM', end: '8:50 AM', friStart: null, friEnd: null } as any;
  eq(Number.isNaN(periodTimeRange(p, 'fri').start), true);
});

describe('timetable.locatePeriod');
const twoPeriodDay = {
  label: 'X', classTeacher: '',
  periods: [
    { no: 1, start: '8:15 AM', end: '8:50 AM', friStart: null, friEnd: null, mon: '', tue: '', wed: '', thu: '', fri: '', sat: '' },
    // deliberate 15-minute gap so a break exists
    { no: 2, start: '9:05 AM', end: '9:40 AM', friStart: null, friEnd: null, mon: '', tue: '', wed: '', thu: '', fri: '', sat: '' },
  ],
} as any;
it('identifies the current period', () => {
  eq(locatePeriod(twoPeriodDay, 'mon', 500), { index: 0, state: 'in', label: 'Period 1' });
  eq(locatePeriod(twoPeriodDay, 'mon', 550), { index: 1, state: 'in', label: 'Period 2' });
});
it('identifies the gap between periods as a break', () => {
  eq(locatePeriod(twoPeriodDay, 'mon', 540), { index: 1, state: 'break', label: 'Recess Break' });
});
it('identifies before school and after school', () => {
  eq(locatePeriod(twoPeriodDay, 'mon', 470), { index: 0, state: 'before', label: 'Before school' });
  eq(locatePeriod(twoPeriodDay, 'mon', 900), { index: 1, state: 'after', label: 'School over' });
});

/* ── timetableConflictEngine ──────────────────────────────────── */

describe('timetableConflictEngine.parseTimetableCell');
it('treats empty, em-dash and "free" cells as free periods', () => {
  for (const raw of ['', '   ', '—', '-', 'free', 'Free Period']) {
    const cell = parseTimetableCell(raw, 'IV-A', teachers);
    eq(cell.empty, true, JSON.stringify(raw));
    eq(cell.label, 'Free period');
    eq(cell.teachers.length, 0);
  }
});
it('resolves a known subject to its canonical label', () => {
  const cell = parseTimetableCell('Maths', 'IV-A', teachers);
  eq(cell.empty, false);
  eq(cell.label, 'Mathematics');
  eq(cell.isParallel, false);
});
it('splits genuine parallel subjects into two parts', () => {
  const cell = parseTimetableCell('Urdu / Sindhi', 'IV-A', teachers);
  eq(cell.isParallel, true);
  eq(cell.parts.length, 2);
  eq(cell.label, 'Urdu / Sindhi');
});
it('collapses a duplicated parallel subject ("Maths / Maths")', () => {
  eq(parseTimetableCell('Maths / Maths', 'IV-A', teachers).label, 'Mathematics');
});
it('honours an explicit teacher override in parentheses', () => {
  const cell = parseTimetableCell('Physics (Sir Abdul Ahad)', 'IX', teachers);
  eq(cell.empty, false);
  eq(cell.teachers.length, 1);
  eq(cell.teachers[0].name, 'Sir Abdul Ahad');
});

describe('timetableConflictEngine.formatTimetableCell');
it('formats an empty cell as an em dash', () => {
  eq(formatTimetableCell(''), '—');
  eq(formatTimetableCell('—'), '—');
});
it('round-trips a subject with a teacher override', () => {
  const raw = formatTimetableCell('Physics', 'Sir Abdul Ahad');
  eq(raw, 'Physics (Sir Abdul Ahad)');
  const parsed = parseTimetableCell(raw, 'IX', teachers);
  eq(parsed.empty, false);
  eq(parsed.teachers[0].name, 'Sir Abdul Ahad');
});

/* ── breakDuties ──────────────────────────────────────────────── */

describe('breakDuties.getActiveDutyStatus');
it('knows the regular-day break and leave windows', () => {
  eq(getActiveDutyStatus('mon', 500), null);
  eq(getActiveDutyStatus('mon', 660), 'break');   // 11:00
  eq(getActiveDutyStatus('mon', 820), 'leave');   // 13:40
  eq(getActiveDutyStatus('sat', 660), 'break');
});
it('knows the shorter Friday windows', () => {
  eq(getActiveDutyStatus('fri', 500), null);
  eq(getActiveDutyStatus('fri', 610), 'break');   // 10:10
  eq(getActiveDutyStatus('fri', 730), 'leave');   // 12:10
  eq(getActiveDutyStatus('fri', 660), null);       // 11:00 breaks on other days, not Friday
});

describe('breakDuties.matchTeacherForDuty');
it('strips honorifics and matches the roster', () => {
  eq(matchTeacherForDuty('Sir Abdul Ahad', teachers)?.name, 'Sir Abdul Ahad');
  eq(matchTeacherForDuty('Aneela', teachers)?.name, 'Miss Aneela');
});
it('returns null for an unknown name', () => {
  eq(matchTeacherForDuty('Zzqq Not A Teacher', teachers), null);
});

describe('breakDuties.resolveDutyStaff');
it('flags absent teachers by id', () => {
  const staff = resolveDutyStaff(['Sir Abdul Ahad', 'Zzqq Not A Teacher'], teachers, ['teacher-1']);
  eq(staff.length, 2);
  eq(staff[0].isAbsent, true);
  eq(staff[0].canonicalName, 'Sir Abdul Ahad');
  eq(staff[1].teacher, null);
  eq(staff[1].isAbsent, false);
});

/* ── async: assertions against the real bundled timetable ────── */

async function itAsync(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    passed++;
    log(`${c.g('  ✅')} ${name}`);
  } catch (err) {
    failed++;
    const reason = (err as Error)?.message || String(err);
    failures.push({ suite, name, reason });
    log(`${c.r('  ❌')} ${name}\n${c.r(`       ${reason.split('\n')[0]}`)}`);
  }
}

describe('timetable.loadTimetable (real data)');
await itAsync('loads the bundled timetable with classes and periods', async () => {
  const tt = await loadTimetable();
  eq(Array.isArray(tt.classes), true);
  eq(tt.classes.length > 0, true);
  eq(tt.classes.every(c => Array.isArray(c.periods) && c.periods.length > 0), true);
  eq(typeof tt.generatedAt, 'string');
});

describe('timetable.resolveSlot (real data)');
await itAsync('resolves a real Monday slot to a subject and teacher', async () => {
  const tt = await loadTimetable();
  const entry = tt.classes[0];
  const slot = resolveSlot(entry, 'mon', 0, teachers);
  eq(slot.empty, false, `slot was empty (cell=${JSON.stringify(entry.periods[0].mon)})`);
  eq(slot.label.length > 0, true);
  eq(Array.isArray(slot.parts), true);
});
await itAsync('reports a free period for an out-of-range period index', async () => {
  const tt = await loadTimetable();
  eq(resolveSlot(tt.classes[0], 'mon', 999, teachers).empty, true);
});

describe('timetable.standardSchedule (real data)');
await itAsync('produces a non-empty, ascending period list', async () => {
  const tt = await loadTimetable();
  const schedule = standardSchedule(tt.classes, 'mon');
  eq(schedule.length > 0, true);
  const numbers = schedule.map((p: any) => p.no);
  eq(numbers, [...numbers].sort((a: number, b: number) => a - b));
});

describe('timetable.computeStaff (real data)');
await itAsync('accounts for every teacher exactly once across busy + free', async () => {
  const tt = await loadTimetable();
  for (const day of ['mon', 'fri'] as const) {
    const { busy, free } = computeStaff(tt.classes, teachers, day, 0);
    eq(busy.length + free.length, teachers.length, `${day}: busy+free must equal roster size`);
    const ids = [...busy.map(b => b.teacher.id), ...free.map(f => f.id)];
    eq(new Set(ids).size, ids.length, `${day}: no teacher may appear twice`);
  }
});

describe('timetableConflictEngine.auditFullTimetable (real data)');
await itAsync('returns a well-formed audit report', async () => {
  const tt = await loadTimetable();
  const map = Object.fromEntries(tt.classes.map(c => [c.label, c])) as any;
  const report = auditFullTimetable(map, teachers);
  eq(typeof report, 'object');
  for (const key of ['clashes', 'unassigned', 'totalSlots', 'totalClashes', 'cleanClassesCount', 'totalClassesCount', 'healthy']) {
    eq(key in report, true, `missing key: ${key}`);
  }
  eq(Array.isArray(report.clashes), true);
  eq(Array.isArray(report.unassigned), true);
  eq(report.totalSlots > 0, true);
  eq(report.totalClassesCount, tt.classes.length);
  eq(report.healthy, report.totalClashes === 0);
});

/* ── summary ─────────────────────────────────────────────────── */

log(`\n${c.b(c.cy('══════════════════════════════════'))}`);
log(`  ${c.g(`${passed} passed`)}${failed ? c.r(`  ${failed} failed`) : ''}`);
if (failures.length) {
  log(c.r('\n  Failed:'));
  for (const f of failures) {
    log(c.r(`    • [${f.suite}] ${f.name}`));
    log(c.d(`        ${f.reason.split('\n')[0]}`));
  }
}
log('');
process.exitCode = failed > 0 ? 1 : 0;

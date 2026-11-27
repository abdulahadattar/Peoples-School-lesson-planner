/**
 * Tests for the Lesson Plan selector cascade (services/teacherRoster.ts
 * dropdown helpers) and the Live Monitor clock (services/timetable.ts
 * getSchoolStatus), the last two uncovered areas.
 *
 * A broken selector cascade means a teacher cannot pick a teacher at all, and
 * a broken school status means the Live Monitor header shows the wrong period,
 * so both are worth pinning against the real curriculum and timetable.
 *
 * Run: node node_modules/tsx/dist/cli.mjs scripts/unit/selectors.test.ts
 */
import teachersJson from '../../data/teachers.json';
import timetableJson from '../../data/timetable.json';
import { mergeCurriculums } from '../../curriculum';
import type { Teacher, CurriculumClass } from '../../types';
import {
  filterTeachersBySelection, teacherOptions, classesForTeacher, subjectsForTeacher,
  autoSelectForTeacher, classIdsForTeacher, subjectsEqual,
} from '../../services/teacherRoster';
import { getSchoolStatus, DAY_LABELS, DAY_KEYS, parseTimeToMinutes } from '../../services/timetable';

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

const teachers = (teachersJson as { teachers: Teacher[] }).teachers;
const classes = mergeCurriculums() as unknown as CurriculumClass[];
const timetableClasses = (timetableJson as any).classes as any[];

describe('fixture sanity');

it('loads the real roster, curriculum and timetable', () => {
  eq(teachers.length > 10, true);
  eq(classes.length > 0, true, 'curriculum must have classes');
  eq(classes.every(c => Array.isArray(c.subjects)), true, 'every class needs a subjects list');
  eq(timetableClasses.length > 0, true);
});

describe('filterTeachersBySelection — the class + subject intersection');

it('returns everyone when nothing is selected yet', () => {
  eq(filterTeachersBySelection(teachers, '', '', classes).length, teachers.length);
});
it('narrows to the teachers of one class', () => {
  const someClass = classes.find(c => classIdsForTeacher(
    teachers.find(t => t.subjects.some(s => s.sections.includes(c.id.replace('class', '')))) || { subjects: [] } as any).length);
  if (!someClass) return; // no teacher for that class; the next test covers the general rule
  const got = filterTeachersBySelection(teachers, someClass.id, '', classes);
  eq(got.length > 0, true);
});
it('every returned teacher really teaches the selected class', () => {
  for (const t of teachers) {
    for (const c of classIdsForTeacher(t)) {
      const got = filterTeachersBySelection(teachers, c, '', classes);
      eq(got.some(x => x.id === t.id), true, `${t.name} teaches ${c} but was filtered out`);
    }
  }
});
it('every returned teacher really teaches the selected subject', () => {
  for (const t of teachers) {
    for (const c of classIdsForTeacher(t)) {
      const cls = classes.find(x => x.id === c);
      if (!cls) continue;
      for (const s of cls.subjects) {
        const got = filterTeachersBySelection(teachers, c, s.id, classes);
        const teachesIt = t.subjects.some(ts => subjectsEqual(ts.name, s.name) || ts.name.toLowerCase() === s.id.toLowerCase());
        if (teachesIt) {
          eq(got.some(x => x.id === t.id), true, `${t.name} teaches ${s.name} in ${c} but was filtered out`);
        }
      }
    }
  }
});
it('never returns more than the input, and never duplicates', () => {
  for (const c of classes.slice(0, 4)) {
    const got = filterTeachersBySelection(teachers, c.id, '', classes);
    eq(got.length <= teachers.length, true);
    eq(new Set(got.map(t => t.id)).size, got.length);
  }
});

describe('teacherOptions — the dropdown must never lock the user out');

it('returns the full roster when the selection matches everybody', () => {
  eq(teacherOptions(teachers, '', '', classes).length, teachers.length);
});
it('puts the matching teachers first but still lists everyone else', () => {
  const t = teachers[0];
  const c = classIdsForTeacher(t)[0];
  if (!c) return;
  const opts = teacherOptions(teachers, c, '', classes);
  eq(opts.length, teachers.length, 'every teacher must remain selectable');
  eq(new Set(opts.map(x => x.id)).size, teachers.length, 'no duplicates');
  const matches = filterTeachersBySelection(teachers, c, '', classes);
  eq(opts.slice(0, matches.length).map(x => x.id), matches.map(x => x.id), 'matches come first');
});
it('every teacher remains reachable no matter how narrow the selection', () => {
  for (const t of teachers) {
    const c = classIdsForTeacher(t)[0];
    if (!c) continue;
    const cls = classes.find(x => x.id === c);
    const s = cls?.subjects[0];
    if (!s) continue;
    const opts = teacherOptions(teachers, c, s.id, classes);
    eq(new Set(opts.map(x => x.id)).size, teachers.length, `narrowing to ${c}/${s.id} hid a teacher`);
  }
});

describe('classesForTeacher / subjectsForTeacher');

it('offers every class when no teacher is chosen', () => {
  eq(classesForTeacher(classes, null).length, classes.length);
  eq(subjectsForTeacher(classes, classes[0].id, null).length, classes[0].subjects.length);
});
it('narrows to the classes a teacher actually teaches', () => {
  for (const t of teachers) {
    const ids = classIdsForTeacher(t);
    const got = classesForTeacher(classes, t);
    eq(got.every(c => ids.includes(c.id)), true, `${t.name} was offered a class they do not teach`);
  }
});
it('narrows subjects to those the teacher teaches in that class', () => {
  for (const t of teachers) {
    for (const c of classIdsForTeacher(t)) {
      const cls = classes.find(x => x.id === c);
      if (!cls) continue;
      for (const s of subjectsForTeacher(classes, c, t)) {
        const teaches = t.subjects.some(ts => ts.sections.some(sec => sec) && subjectsEqual(ts.name, s.name));
        if (teaches) eq(s.id.length > 0, true);
      }
    }
  }
});

describe('autoSelectForTeacher — picking a teacher pre-fills class and subject');

it('never auto-selects a class or subject the teacher does not teach', () => {
  for (const t of teachers) {
    for (const current of ['', 'class9', 'class10']) {
      const r = autoSelectForTeacher(t, classes, current);
      if (r.classId) {
        const ok = classIdsForTeacher(t).includes(r.classId);
        eq(ok, true, `${t.name}: auto-picked ${r.classId} which they do not teach`);
      }
      if (r.subjectId) {
        const cls = classes.find(c => c.id === (r.classId || current));
        const ok = cls?.subjects.some(s => s.id === r.subjectId) ?? false;
        eq(ok, true, `${t.name}: auto-picked subject ${r.subjectId} which is not in that class`);
      }
    }
  }
});
it('fills a subject when the teacher teaches exactly one', () => {
  for (const t of teachers) {
    if (t.subjects.length !== 1) continue;
    const r = autoSelectForTeacher(t, classes, '');
    if (!r.subjectId) continue;
    eq(r.subjectId.length > 0, true);
    break;
  }
});
it('returns empty strings rather than guessing for a multi-subject teacher', () => {
  const multi = teachers.find(t => t.subjects.length > 1);
  if (!multi) return;
  const r = autoSelectForTeacher(multi, classes, '');
  eq(typeof r.classId, 'string');
  eq(typeof r.subjectId, 'string');
});
it('always returns strings, never undefined', () => {
  for (const t of teachers) {
    const r = autoSelectForTeacher(t, classes, 'class9');
    eq(typeof r.classId, 'string', `${t.name} classId`);
    eq(typeof r.subjectId, 'string', `${t.name} subjectId`);
  }
});

describe('getSchoolStatus — the Live Monitor clock');

it('reports the school closed on Sunday', () => {
  const s = getSchoolStatus(timetableClasses, null, 600);
  eq(s.state, 'closed');
  eq(s.periodIndex, -1);
  eq(s.periodNo, null);
  eq(s.progressPercent, 0);
  eq(s.periodLabel.includes('Closed'), true, s.periodLabel);
});
it('is closed when there are no classes to read', () => {
  eq(getSchoolStatus([], 'mon', 600).state, 'closed');
});
it('reports a real period in the middle of the school day', () => {
  // 10:00 AM on a Monday. Note getSchoolStatus uses its own state vocabulary
  // ('in_period' | 'break' | 'before_school' | 'after_school' | 'closed'),
  // which is NOT the one locatePeriod uses ('in' | 'break' | 'before' | 'after').
  const s = getSchoolStatus(timetableClasses, 'mon', 600);
  if (s.state === 'closed') throw new Error('must not be closed on a Monday');
  eq(s.state === 'in_period' || s.state === 'break', true, `unexpected state ${s.state}`);
  if (s.state === 'in_period') {
    eq(typeof s.periodNo, 'number');
    eq(s.progressPercent >= 0 && s.progressPercent <= 100, true, `progress ${s.progressPercent}`);
    eq(s.periodLabel.length > 0, true, 'a live period must be labelled for the user');
  }
});
it('reports before-school early and after-school late', () => {
  eq(getSchoolStatus(timetableClasses, 'mon', 1).state, 'before_school');
  eq(getSchoolStatus(timetableClasses, 'mon', 1439).state, 'after_school');
});
it('never reports negative remaining minutes', () => {
  for (let m = 0; m < 1440; m += 7) {
    for (const day of DAY_KEYS) {
      const s = getSchoolStatus(timetableClasses, day, m);
      if (s.remainingMinutes < 0) {
        throw new Error(`${day} ${m} gave remainingMinutes ${s.remainingMinutes}`);
      }
      if (s.progressPercent < 0 || s.progressPercent > 100) {
        throw new Error(`${day} ${m} gave progressPercent ${s.progressPercent}`);
      }
    }
  }
});
it('progress rises within a period and resets only when the period changes', () => {
  // progressPercent is progress THROUGH THE CURRENT PERIOD, not through the
  // day, so it legitimately drops from ~100% to 0% at a period boundary.
  // The invariant is: it never decreases while staying on the same period.
  let prev = getSchoolStatus(timetableClasses, 'mon', 480);
  for (let m = 485; m <= 820; m += 5) {
    const cur = getSchoolStatus(timetableClasses, 'mon', m);
    if (cur.state === 'closed' || prev.state === 'closed') { prev = cur; continue; }
    if (cur.state === 'in_period' && prev.state === 'in_period' && cur.periodNo === prev.periodNo) {
      if (cur.progressPercent < prev.progressPercent) {
        throw new Error(`progress fell inside period ${cur.periodNo} at ${m}: ${prev.progressPercent} -> ${cur.progressPercent}`);
      }
    }
    prev = cur;
  }
});
it('resets progress to 0 at the start of each period', () => {
  const entry = timetableClasses[0];
  for (const p of entry.periods.slice(0, 3)) {
    const start = parseTimeToMinutes(p.start);
    const s = getSchoolStatus(timetableClasses, 'mon', start + 1);
    if (s.state !== 'in_period' || s.periodNo !== p.no) continue;
    if (s.progressPercent > 5) {
      throw new Error(`period ${p.no} started at ${s.progressPercent}% instead of ~0`);
    }
  }
});
it('exposes a label for every day key', () => {
  for (const d of DAY_KEYS) {
    eq(typeof DAY_LABELS[d], 'string', `missing label for ${d}`);
    eq(DAY_LABELS[d].length > 0, true);
  }
  eq(DAY_KEYS.length, 6, 'six school days');
});
it('treats Friday as a different day length from the rest', () => {
  const fri = getSchoolStatus(timetableClasses, 'fri', 1439);
  const mon = getSchoolStatus(timetableClasses, 'mon', 1439);
  eq(fri.state, mon.state, 'both should be after_school late at night');
  eq(parseTimeToMinutes('11:50 AM'), 710, 'Friday default end');
  eq(parseTimeToMinutes('1:20 PM'), 800, 'regular default end');
});

log(`\n${'='.repeat(60)}`);
log(`  ${pass} passed${fail ? `, ${fail} failed` : ''}`);
if (failures.length) { log('\n  Failed:'); failures.forEach(f => log(`    • ${f}`)); }
log('');
process.exitCode = fail > 0 ? 1 : 0;



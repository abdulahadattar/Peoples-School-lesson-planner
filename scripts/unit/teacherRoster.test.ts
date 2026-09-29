/**
 * Tests for services/teacherRoster.ts — the teacher/subject/class matching
 * engine behind the Lesson Plan selectors and the Live Monitor.
 *
 * It was the least-covered module in the project (4 of 18 exports asserted).
 * These run against the REAL data/teachers.json and data/timetable.json so the
 * roster quirks the code has to cope with are covered, not invented ones.
 *
 * Run: node node_modules/tsx/dist/cli.mjs scripts/unit/teacherRoster.test.ts
 */
import teachersJson from '../../data/teachers.json';
import type { Teacher } from '../../types';
import {
  subjectNames, classIdsForTeacher, teachesClass, sectionsByClass,
  sectionsForSubjectInClass, resolveTeacher, canonicalName, resolveByName,
  subjectsEqual, subjectMatches, sectionToClassId, normalizeSubject, isKnownSubject,
} from '../../services/teacherRoster';

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
const byName = (n: string) => teachers.find(t => t.name === n) as Teacher;
const has = (arr: string[], v: string) => arr.includes(v);

/* Sanity: the fixtures must be the real roster, or nothing below means much. */
describe('fixture sanity');

it('loads the real roster', () => {
  eq(teachers.length > 10, true, `expected a full roster, got ${teachers.length}`);
  eq(byName('Miss Fatima Qureshi') !== undefined, true, 'roster fixture missing a known teacher');
});

describe('section -> class mapping');

it('maps every section label the timetable actually uses', () => {
  eq(sectionToClassId('X-A'), 'class10');
  eq(sectionToClassId('ECCE'), 'classECCE');
  eq(sectionToClassId('V'), 'class5');
  eq(sectionToClassId('IX'), 'class9');
});
it('returns undefined for a label it does not know', () => {
  eq(sectionToClassId('ZZ'), undefined);
  eq(sectionToClassId(''), undefined);
});

describe('subject identity');

it('subjectsEqual is alias-aware, so Math and Mathematics are the same subject', () => {
  eq(subjectsEqual('Maths', 'Mathematics'), true);
  eq(subjectsEqual('math', 'MATHEMATICS'), true);
  eq(subjectsEqual('Physics', 'Chemistry'), false);
});
it('subjectMatches tolerates a teacher writing General_Science for Science', () => {
  eq(subjectMatches('General_Science', { id: 'science', name: 'Science' } as any), true);
  eq(subjectMatches('Physics', { id: 'science', name: 'Science' } as any), false);
});
it('isKnownSubject separates a subject label from a teacher name', () => {
  eq(isKnownSubject('Sindhi'), true);
  eq(isKnownSubject('Feroz'), false);
});

describe('a teacher\'s derived classes and sections');

it('subjectNames dedupes repeated subject entries', () => {
  const t: Teacher = { id: 'x', name: 'X', subjects: [
    { name: 'Physics', sections: ['IX'] }, { name: 'Physics', sections: ['X-A'] },
    { name: 'Maths', sections: ['IX'] },
  ] } as unknown as Teacher;
  eq(subjectNames(t), ['Physics', 'Maths']);
});
it('classIdsForTeacher maps sections to class ids and dedupes', () => {
  const t: Teacher = { id: 'x', name: 'X', subjects: [
    { name: 'Physics', sections: ['X-A', 'X-B'] },
    { name: 'Maths', sections: ['X-A'] },
  ] } as unknown as Teacher;
  eq(classIdsForTeacher(t), ['class10'], 'X-A and X-B are one class, so one id');
});
it('classIdsForTeacher silently skips a section it cannot map', () => {
  const t: Teacher = { id: 'x', name: 'X', subjects: [
    { name: 'Physics', sections: ['NOT-A-SECTION', 'IX'] },
  ] } as unknown as Teacher;
  eq(classIdsForTeacher(t), ['class9']);
});
it('teachesClass reflects the derived class ids', () => {
  const t = byName('Sir Abdul Ahad');
  const ids = classIdsForTeacher(t);
  eq(ids.length > 0, true, 'roster teacher should teach something');
  eq(teachesClass(t, ids[0]), true);
  eq(teachesClass(t, 'classNotTaught'), false);
});
it('sectionsByClass groups and dedupes section labels per class', () => {
  const t: Teacher = { id: 'x', name: 'X', subjects: [
    { name: 'Physics', sections: ['X-A', 'X-B', 'X-A'] },
    { name: 'Maths', sections: ['IX'] },
  ] } as unknown as Teacher;
  eq(sectionsByClass(t), { class10: ['X-A', 'X-B'], class9: ['IX'] });
});
it('sectionsForSubjectInClass returns only that subject in that class', () => {
  const t: Teacher = { id: 'x', name: 'X', subjects: [
    { name: 'Maths', sections: ['X-A', 'IX'] },
    { name: 'Physics', sections: ['X-A'] },
  ] } as unknown as Teacher;
  eq(sectionsForSubjectInClass(t, 'Mathematics', 'class10'), ['X-A']);
  eq(sectionsForSubjectInClass(t, 'Mathematics', 'class9'), ['IX']);
  eq(sectionsForSubjectInClass(t, 'Physics', 'class9'), []);
});

describe('resolveTeacher — timetable cell to teacher');

it('resolves a subject in a section the teacher actually teaches', () => {
  const t = byName('Sir Abdul Ahad'); // Physics
  const section = t.subjects[0].sections[0];
  const got = resolveTeacher('Physics', section, teachers);
  eq(got?.name, 'Sir Abdul Ahad', `expected the Physics teacher for ${section}`);
});
it('is alias-aware: a cell saying "Maths" finds the Mathematics teacher', () => {
  const mathTeacher = teachers.find(t => t.subjects.some(s => subjectsEqual(s.name, 'Mathematics')));
  eq(!!mathTeacher, true, 'roster must contain a Mathematics teacher');
  const got = resolveTeacher('Maths', mathTeacher!.subjects.find(s => subjectsEqual(s.name, 'Mathematics'))!.sections[0], teachers);
  eq(got?.name, mathTeacher!.name);
});
it('returns null rather than guessing when no teacher covers the cell', () => {
  // Documented behaviour: an unassignable slot shows as unassigned, it is
  // never silently given to a teacher who does not teach that subject.
  eq(resolveTeacher('Computer Science', 'X-A', teachers), null);
  eq(resolveTeacher('Physics', 'NOT-A-SECTION', teachers), null);
});
it('falls back to another section of the same class when the exact section is absent', () => {
  // A roster that lists only X-A, queried for its sibling X-B. Both labels map
  // to class10, so the slot must still resolve instead of showing unassigned.
  const onlyXa: Teacher = { id: 't1', name: 'Test Teacher', subjects: [
    { name: 'Physics', sections: ['X-A'] },
  ] } as unknown as Teacher;
  eq(resolveTeacher('Physics', 'X-B', [onlyXa])?.id, 't1', 'same-class fallback');
  eq(resolveTeacher('Physics', 'X-A', [onlyXa])?.id, 't1', 'exact section still wins');
  // IX-B is not a label the section map knows, so there is no class to fall
  // back to and the slot must stay unassigned rather than guess.
  eq(resolveTeacher('Physics', 'IX-B', [onlyXa]), null, 'unknown section label has no class to fall back to');
});
it('matches a cell written in a different case than the roster', () => {
  // Regression: subjectsEqual used to be case-sensitive for subjects whose
  // canonical label is not itself an alias key, so "MATHEMATICS" did not
  // match the roster's "Mathematics" and the slot showed unassigned.
  const m: Teacher = { id: 't2', name: 'Math Teacher', subjects: [
    { name: 'Mathematics', sections: ['IX'] },
  ] } as unknown as Teacher;
  eq(resolveTeacher('MATHEMATICS', 'IX', [m])?.id, 't2');
  eq(resolveTeacher('mathematics', 'IX', [m])?.id, 't2');
  eq(resolveTeacher('Maths', 'IX', [m])?.id, 't2');
});

describe('name resolution — some timetable cells hold a teacher, not a subject');

it('strips honorifics and case when matching a name', () => {
  eq(resolveByName('Sir Abdul Ahad', teachers)?.name, 'Sir Abdul Ahad');
  eq(resolveByName('abdul ahad', teachers)?.name, 'Sir Abdul Ahad');
  eq(resolveByName('SIR ABDUL AHAD', teachers)?.name, 'Sir Abdul Ahad');
});
it('repairs the "Ftaima" typo in the timetable against the real roster name', () => {
  // data/timetable.json says IV-B -> "Miss Ftaima"; the roster spells it
  // "Miss Fatima Qureshi". The alias exists specifically for that.
  eq(resolveByName('Miss Ftaima', teachers)?.name, 'Miss Fatima Qureshi');
  eq(resolveByName('Fatima', teachers)?.name, 'Miss Fatima Qureshi');
});
it('returns null for a name that is not on the roster', () => {
  eq(resolveByName('Nobody At All', teachers), null);
  eq(resolveByName('', teachers), null);
});
it('requires a word boundary, so a prefix does not match a different teacher', () => {
  eq(resolveByName('Sir Abd', teachers), null, 'partial word must not match');
});
it('canonicalName returns the roster spelling, or the trimmed input as a fallback', () => {
  eq(canonicalName('MISS Aneela', teachers), 'Miss Aneela');
  eq(canonicalName('Miss Ftaima', teachers), 'Miss Fatima Qureshi');
  eq(canonicalName('  Unknown Person  ', teachers), 'Unknown Person', 'falls back to the trimmed raw name');
});

log(`\n${'='.repeat(60)}`);
log(`  ${pass} passed${fail ? `, ${fail} failed` : ''}`);
if (failures.length) { log('\n  Failed:'); failures.forEach(f => log(`    • ${f}`)); }
log('');
process.exitCode = fail > 0 ? 1 : 0;



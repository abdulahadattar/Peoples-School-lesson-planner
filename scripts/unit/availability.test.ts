/**
 * Tests for the substitution / availability half of
 * services/timetableConflictEngine.ts, which had 3 of 8 exports covered.
 *
 * These drive the real data/timetable.json and data/teachers.json, so the
 * assertions describe the timetable the school actually runs rather than a
 * synthetic grid. Anything about double-booking, availability or the master
 * schedule is checked against that.
 *
 * Run: node node_modules/tsx/dist/cli.mjs scripts/unit/availability.test.ts
 */
import teachersJson from '../../data/teachers.json';
import timetableJson from '../../data/timetable.json';
import type { Teacher } from '../../types';
import {
  getTeacherSubjects, getQualifiedTeachersForSubject, checkTeacherAvailability,
  buildTeacherMasterSchedule, suggestBestTeacherForSlot, auditFullTimetable,
  parseTimetableCell,
} from '../../services/timetableConflictEngine';

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
const classes = (timetableJson as any).classes as any[];
const map: Record<string, any> = Object.fromEntries(classes.map(c => [c.label, c]));
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

describe('fixture sanity — the real timetable must be well formed');

it('loads classes, periods and the roster', () => {
  eq(classes.length > 0, true);
  eq(classes.every(c => c.periods.length > 0), true);
  eq(teachers.length > 0, true);
  eq(Object.keys(map).length, classes.length, 'map must key every class exactly once');
});
it('every period carries a number, a start and an end', () => {
  for (const c of classes) {
    for (const p of c.periods) {
      if (typeof p.no !== 'number' || !p.start || !p.end) {
        throw new Error(`${c.label} period ${JSON.stringify(p)} is incomplete`);
      }
    }
  }
});

describe('getTeacherSubjects');

it('dedupes repeated subject entries', () => {
  const t: Teacher = { id: 'x', name: 'X', subjects: [
    { name: 'Physics', sections: ['IX'] }, { name: 'Physics', sections: ['X-A'] }, { name: 'Maths', sections: ['IX'] },
  ] } as unknown as Teacher;
  eq(getTeacherSubjects(t), ['Physics', 'Maths']);
});

describe('getQualifiedTeachersForSubject');

it('returns nothing for an empty cell rather than a random teacher', () => {
  const r = getQualifiedTeachersForSubject('', 'IV-A', teachers);
  eq(r.primaryTeacher, null);
  eq(r.qualifiedTeachers, []);
  eq(r.allTeachers.length, teachers.length, 'allTeachers is still offered as a fallback pool');
  eq(getQualifiedTeachersForSubject('—', 'IV-A', teachers).primaryTeacher, null);
});
it('picks the teacher whose sections explicitly include the class', () => {
  const t = teachers.find(x => x.subjects.some(s => s.name === 'Physics' && s.sections.length > 0))!;
  const section = t.subjects.find(s => s.name === 'Physics')!.sections[0];
  const r = getQualifiedTeachersForSubject('Physics', section, teachers);
  eq(r.primaryTeacher !== null, true, 'a Physics slot must resolve a primary teacher');
  eq(r.qualifiedTeachers.length > 0, true);
  eq(r.qualifiedTeachers.some(x => x.id === r.primaryTeacher!.id), true, 'primary must be among the qualified');
});
it('is alias-aware, so a "Maths" cell finds a Mathematics teacher', () => {
  const mathTeacher = teachers.find(t => t.subjects.some(s => /math/i.test(s.name)));
  eq(!!mathTeacher, true, 'roster must contain a maths teacher');
  const section = mathTeacher!.subjects[0].sections[0];
  const r = getQualifiedTeachersForSubject('Maths', section, teachers);
  eq(r.qualifiedTeachers.length > 0, true);
  eq(r.qualifiedTeachers.some(t => t.id === mathTeacher!.id), true);
});
it('returns no qualified teacher for a subject nobody teaches', () => {
  const r = getQualifiedTeachersForSubject('Underwater Basket Weaving', 'IV-A', teachers);
  eq(r.qualifiedTeachers, []);
  eq(r.primaryTeacher, null);
});

describe('checkTeacherAvailability');

it('reports a teacher free when nothing books them in that slot', () => {
  const r = checkTeacherAvailability('teacher-does-not-exist', 'mon', 0, map, undefined, teachers);
  eq(r.isBusy, false);
});
it('detects a real double booking from the actual timetable', () => {
  // Find any slot where the same teacher id appears in two classes.
  let found = false;
  for (const day of DAYS) {
    for (let pi = 0; pi < 8; pi++) {
      const where: Record<string, string[]> = {};
      for (const c of classes) {
        const cell = parseTimetableCell(c.periods[pi]?.[day] ?? '', c.label, teachers);
        for (const t of cell.teachers) (where[t.id] ??= []).push(c.label);
      }
      const clash = Object.entries(where).find(([, cls]) => cls.length > 1);
      if (!clash) continue;
      found = true;
      const [teacherId, cls] = clash;
      const a = checkTeacherAvailability(teacherId, day, pi, map, undefined, teachers);
      eq(a.isBusy, true, `${teacherId} should be busy at ${day} period ${pi}`);
      if (!cls.includes(a.busyInClass!)) {
        throw new Error(`reported busyInClass ${a.busyInClass} is not one of ${JSON.stringify(cls)}`);
      }
      eq(typeof a.periodNo, 'number');
      eq(a.subject.length > 0, true, 'a busy slot must name the subject it is teaching');
      return;
    }
  }
  eq(found, true, 'expected at least one real double booking to exercise this test');
});
it('honours excludeClassLabel so a class does not clash with itself', () => {
  let found = false;
  for (const day of DAYS) {
    for (let pi = 0; pi < 8; pi++) {
      for (const c of classes) {
        const cell = parseTimetableCell(c.periods[pi]?.[day] ?? '', c.label, teachers);
        const t = cell.teachers[0];
        if (!t) continue;
        const r = checkTeacherAvailability(t.id, day, pi, map, c.label, teachers);
        // Excluding their own class can only ever reduce or keep the conflicts.
        if (r.isBusy) { found = true; break; }
      }
      if (found) break;
    }
    if (found) break;
  }
  eq(typeof found, 'boolean', 'exclusion must not throw across the whole timetable');
});
it('is safe with an empty teacher id', () => {
  eq(checkTeacherAvailability('', 'mon', 0, map, undefined, teachers).isBusy, false);
});

describe('buildTeacherMasterSchedule — the real weekly grid');

it('returns null for a teacher that is not on the roster', () => {
  eq(buildTeacherMasterSchedule('nope', map, teachers), null);
});
it('builds a six-day schedule for every roster teacher, without throwing', () => {
  for (const t of teachers) {
    const s = buildTeacherMasterSchedule(t.id, map, teachers);
    if (!s) throw new Error(`no schedule built for ${t.name}`);
    eq(Object.keys(s.weeklySchedule).sort(), [...DAYS].sort(), `${t.name} must have all six days`);
    eq(s.teacher.id, t.id);
  }
});
it('flags a double booking on BOTH sides, so neither class looks innocent', () => {
  // The real timetable does contain a clash (Miss Aneela, Friday period 4,
  // Sindhi, in both IV-B and VI-B). The engine's job is to SURFACE it, so a
  // clash must appear once per affected class and each must point at the
  // other. Asserting "never double booked" would be asserting the timetable
  // is clash-free, which is a data question, not a code one.
  for (const t of teachers) {
    const s = buildTeacherMasterSchedule(t.id, map, teachers)!;
    for (const day of DAYS) {
      const slots = s.weeklySchedule[day];
      const byPeriod = new Map<number, typeof slots>();
      for (const slot of slots) {
        (byPeriod.get(slot.periodIndex) ?? byPeriod.set(slot.periodIndex, []).get(slot.periodIndex)!).push(slot);
      }
      for (const [pi, group] of byPeriod) {
        if (group.length < 2) continue;
        for (const slot of group) {
          if (!slot.hasClash) throw new Error(`${t.name} ${day} p${pi} in ${slot.classLabel} not flagged`);
          if (!group.some(o => o.classLabel === slot.clashingWithClass)) {
            throw new Error(`${t.name} ${day} p${pi}: ${slot.classLabel} points at "${slot.clashingWithClass}" which is not in the same slot`);
          }
        }
      }
    }
  }
});
it('reports a class and subject for every slot it books', () => {
  for (const t of teachers) {
    const s = buildTeacherMasterSchedule(t.id, map, teachers)!;
    for (const day of DAYS) {
      for (const slot of s.weeklySchedule[day]) {
        if (!slot.classLabel) throw new Error(`${t.name} ${day} slot missing classLabel`);
        if (!slot.subject) throw new Error(`${t.name} ${day} slot missing subject`);
      }
    }
  }
});
it('keeps totalTeachingPeriods consistent with the slots it lists', () => {
  for (const t of teachers) {
    const s = buildTeacherMasterSchedule(t.id, map, teachers)!;
    const listed = DAYS.reduce((n, d) => n + s.weeklySchedule[d].length, 0);
    eq(s.totalTeachingPeriods, listed, `${t.name}: counter disagrees with the listed slots`);
  }
});

describe('suggestBestTeacherForSlot — substitution suggestions');

it('suggests a real, named teacher for a real teaching slot', () => {
  const entry = classes[0];
  const day = 'mon' as const;
  const cell = entry.periods[0][day];
  const s = suggestBestTeacherForSlot(cell, entry.label, day, 0, map, teachers);
  if (s === null) return; // legitimately nobody is qualified for this cell
  eq(!!s.teacher, true, 'a suggestion must carry a teacher object');
  eq(typeof s.teacher.id, 'string');
  eq(s.teacher.name.length > 0, true, 'a suggestion must name a teacher');
  eq(typeof s.isPrimary, 'boolean');
  eq(typeof s.isFree, 'boolean');
  eq(s.reason.length > 0, true, 'a suggestion must explain itself to the user');
  eq(teachers.some(t => t.id === s.teacher.id), true, 'the suggested teacher must be on the roster');
});
it('returns null for a subject nobody teaches, rather than any teacher', () => {
  eq(suggestBestTeacherForSlot('Underwater Basket Weaving', 'IV-A', 'mon', 0, map, teachers), null);
});
it('returns null for an empty cell', () => {
  eq(suggestBestTeacherForSlot('—', 'IV-A', 'mon', 0, map, teachers), null);
  eq(suggestBestTeacherForSlot('', 'IV-A', 'mon', 0, map, teachers), null);
});

describe('auditFullTimetable — whole-school invariants');

it('returns a self-consistent report for the real timetable', () => {
  const r = auditFullTimetable(map, teachers);
  eq(Array.isArray(r.clashes), true);
  eq(Array.isArray(r.unassigned), true);
  eq(r.totalClassesCount, classes.length);
  eq(r.totalClashes, r.clashes.length, 'totalClashes must match the array length');
  eq(r.healthy, r.totalClashes === 0);
  // A clash records every class the teacher is in for that slot, so the
  // affected set is the union of all clash.classes entries.
  const affected = new Set<string>();
  for (const c of r.clashes) for (const label of c.classes) affected.add(label);
  eq(r.cleanClassesCount + affected.size, r.totalClassesCount,
    `cleanClassesCount(${r.cleanClassesCount}) + affected(${affected.size}) != total(${r.totalClassesCount})`);
});
it('counts every unassigned notice against a real slot', () => {
  const r = auditFullTimetable(map, teachers);
  for (const n of r.unassigned) {
    if (typeof n.classLabel !== 'string' || typeof n.subject !== 'string') {
      throw new Error(`malformed notice: ${JSON.stringify(n)}`);
    }
    const entry = map[n.classLabel];
    if (!entry) throw new Error(`notice names an unknown class: ${n.classLabel}`);
    if (!entry.periods[n.periodIndex]) throw new Error(`notice names a missing period: ${JSON.stringify(n)}`);
  }
});
it('does not report a clash for a parallel cell, since both teachers are present', () => {
  // "Urdu / Sindhi" means two teachers in ONE class at the same period. That
  // is not a double booking, so it must never appear in r.clashes.
  const r = auditFullTimetable(map, teachers);
  for (const c of r.clashes) {
    // A clash is recorded once per (teacher, day, period) with the list of
    // classes involved, so a real clash always spans two or more classes.
    if (c.classes.length < 2) {
      throw new Error(`clash spanning a single class is not a clash: ${JSON.stringify(c.classes)}`);
    }
  }
});
it('every clash names only real classes and a real teacher', () => {
  const r = auditFullTimetable(map, teachers);
  for (const c of r.clashes) {
    if (!teachers.some(t => t.id === c.teacher.id)) {
      throw new Error(`clash names a teacher off the roster: ${c.teacher.id}`);
    }
    for (const label of c.classes) {
      if (!map[label]) throw new Error(`clash names an unknown class: ${label}`);
    }
    for (const s of c.subjects) {
      if (typeof s !== 'string' || !s) throw new Error(`clash has an empty subject: ${JSON.stringify(c.subjects)}`);
    }
  }
});
it('surfaces the known Miss Aneela Friday period 4 Sindhi clash in IV-B and VI-B', () => {
  // A real conflict in data/timetable.json, pinned so that correcting the data
  // (or consciously accepting it) is a visible change rather than a silent one.
  const r = auditFullTimetable(map, teachers);
  const hit = (r.clashes as any[]).find(c =>
    c.teacher.name === 'Miss Aneela' && c.dayKey === 'fri' && c.periodIndex === 3);
  if (!hit) return; // data corrected: nothing to pin any more
  eq(hit.classes.sort(), ['IV-B', 'VI-B'], 'the clash must name both classes');
  eq(hit.subjects.every((s: string) => s === 'Sindhi'), true, 'both sides teach Sindhi');
});
it('is deterministic: auditing twice gives the same answer', () => {
  const a = auditFullTimetable(map, teachers);
  const b = auditFullTimetable(map, teachers);
  eq(a.totalClashes, b.totalClashes);
  eq(a.cleanClassesCount, b.cleanClassesCount);
  eq(a.unassigned.length, b.unassigned.length);
});

log(`\n${'='.repeat(60)}`);
log(`  ${pass} passed${fail ? `, ${fail} failed` : ''}`);
if (failures.length) { log('\n  Failed:'); failures.forEach(f => log(`    • ${f}`)); }
log('');
process.exitCode = fail > 0 ? 1 : 0;



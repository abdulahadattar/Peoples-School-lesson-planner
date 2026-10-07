import { Teacher } from '../../../types';
import {
  DayKey,
  DAY_KEYS,
  TimetableClassEntry,
} from '../types';
import { parseTimetableCell } from './cellParser';
import { checkTeacherAvailability } from './audit';
import { normalizeSubject, subjectsEqual } from '../../teacherRoster';

export interface TeacherWeeklySlot {
  periodNo: number;
  periodIndex: number;
  classLabel: string;
  subject: string;
  isParallel: boolean;
  hasClash: boolean;
  clashingWithClass?: string;
}

export interface TeacherMasterSchedule {
  teacher: Teacher;
  weeklySchedule: Record<DayKey, TeacherWeeklySlot[]>;
  totalTeachingPeriods: number;
  classesTaught: string[];
  subjectsTaught: string[];
  clashCount: number;
}

export interface QualifiedTeachersResult {
  primaryTeacher: Teacher | null;
  qualifiedTeachers: Teacher[];
  allTeachers: Teacher[];
}

export interface BestTeacherSuggestion {
  teacher: Teacher;
  isPrimary: boolean;
  isFree: boolean;
  reason: string;
}

export function getTeacherSubjects(teacher: Teacher): string[] {
  if (!teacher) return [];
  const subs = new Set<string>();
  if (Array.isArray(teacher.subjects)) {
    for (const sub of teacher.subjects) {
      if (typeof sub === 'string') {
        subs.add(sub);
      } else if (sub && typeof sub.name === 'string') {
        subs.add(sub.name);
      }
    }
  }
  return Array.from(subs);
}

export function getQualifiedTeachersForSubject(
  subject: string,
  classLabel: string,
  teachers: Teacher[] = [],
): QualifiedTeachersResult {
  if (!subject || subject.trim() === '' || subject.trim() === '—') {
    return {
      primaryTeacher: null,
      qualifiedTeachers: [],
      allTeachers: teachers,
    };
  }

  const cleanSubject = normalizeSubject(subject);
  const qualified: Teacher[] = [];
  let primary: Teacher | null = null;

  for (const t of teachers) {
    if (!Array.isArray(t.subjects)) continue;
    let teachesSub = false;
    let teachesInThisClass = false;

    for (const s of t.subjects) {
      const sName = typeof s === 'string' ? s : s?.name;
      if (sName && (subjectsEqual(sName, cleanSubject) || sName.toLowerCase().includes(cleanSubject.toLowerCase()) || cleanSubject.toLowerCase().includes(sName.toLowerCase()))) {
        teachesSub = true;
        const sections = (s as any).sections;
        if (Array.isArray(sections) && sections.includes(classLabel)) {
          teachesInThisClass = true;
        }
      }
    }

    if (teachesSub) {
      qualified.push(t);
      if (teachesInThisClass && !primary) {
        primary = t;
      }
    }
  }

  if (primary && !qualified.some(q => q.id === primary!.id)) {
    qualified.unshift(primary);
  }

  return {
    primaryTeacher: primary,
    qualifiedTeachers: qualified,
    allTeachers: teachers,
  };
}

export function buildTeacherMasterSchedule(
  teacherId: string,
  timetable: Record<string, TimetableClassEntry> | TimetableClassEntry[],
  teachers: Teacher[],
): TeacherMasterSchedule | null {
  const teacher = teachers.find(t => t.id === teacherId);
  if (!teacher) return null;

  const classes: TimetableClassEntry[] = Array.isArray(timetable)
    ? timetable
    : Object.values(timetable);

  const weeklySchedule: Record<DayKey, TeacherWeeklySlot[]> = {
    mon: [], tue: [], wed: [], thu: [], fri: [], sat: [],
  };

  let totalPeriods = 0;
  let clashCount = 0;
  const classesTaughtSet = new Set<string>();
  const subjectsTaughtSet = new Set<string>();

  for (const day of DAY_KEYS) {
    const maxPeriods = Math.max(...classes.map(c => c.periods.length), 0);

    for (let pIdx = 0; pIdx < maxPeriods; pIdx++) {
      const activeAssignments: Array<{ classLabel: string; subject: string; isParallel: boolean; periodNo: number }> = [];

      for (const entry of classes) {
        const period = entry.periods[pIdx];
        if (!period) continue;
        const raw = period[day];
        if (!raw) continue;

        const parsed = parseTimetableCell(raw, entry.label, teachers);
        const isTeaching = parsed.teachers.some(t => t.id === teacherId);

        if (isTeaching) {
          activeAssignments.push({
            classLabel: entry.label,
            subject: parsed.label,
            isParallel: parsed.isParallel,
            periodNo: period.no,
          });
          classesTaughtSet.add(entry.label);
          subjectsTaughtSet.add(parsed.label);
        }
      }

      if (activeAssignments.length > 0) {
        totalPeriods += activeAssignments.length;
        const hasClash = activeAssignments.length > 1;
        if (hasClash) clashCount += activeAssignments.length - 1;

        for (let aIdx = 0; aIdx < activeAssignments.length; aIdx++) {
          const assign = activeAssignments[aIdx];
          const otherClasses = activeAssignments
            .filter((_, idx) => idx !== aIdx)
            .map(a => a.classLabel);

          weeklySchedule[day].push({
            periodNo: assign.periodNo,
            periodIndex: pIdx,
            classLabel: assign.classLabel,
            subject: assign.subject,
            isParallel: assign.isParallel,
            hasClash,
            clashingWithClass: otherClasses.length > 0 ? otherClasses.join(', ') : undefined,
          });
        }
      }
    }
  }

  return {
    teacher,
    weeklySchedule,
    totalTeachingPeriods: totalPeriods,
    classesTaught: Array.from(classesTaughtSet),
    subjectsTaught: Array.from(subjectsTaughtSet),
    clashCount,
  };
}

export function suggestBestTeacherForSlot(
  cell: string,
  classLabel: string,
  day: DayKey,
  periodIndex: number,
  timetable: Record<string, TimetableClassEntry> | TimetableClassEntry[],
  teachers: Teacher[],
): BestTeacherSuggestion | null {
  if (!cell || cell === '—' || cell.trim() === '') return null;

  const parsed = parseTimetableCell(cell, classLabel, teachers);
  const subjectName = parsed.label || cell.trim();

  const qual = getQualifiedTeachersForSubject(subjectName, classLabel, teachers);
  if (qual.qualifiedTeachers.length === 0) return null;

  const classes: TimetableClassEntry[] = Array.isArray(timetable)
    ? timetable
    : Object.values(timetable);

  if (qual.primaryTeacher) {
    const avail = checkTeacherAvailability(qual.primaryTeacher.id, day, periodIndex, classes, undefined, teachers);
    if (!avail.isBusy) {
      return {
        teacher: qual.primaryTeacher,
        isPrimary: true,
        isFree: true,
        reason: 'Primary designated teacher for this class section and currently available.',
      };
    }
  }

  for (const alt of qual.qualifiedTeachers) {
    if (qual.primaryTeacher && alt.id === qual.primaryTeacher.id) continue;
    const avail = checkTeacherAvailability(alt.id, day, periodIndex, classes, undefined, teachers);
    if (!avail.isBusy) {
      return {
        teacher: alt,
        isPrimary: false,
        isFree: true,
        reason: `Qualified teacher available to substitute for ${subjectName}.`,
      };
    }
  }

  const fallback = qual.primaryTeacher || qual.qualifiedTeachers[0];
  return {
    teacher: fallback,
    isPrimary: fallback.id === qual.primaryTeacher?.id,
    isFree: false,
    reason: `All qualified teachers for ${subjectName} have conflict during this period.`,
  };
}

export {
  buildTeacherMasterSchedule as generateTeacherMasterSchedule,
  getQualifiedTeachersForSubject as getQualifiedFacultyForSubject,
  suggestBestTeacherForSlot as suggestConflictFreeTeacher,
};

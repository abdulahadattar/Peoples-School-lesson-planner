import { Teacher } from '../../../types';
import {
  DayKey,
  DAY_KEYS,
  DAY_LABELS,
  TimetableClassEntry,
} from '../types';
import { parseTimetableCell } from './cellParser';

export interface TeacherDoubleBookingClash {
  id: string;
  dayKey: DayKey;
  dayLabel: string;
  periodIndex: number;
  periodNo: number;
  teacher: Teacher;
  classes: string[];
  subjects: string[];
}

export interface UnassignedSubjectNotice {
  dayKey: DayKey;
  dayLabel: string;
  periodIndex: number;
  periodNo: number;
  classLabel: string;
  subject: string;
}

export interface TimetableAuditReport {
  clashes: TeacherDoubleBookingClash[];
  unassigned: UnassignedSubjectNotice[];
  totalSlots: number;
  totalClashes: number;
  cleanClassesCount: number;
  totalClassesCount: number;
  healthy: boolean;
}

export interface TeacherSlotAvailability {
  isBusy: boolean;
  busyInClass?: string;
  subject?: string;
  periodNo?: number;
}

export function auditFullTimetable(
  timetable: Record<string, TimetableClassEntry> | TimetableClassEntry[],
  teachers: Teacher[],
): TimetableAuditReport {
  const classes: TimetableClassEntry[] = Array.isArray(timetable)
    ? timetable
    : Object.values(timetable);

  const clashes: TeacherDoubleBookingClash[] = [];
  const unassigned: UnassignedSubjectNotice[] = [];
  let totalSlots = 0;
  const classesWithClash = new Set<string>();

  for (const day of DAY_KEYS) {
    const maxPeriods = Math.max(...classes.map(c => c.periods.length), 0);

    for (let pIdx = 0; pIdx < maxPeriods; pIdx++) {
      const teacherPresence = new Map<
        string,
        { teacher: Teacher; classes: string[]; subjects: string[] }
      >();

      for (const entry of classes) {
        const period = entry.periods[pIdx];
        if (!period) continue;
        const raw = period[day];
        if (!raw) continue;

        totalSlots++;
        const parsed = parseTimetableCell(raw, entry.label, teachers);

        if (parsed.empty) continue;

        for (const part of parsed.parts) {
          if (!part.teacher) {
            unassigned.push({
              dayKey: day,
              dayLabel: DAY_LABELS[day],
              periodIndex: pIdx,
              periodNo: period.no,
              classLabel: entry.label,
              subject: part.subject,
            });
          }
        }

        for (const t of parsed.teachers) {
          const record = teacherPresence.get(t.id) ?? {
            teacher: t,
            classes: [],
            subjects: [],
          };
          record.classes.push(entry.label);
          record.subjects.push(parsed.label);
          teacherPresence.set(t.id, record);
        }
      }

      for (const [_, record] of teacherPresence) {
        const uniqueClasses = Array.from(new Set(record.classes));
        if (uniqueClasses.length > 1) {
          clashes.push({
            id: `${day}_p${pIdx}_${record.teacher.id}`,
            dayKey: day,
            dayLabel: DAY_LABELS[day],
            periodIndex: pIdx,
            periodNo: pIdx + 1,
            teacher: record.teacher,
            classes: uniqueClasses,
            subjects: Array.from(new Set(record.subjects)),
          });
          uniqueClasses.forEach(c => classesWithClash.add(c));
        }
      }
    }
  }

  const cleanClassesCount = classes.filter(c => !classesWithClash.has(c.label)).length;

  return {
    clashes,
    unassigned,
    totalSlots,
    totalClashes: clashes.length,
    cleanClassesCount,
    totalClassesCount: classes.length,
    healthy: clashes.length === 0,
  };
}

export function checkTeacherAvailability(
  teacherId: string,
  day: DayKey,
  periodIndex: number,
  timetable: Record<string, TimetableClassEntry> | TimetableClassEntry[],
  excludeClassLabel?: string,
  teachers: Teacher[] = [],
): TeacherSlotAvailability {
  if (!teacherId) return { isBusy: false };

  const classes: TimetableClassEntry[] = Array.isArray(timetable)
    ? timetable
    : Object.values(timetable);

  for (const entry of classes) {
    if (excludeClassLabel && entry.label === excludeClassLabel) continue;
    const period = entry.periods[periodIndex];
    if (!period) continue;
    const raw = period[day];
    if (!raw) continue;

    const parsed = parseTimetableCell(raw, entry.label, teachers);
    const isPresent = parsed.teachers.some(t => t.id === teacherId);

    if (isPresent) {
      return {
        isBusy: true,
        busyInClass: entry.label,
        subject: parsed.label,
        periodNo: period.no,
      };
    }
  }

  return { isBusy: false };
}

export { checkTeacherAvailability as getTeacherSlotAvailability };

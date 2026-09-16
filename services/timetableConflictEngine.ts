/**
 * timetableConflictEngine.ts — High-precision Timetable & Faculty Sync Engine
 *
 * Provides:
 * 1. Synchronous subject ↔ teacher mapping grounded strictly in teachers.json.
 * 2. Real-time clash detection (preventing teacher double-booking across classes).
 * 3. Prevention of duplicate teachers or ghost parallel splits in a single slot.
 * 4. School-wide timetable clash auditor and health diagnostics.
 * 5. Faculty individual master schedule generator (viewing any teacher's weekly load).
 * 6. Conflict-free auto-scheduler and smart teacher recommender.
 */

import { Teacher } from '../types';
import {
  DayKey,
  DAY_KEYS,
  DAY_LABELS,
  SlotPart,
  TimetableClassEntry,
  TimetablePeriod,
} from './timetable';
import {
  isKnownSubject,
  normalizeSubject,
  resolveByName,
  resolveTeacher,
  subjectMatches,
} from './teacherRoster';

export interface ParsedSlot {
  /** Clean human-readable combined label, e.g. "Mathematics" or "Urdu / Sindhi" */
  label: string;
  /** Sub-parts for single or parallel subjects */
  parts: SlotPart[];
  /** Deduplicated array of teachers present in this slot */
  teachers: Teacher[];
  /** True if cell is blank, dash, or free */
  empty: boolean;
  /** True if this is a genuine parallel dual-subject split */
  isParallel: boolean;
  /** Raw input string */
  rawValue: string;
}

export interface TeacherSlotAvailability {
  isBusy: boolean;
  busyInClass?: string;
  subject?: string;
  periodNo?: number;
}

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

/* ──────────────────────────────────────────────────────────────────────────
   1. CELL PARSER & FORMATTER (Eliminates duplicates and false splits)
   ────────────────────────────────────────────────────────────────────────── */

/**
 * Parses any timetable cell string cleanly without duplicating teachers or
 * confusing "Subject / Teacher" with a parallel subject split.
 */
export function parseTimetableCell(
  rawVal: string,
  classLabel: string,
  teachers: Teacher[],
): ParsedSlot {
  const raw = (rawVal || '').trim();

  if (!raw || raw === '—' || raw === '-' || raw.toLowerCase() === 'free' || raw.toLowerCase() === 'free period') {
    return {
      label: 'Free period',
      parts: [],
      teachers: [],
      empty: true,
      isParallel: false,
      rawValue: raw,
    };
  }

  // Check if formatted with slash
  const rawParts = raw.split('/').map(s => s.trim()).filter(Boolean);

  if (rawParts.length === 1) {
    const single = rawParts[0];
    // Check for "Subject (Teacher Name)" pattern
    const parenMatch = single.match(/^(.+?)\s*\((.+?)\)$/);
    if (parenMatch) {
      const subject = normalizeSubject(parenMatch[1]);
      const explicitTeacherName = parenMatch[2].trim();
      const directTeacher = teachers.find(
        t => t.name.toLowerCase() === explicitTeacherName.toLowerCase(),
      ) || resolveByName(explicitTeacherName, teachers) || resolveTeacher(subject, classLabel, teachers);

      const tList = directTeacher ? [directTeacher] : [];
      return {
        label: subject,
        parts: [{ subject, teacher: directTeacher }],
        teachers: tList,
        empty: false,
        isParallel: false,
        rawValue: raw,
      };
    }

    // Bare name or bare subject
    let subject = normalizeSubject(single);
    let teacher = resolveTeacher(subject, classLabel, teachers);
    if (!teacher) teacher = resolveByName(single, teachers);

    if (teacher && !isKnownSubject(single)) {
      // Cell was actually a teacher's name (e.g. "Feroz")
      subject = teacher.subjects[0]?.name ?? subject;
    }

    const tList = teacher ? [teacher] : [];
    return {
      label: subject,
      parts: [{ subject, teacher }],
      teachers: tList,
      empty: false,
      isParallel: false,
      rawValue: raw,
    };
  }

  // Multiple parts separated by '/'
  // Check if second part is a Teacher's Name rather than a distinct subject (e.g. "Maths / Sir Bahadur")
  if (rawParts.length === 2) {
    const part1 = rawParts[0];
    const part2 = rawParts[1];

    const part2AsTeacher = teachers.find(
      t => t.name.toLowerCase() === part2.toLowerCase(),
    ) || resolveByName(part2, teachers);

    // If part 2 is recognized as a teacher AND not a distinct standard curriculum subject
    if (part2AsTeacher && !isKnownSubject(part2)) {
      const subject = normalizeSubject(part1);
      return {
        label: subject,
        parts: [{ subject, teacher: part2AsTeacher }],
        teachers: [part2AsTeacher],
        empty: false,
        isParallel: false,
        rawValue: raw,
      };
    }
  }

  // Genuine Parallel Subjects (e.g. "Urdu / Sindhi" or "Bio / Maths")
  const parts: SlotPart[] = [];
  const teachersPresent: Teacher[] = [];
  const seenTeacherIds = new Set<string>();

  for (const part of rawParts) {
    const parenMatch = part.match(/^(.+?)\s*\((.+?)\)$/);
    let sub = normalizeSubject(parenMatch ? parenMatch[1] : part);
    let t: Teacher | null = null;

    if (parenMatch) {
      const explicitName = parenMatch[2].trim();
      t = teachers.find(
        teacher => teacher.name.toLowerCase() === explicitName.toLowerCase(),
      ) || resolveByName(explicitName, teachers);
    }

    if (!t) {
      t = resolveTeacher(sub, classLabel, teachers);
    }
    if (!t) {
      t = resolveByName(part, teachers);
    }
    if (t && !isKnownSubject(part) && !parenMatch) {
      sub = t.subjects[0]?.name ?? sub;
    }

    parts.push({ subject: sub, teacher: t });

    if (t && !seenTeacherIds.has(t.id)) {
      seenTeacherIds.add(t.id);
      teachersPresent.push(t);
    }
  }

  // Deduplicate label components (e.g. "Maths / Maths" -> "Mathematics")
  const uniqueSubjects = [...new Set(parts.map(p => p.subject))];

  return {
    label: uniqueSubjects.join(' / '),
    parts,
    teachers: teachersPresent,
    empty: false,
    isParallel: parts.length > 1,
    rawValue: raw,
  };
}

/**
 * Format a cell value cleanly for storage in the timetable model.
 * Uses parentheses for custom teacher override to avoid slash-splitting bugs.
 */
export function formatTimetableCell(
  subject1: string,
  teacher1Name?: string,
  isParallel?: boolean,
  subject2?: string,
  teacher2Name?: string,
): string {
  const sub1 = (subject1 || '').trim();
  if (!sub1 || sub1 === '—') return '—';

  if (isParallel && subject2 && subject2.trim() && subject2.trim() !== '—') {
    const sub2 = subject2.trim();
    const t1Suffix = teacher1Name && teacher1Name.trim() ? ` (${teacher1Name.trim()})` : '';
    const t2Suffix = teacher2Name && teacher2Name.trim() ? ` (${teacher2Name.trim()})` : '';
    return `${sub1}${t1Suffix} / ${sub2}${t2Suffix}`;
  }

  // Single subject: if teacher is specified and not default, can format with parens, or just subject
  if (teacher1Name && teacher1Name.trim()) {
    return `${sub1} (${teacher1Name.trim()})`;
  }

  return sub1;
}

/* ──────────────────────────────────────────────────────────────────────────
   2. SUBJECT ↔ TEACHER SYNCHRONIZATION
   ────────────────────────────────────────────────────────────────────────── */

export interface QualifiedFacultyResult {
  primaryTeacher: Teacher | null;
  qualifiedTeachers: Teacher[];
  allTeachers: Teacher[];
}

/**
 * Returns the exact qualified teachers for a subject in a specific class section.
 * Identifies the registered "Primary" section teacher from teachers.json.
 */
export function getQualifiedTeachersForSubject(
  subjectName: string,
  classLabel: string,
  teachers: Teacher[],
): QualifiedFacultyResult {
  if (!subjectName || subjectName === '—') {
    return { primaryTeacher: null, qualifiedTeachers: [], allTeachers: teachers };
  }

  const normSub = normalizeSubject(subjectName);

  // Find all teachers whose subject list includes this normalized subject
  const qualifiedTeachers = teachers.filter(t =>
    t.subjects.some(s => {
      const normT = normalizeSubject(s.name);
      return (
        normT === normSub ||
        normT.includes(normSub) ||
        normSub.includes(normT)
      );
    }),
  );

  // Primary teacher is the one whose sections explicitly include this classLabel
  const primaryTeacher =
    qualifiedTeachers.find(t =>
      t.subjects.some(s => {
        const normT = normalizeSubject(s.name);
        const matchesSub = normT === normSub || normT.includes(normSub) || normSub.includes(normT);
        return matchesSub && s.sections.includes(classLabel);
      }),
    ) ||
    resolveTeacher(normSub, classLabel, teachers) ||
    qualifiedTeachers[0] ||
    null;

  return {
    primaryTeacher,
    qualifiedTeachers,
    allTeachers: teachers,
  };
}

/**
 * List all subjects a teacher is qualified to teach.
 */
export function getTeacherSubjects(teacher: Teacher): string[] {
  return [...new Set(teacher.subjects.map(s => s.name))];
}

/* ──────────────────────────────────────────────────────────────────────────
   3. CLASH & AVAILABILITY ENGINE
   ────────────────────────────────────────────────────────────────────────── */

/**
 * Checks if a teacher is already booked in another class at a specific day and period.
 */
export function checkTeacherAvailability(
  teacherId: string,
  dayKey: DayKey,
  periodIndex: number,
  timetableMap: Record<string, TimetableClassEntry>,
  excludeClassLabel?: string,
  teachers?: Teacher[],
): TeacherSlotAvailability {
  if (!teacherId) return { isBusy: false };

  for (const [classLabel, entry] of Object.entries(timetableMap)) {
    if (excludeClassLabel && classLabel === excludeClassLabel) continue;
    const period = entry.periods[periodIndex];
    if (!period) continue;

    const rawVal = period[dayKey];
    if (!rawVal || rawVal === '—') continue;

    const parsed = parseTimetableCell(rawVal, classLabel, teachers || []);
    const isPresent = parsed.teachers.some(t => t.id === teacherId);

    if (isPresent) {
      return {
        isBusy: true,
        busyInClass: classLabel,
        subject: parsed.label,
        periodNo: period.no,
      };
    }
  }

  return { isBusy: false };
}

/**
 * Audits the whole school timetable matrix for all days and periods.
 * Detects every teacher double-booking clash and unassigned subject.
 */
export function auditFullTimetable(
  timetableMap: Record<string, TimetableClassEntry>,
  teachers: Teacher[],
): TimetableAuditReport {
  const clashes: TeacherDoubleBookingClash[] = [];
  const unassigned: UnassignedSubjectNotice[] = [];
  let totalSlots = 0;
  const classesWithClash = new Set<string>();

  const classEntries = Object.values(timetableMap);
  const totalClassesCount = classEntries.length;

  for (const dayKey of DAY_KEYS) {
    const dayLabel = DAY_LABELS[dayKey];

    // Find the max period count across classes for this day
    const maxPeriods = Math.max(
      ...classEntries.map(c => (dayKey === 'fri' ? c.periods.filter(p => p.friStart && p.friEnd).length || 5 : c.periods.length)),
      7,
    );

    for (let pIdx = 0; pIdx < maxPeriods; pIdx++) {
      // Teacher ID -> Array of { classLabel, subject, periodNo, teacher }
      const teacherBookings = new Map<string, { classLabel: string; subject: string; periodNo: number; teacher: Teacher }[]>();

      for (const entry of classEntries) {
        const period = entry.periods[pIdx];
        if (!period) continue;
        const rawVal = period[dayKey];
        if (!rawVal || rawVal === '—') continue;

        totalSlots++;
        const parsed = parseTimetableCell(rawVal, entry.label, teachers);

        if (parsed.empty) continue;

        if (parsed.teachers.length === 0 && parsed.label && parsed.label !== 'Free period') {
          unassigned.push({
            dayKey,
            dayLabel,
            periodIndex: pIdx,
            periodNo: period.no,
            classLabel: entry.label,
            subject: parsed.label,
          });
        }

        for (const t of parsed.teachers) {
          const list = teacherBookings.get(t.id) ?? [];
          list.push({
            classLabel: entry.label,
            subject: parsed.label,
            periodNo: period.no,
            teacher: t,
          });
          teacherBookings.set(t.id, list);
        }
      }

      // Check for double bookings
      for (const [tId, bookings] of teacherBookings.entries()) {
        if (bookings.length > 1) {
          const first = bookings[0];
          const classList = bookings.map(b => b.classLabel);
          const subjectList = bookings.map(b => b.subject);

          classList.forEach(c => classesWithClash.add(c));

          clashes.push({
            id: `${first.teacher.id}-${dayKey}-${pIdx}`,
            dayKey,
            dayLabel,
            periodIndex: pIdx,
            periodNo: first.periodNo,
            teacher: first.teacher,
            classes: classList,
            subjects: subjectList,
          });
        }
      }
    }
  }

  const cleanClassesCount = Math.max(0, totalClassesCount - classesWithClash.size);

  return {
    clashes,
    unassigned,
    totalSlots,
    totalClashes: clashes.length,
    cleanClassesCount,
    totalClassesCount,
    healthy: clashes.length === 0,
  };
}

/* ──────────────────────────────────────────────────────────────────────────
   4. FACULTY INDIVIDUAL MASTER SCHEDULE (View any teacher's weekly load)
   ────────────────────────────────────────────────────────────────────────── */

/**
 * Builds the complete weekly teaching schedule for an individual teacher.
 * Highlights classes, periods, subjects, and any clashes.
 */
export function buildTeacherMasterSchedule(
  teacherId: string,
  timetableMap: Record<string, TimetableClassEntry>,
  teachers: Teacher[],
): TeacherMasterSchedule | null {
  const teacher = teachers.find(t => t.id === teacherId);
  if (!teacher) return null;

  const weeklySchedule: Record<DayKey, TeacherWeeklySlot[]> = {
    mon: [],
    tue: [],
    wed: [],
    thu: [],
    fri: [],
    sat: [],
  };

  const classesTaughtSet = new Set<string>();
  const subjectsTaughtSet = new Set<string>();
  let totalTeachingPeriods = 0;
  let clashCount = 0;

  for (const dayKey of DAY_KEYS) {
    // Find the standard periods
    for (let pIdx = 0; pIdx < 7; pIdx++) {
      const matchingSlots: { classLabel: string; subject: string; isParallel: boolean; periodNo: number }[] = [];

      for (const [classLabel, entry] of Object.entries(timetableMap)) {
        const period = entry.periods[pIdx];
        if (!period) continue;
        const rawVal = period[dayKey];
        if (!rawVal || rawVal === '—') continue;

        const parsed = parseTimetableCell(rawVal, classLabel, teachers);
        const hasThisTeacher = parsed.teachers.some(t => t.id === teacherId);

        if (hasThisTeacher) {
          matchingSlots.push({
            classLabel,
            subject: parsed.label,
            isParallel: parsed.isParallel,
            periodNo: period.no,
          });
          classesTaughtSet.add(classLabel);
          subjectsTaughtSet.add(parsed.label);
        }
      }

      if (matchingSlots.length > 0) {
        totalTeachingPeriods += matchingSlots.length;
        const isClash = matchingSlots.length > 1;
        if (isClash) clashCount++;

        matchingSlots.forEach((slot, idx) => {
          weeklySchedule[dayKey].push({
            periodNo: slot.periodNo,
            periodIndex: pIdx,
            classLabel: slot.classLabel,
            subject: slot.subject,
            isParallel: slot.isParallel,
            hasClash: isClash,
            clashingWithClass: isClash ? matchingSlots.filter((_, i) => i !== idx).map(m => m.classLabel).join(', ') : undefined,
          });
        });
      }
    }
  }

  return {
    teacher,
    weeklySchedule,
    totalTeachingPeriods,
    classesTaught: [...classesTaughtSet],
    subjectsTaught: [...subjectsTaughtSet],
    clashCount,
  };
}

/* ──────────────────────────────────────────────────────────────────────────
   5. SMART AUTO-SCHEDULER & CONFLICT RESOLVER
   ────────────────────────────────────────────────────────────────────────── */

export interface SmartTeacherSuggestion {
  teacher: Teacher;
  isPrimary: boolean;
  isFree: boolean;
  busyInClass?: string;
  reason: string;
}

/**
 * Suggests the best conflict-free teacher for a subject slot in a class.
 */
export function suggestBestTeacherForSlot(
  subjectName: string,
  classLabel: string,
  dayKey: DayKey,
  periodIndex: number,
  timetableMap: Record<string, TimetableClassEntry>,
  teachers: Teacher[],
): SmartTeacherSuggestion | null {
  const { primaryTeacher, qualifiedTeachers } = getQualifiedTeachersForSubject(
    subjectName,
    classLabel,
    teachers,
  );

  if (!primaryTeacher && qualifiedTeachers.length === 0) return null;

  // 1. Check primary teacher
  if (primaryTeacher) {
    const avail = checkTeacherAvailability(
      primaryTeacher.id,
      dayKey,
      periodIndex,
      timetableMap,
      classLabel,
      teachers,
    );
    if (!avail.isBusy) {
      return {
        teacher: primaryTeacher,
        isPrimary: true,
        isFree: true,
        reason: `Designated section faculty in teachers.json (Free at this period)`,
      };
    }
  }

  // 2. Check alternative qualified teachers
  for (const alt of qualifiedTeachers) {
    if (primaryTeacher && alt.id === primaryTeacher.id) continue;
    const avail = checkTeacherAvailability(
      alt.id,
      dayKey,
      periodIndex,
      timetableMap,
      classLabel,
      teachers,
    );
    if (!avail.isBusy) {
      return {
        teacher: alt,
        isPrimary: false,
        isFree: true,
        reason: `Qualified subject specialist (Available alternative to avoid clash with ${avail.busyInClass || 'other class'})`,
      };
    }
  }

  // 3. If all are busy, return primary with clash warning
  if (primaryTeacher) {
    const avail = checkTeacherAvailability(
      primaryTeacher.id,
      dayKey,
      periodIndex,
      timetableMap,
      classLabel,
      teachers,
    );
    return {
      teacher: primaryTeacher,
      isPrimary: true,
      isFree: false,
      busyInClass: avail.busyInClass,
      reason: `Primary faculty is busy in Class ${avail.busyInClass} at Period ${avail.periodNo}`,
    };
  }

  return null;
}

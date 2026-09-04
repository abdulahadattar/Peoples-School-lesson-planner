/**
 * timetable.ts — Live Monitor engine.
 *
 * Loads the timetable JSON (generated from the school's Excel timetable by
 * scripts/parse_timetable.py) and combines it with the teacher roster
 * (public/teachers.json) to answer:
 *   - who is teaching which class RIGHT NOW (live period detection by clock)
 *   - who is teaching where at any (day, period) the principal previews
 *   - which teachers are currently free (staff room)
 *
 * Subject cells may contain parallel alternatives separated by '/'
 * (e.g. "Urdu / Sindhi", "Maths / Biology") — BOTH teachers are present in
 * the class simultaneously; that is NOT a clash.
 */
import { Teacher } from '../types';

export type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat';

export const DAY_KEYS: DayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
export const DAY_LABELS: Record<DayKey, string> = {
  mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday',
  thu: 'Thursday', fri: 'Friday', sat: 'Saturday',
};

export interface TimetablePeriod {
  no: number;
  start: string;
  end: string;
  friStart: string | null;
  friEnd: string | null;
  mon: string;
  tue: string;
  wed: string;
  thu: string;
  fri: string;
  sat: string;
}

export interface TimetableClassEntry {
  label: string;
  classTeacher: string;
  periods: TimetablePeriod[];
}

export interface TimetableData {
  generatedAt: string;
  classes: TimetableClassEntry[];
}

export interface SlotPart {
  subject: string;
  teacher: Teacher | null;
}

export interface ResolvedSlot {
  /** Combined label, e.g. "Urdu / Sindhi". */
  label: string;
  /** One entry per parallel subject (split on '/'). */
  parts: SlotPart[];
  /** Teachers present in this class at this slot (parallel options both count). */
  teachers: Teacher[];
  /** True when the cell is empty (free period for the class). */
  empty: boolean;
}

export interface PeriodLocation {
  /** Index into the class's periods array, or -1 when outside school hours. */
  index: number;
  /** 'before' | 'in' | 'break' | 'after' relative to this class's schedule. */
  state: 'before' | 'in' | 'break' | 'after';
  /** Label of the current state, e.g. "Period 3", "Break", "Before school". */
  label: string;
}

let cache: TimetableData | null = null;

export async function loadTimetable(): Promise<TimetableData> {
  if (cache) return cache;
  const res = await fetch('/timetable.json');
  if (!res.ok) throw new Error(`Failed to load timetable (${res.status})`);
  cache = await res.json();
  return cache;
}

/** Day key (mon..sat) for a Date, or null on Sunday (school closed). */
export function dayKeyForDate(d: Date): DayKey | null {
  const day = d.getDay(); // 0 = Sunday
  if (day === 0) return null;
  return DAY_KEYS[day - 1];
}

/**
 * Parse "8:15 AM" / "01:35 PM" / bare "8:15" / "12:15" into minutes since
 * midnight. Bare times (no AM/PM) are resolved by school-day context:
 * 12+ -> PM, 7-11 -> AM, 1-6 -> PM (afternoon slots).
 */
export function parseTimeToMinutes(t: string): number {
  const m = t.trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!m) return NaN;
  let h = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  const ap = m[3];
  if (ap === 'pm' && h < 12) h += 12;
  if (ap === 'am' && h === 12) h = 0;
  if (!ap) {
    if (h === 12) h = 12;
    else if (h >= 7 && h <= 11) h = h;
    else if (h >= 13) h = h;
    else h += 12; // 1..6 -> PM
  }
  return h * 60 + min;
}

export function formatMinutes(min: number): string {
  const h24 = Math.floor(min / 60);
  const m = min % 60;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const ap = h24 >= 12 ? 'PM' : 'AM';
  return `${h12}:${String(m).padStart(2, '0')} ${ap}`;
}

/** Start/end minutes for a period on a given day (Friday uses friStart/friEnd when present). */
export function periodTimeRange(p: TimetablePeriod, day: DayKey): { start: number; end: number } {
  if (day === 'fri' && p.friStart && p.friEnd) {
    return { start: parseTimeToMinutes(p.friStart), end: parseTimeToMinutes(p.friEnd) };
  }
  return { start: parseTimeToMinutes(p.start), end: parseTimeToMinutes(p.end) };
}

/** Where a given clock time falls in a class's day. */
export function locatePeriod(entry: TimetableClassEntry, day: DayKey, minutes: number): PeriodLocation {
  const times = entry.periods.map(p => periodTimeRange(p, day));
  for (let i = 0; i < times.length; i++) {
    const { start, end } = times[i];
    if (minutes >= start && minutes < end) {
      return { index: i, state: 'in', label: `Period ${entry.periods[i].no}` };
    }
    if (minutes < start) {
      const prevEnd = i > 0 ? times[i - 1].end : -1;
      if (i > 0 && minutes >= prevEnd && minutes < start) {
        return { index: -1, state: 'break', label: 'Break' };
      }
      return { index: -1, state: 'before', label: 'Before school' };
    }
  }
  return { index: -1, state: 'after', label: 'School over' };
}

/** Reference (school-wide) schedule — the first class's periods, used by the header. */
export function standardSchedule(classes: TimetableClassEntry[]) {
  const entry = classes[0];
  if (!entry) return [];
  return entry.periods.map(p => ({
    no: p.no,
    start: p.start,
    end: p.end,
    startMin: parseTimeToMinutes(p.start),
    endMin: parseTimeToMinutes(p.end),
  }));
}

/* ── Subject normalisation ─────────────────────────────────────── */

const SUBJECT_ALIASES: Record<string, string> = {
  maths: 'Mathematics',
  math: 'Mathematics',
  sci: 'Science',
  science: 'Science',
  's.s': 'Social Studies',
  's.st': 'Social Studies',
  sst: 'Social Studies',
  'social studies': 'Social Studies',
  islam: 'Islamiat',
  islamiat: 'Islamiat',
  art: 'Art',
  'p.e': 'P.E',
  pe: 'P.E',
  'eng lib': 'Library',
  lib: 'Library',
  library: 'Library',
  urdu: 'Urdu',
  sindhi: 'Sindhi',
  english: 'English',
  physics: 'Physics',
  chemistry: 'Chemistry',
  biology: 'Biology',
  ict: 'ICT',
  pst: 'Pak Studies',
  'pak studies': 'Pak Studies',
  'pakistan studies': 'Pak Studies',
};

export function normalizeSubject(raw: string): string {
  const key = raw.trim().toLowerCase().replace(/\s+/g, ' ');
  return SUBJECT_ALIASES[key] ?? raw.trim();
}

/* ── Class-section -> teacher matching ─────────────────────────── */

const SECTION_TO_CLASS: Record<string, string> = {
  'IV-A': 'class4', 'IV-B': 'class4',
  V: 'class5',
  'VI-A': 'class6', 'VI-B': 'class6',
  VII: 'class7',
  VIII: 'class8',
  IX: 'class9',
  'X-A': 'class10', 'X-B': 'class10',
  XI: 'class11',
  XII: 'class12',
};

/** Match a timetable subject to a teacher from teachers.json. */
export function resolveTeacher(subject: string, section: string, teachers: Teacher[]): Teacher | null {
  const norm = normalizeSubject(subject);
  if (norm === 'Library') return null;
  const candidates = teachers.filter(t =>
    (t.subjects || []).some(s => normalizeSubject(s) === norm),
  );
  if (candidates.length === 0) return null;
  const classId = SECTION_TO_CLASS[section];
  const inSection = candidates.filter(t =>
    classId && (t.sectionLabels?.[classId] ?? []).includes(section),
  );
  const inClass = candidates.filter(t => classId && (t.classIds ?? []).includes(classId));
  return inSection[0] ?? inClass[0] ?? candidates[0];
}

/** Some cells contain a teacher's name instead of a subject (e.g. "Feroz"). */
export function resolveByName(raw: string, teachers: Teacher[]): Teacher | null {
  const namePart = raw.trim().replace(/^(sir|miss|ma'am|mrs|mr)\s+/i, '').toLowerCase();
  if (!namePart) return null;
  return (
    teachers.find(t => {
      const tn = t.name.toLowerCase().replace(/^(sir|miss|ma'am|mrs|mr)\s+/i, '');
      return tn === namePart || tn.startsWith(namePart + ' ') || tn.startsWith(namePart);
    }) ?? null
  );
}

/** Resolve a timetable cell into its subject(s) and teacher(s) for a section. */
export function resolveSlot(
  entry: TimetableClassEntry,
  day: DayKey,
  periodIndex: number,
  teachers: Teacher[],
): ResolvedSlot {
  const period = entry.periods[periodIndex];
  const raw = period?.[day]?.trim() ?? '';
  if (!raw) {
    return { label: 'Free period', parts: [], teachers: [], empty: true };
  }
  const subjects = raw.split('/').map(s => s.trim()).filter(Boolean);
  const parts: SlotPart[] = subjects.map(subjectRaw => {
    let subject = normalizeSubject(subjectRaw);
    let teacher = resolveTeacher(subject, entry.label, teachers);
    if (!teacher) teacher = resolveByName(subjectRaw, teachers);
    if (teacher && SUBJECT_ALIASES[subjectRaw.toLowerCase().replace(/\s+/g, ' ')] === undefined) {
      // Cell was a teacher name (e.g. "Feroz") — label it with their subject.
      subject = teacher.subjects?.[0] ?? subject;
    }
    return { subject, teacher };
  });
  const teachersPresent = parts.map(p => p.teacher).filter((t): t is Teacher => !!t);
  return {
    label: parts.map(p => p.subject).join(' / '),
    parts,
    teachers: teachersPresent,
    empty: false,
  };
}

/* ── Staff room ────────────────────────────────────────────────── */

export interface StaffStatus {
  teacher: Teacher;
  /** Classes the teacher is teaching right now (empty = free). */
  busyIn: string[];
  /** True when every class slot is a parallel option (both run) — still counts as busy. */
  status: 'busy' | 'free';
}

export function computeStaff(
  classes: TimetableClassEntry[],
  teachers: Teacher[],
  day: DayKey,
  periodIndex: number,
): { busy: StaffStatus[]; free: Teacher[] } {
  const busyMap = new Map<string, string[]>();
  for (const entry of classes) {
    const slot = resolveSlot(entry, day, periodIndex, teachers);
    for (const t of slot.teachers) {
      const list = busyMap.get(t.id) ?? [];
      list.push(entry.label);
      busyMap.set(t.id, list);
    }
  }
  const busy: StaffStatus[] = [];
  for (const [id, classesList] of busyMap) {
    const teacher = teachers.find(t => t.id === id);
    if (teacher) busy.push({ teacher, busyIn: classesList, status: 'busy' });
  }
  const busyIds = new Set(busyMap.keys());
  const free = teachers.filter(t => !busyIds.has(t.id));
  return { busy, free };
}
import { Teacher } from '../../types';

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
  label: string;
  parts: SlotPart[];
  teachers: Teacher[];
  empty: boolean;
}

export interface PeriodLocation {
  index: number;
  state: 'before' | 'in' | 'break' | 'after';
  label: string;
}

export interface SchoolTimeStatus {
  state: 'in_period' | 'break' | 'before_school' | 'after_school' | 'closed';
  periodIndex: number;
  periodNo: number | null;
  periodLabel: string;
  startMinutes: number;
  endMinutes: number;
  remainingMinutes: number;
  totalDurationMinutes: number;
  progressPercent: number;
  nextPeriodNo: number | null;
  nextPeriodStartMinutes: number | null;
  firstPeriodStart: number;
  lastPeriodEnd: number;
}

export interface StaffStatus {
  teacher: Teacher;
  busyIn: string[];
  status: 'busy' | 'free';
}

import type { SheetDayKey } from '../timetableSheetLayout';
import type { TimetableClassEntry, TimetableData, TimetablePeriod } from '../timetable';

export interface SheetPeriod extends TimetablePeriod {
  row1: number;
  rawTime: string;
  rawFridayTime: string;
}

export interface SheetClassEntry extends TimetableClassEntry {
  tabName: string;
  gid: number;
  detectedDays: SheetDayKey[];
  hasFridayTimeColumn: boolean;
  periods: SheetPeriod[];
}

export interface TimetableSheetTabStatus {
  tab: string;
  classLabel: string;
  teacher: string;
  ok: boolean;
  error?: string;
  warnings: string[];
  periodCount: number;
}

export interface TimetableSheetSnapshot {
  classes: TimetableClassEntry[];
  fetchedAt: number;
  perTab: TimetableSheetTabStatus[];
}

export interface TimetableDiffEntry {
  classLabel: string;
  tabName: string;
  periodNo: number;
  day: SheetDayKey | 'time';
  local: string;
  remote: string;
}

export interface TimetableSheetMergeResult {
  data: TimetableData;
  fromSheet: string[];
  keptLocal: string[];
  degraded: string[];
}

export interface FetchTimetableTabOptions {
  forceRefresh?: boolean;
}

export interface FetchTimetableSheetOptions {
  forceRefresh?: boolean;
}

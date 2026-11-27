import type { SheetDayKey } from '../timetableSheetLayout';

export interface TimetableCellWrite {
  tabName: string;
  classLabel: string;
  a1: string;
  row1: number;
  col0: number;
  day: SheetDayKey | 'time';
  periodNo: number;
  value: string;
  previous: string;
}

export interface TimetableTabSkip {
  tabName: string;
  classLabel: string;
  reason: string;
}

export interface TimetableTabGuard {
  tabName: string;
  periodRows: number[];
  forbiddenRows: number[];
  dayColumns: number[];
  timeColumns: number[];
}

export interface TimetableWritePlan {
  writes: TimetableCellWrite[];
  timeWrites: TimetableCellWrite[];
  skippedTabs: TimetableTabSkip[];
  unchangedTabs: string[];
  totalCellsConsidered: number;
  guards: Record<string, TimetableTabGuard>;
}

export interface PlanTimetableWritesOptions {
  allowTimeWrites?: boolean;
  tabNames?: string[];
  writeFridayTimeColumn?: boolean;
}

export interface RemoteTimetableSnapshot {
  grids: Record<string, string[][]>;
  readAt?: number;
}

export type RemoteGrids = Record<string, string[][]>;

export interface TimetableWriteError {
  tabName: string;
  range: string;
  message: string;
}

export interface TimetableTabResult {
  tabName: string;
  classLabel: string;
  ok: boolean;
  cellsWritten: number;
  ranges: string[];
  error?: string;
}

export interface TimetableApplyResult {
  ok: boolean;
  needsReconnect: boolean;
  tabsWritten: string[];
  cellsWritten: number;
  skipped: TimetableTabSkip[];
  errors: TimetableWriteError[];
  perTab: TimetableTabResult[];
}

export interface TimetableCellRange {
  range: string;
  values: string[][];
  cells: number;
}

export interface ApplyTimetableWritesOptions {
  fetchImpl?: typeof fetch;
}

export interface SyncTimetableOptions extends PlanTimetableWritesOptions {
  dryRun?: boolean;
  accessToken?: string;
  fetchImpl?: typeof fetch;
  cacheBust?: boolean;
}

export interface SyncTimetableReport {
  ok: boolean;
  dryRun: boolean;
  needsReconnect: boolean;
  tabsWritten: string[];
  cellsWritten: number;
  unchangedTabs: string[];
  skipped: TimetableTabSkip[];
  errors: TimetableWriteError[];
  perTab: TimetableTabResult[];
  plan: TimetableWritePlan;
}

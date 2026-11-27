export type SheetDayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat';

export interface SheetLayout {
  classLabel: string;
  teacher: string;
  title: string;
  headerRow: number;
  firstPeriodRow: number;
  lastPeriodRow: number;
  timeColumnIndex: number;
  snoColumnIndex: number | null;
  columns: Record<SheetDayKey, number>;
  hasFridayTimeColumn: boolean;
  periodRows: number[];
  breakRows: number[];
  ignoredRows: number[];
  warnings: string[];
}

export type PartialColumns = Partial<Record<SheetDayKey, number>>;

export const DAY_KEYS: SheetDayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export const DAY_TOKENS: Record<string, SheetDayKey> = {
  monday: 'mon', tuesday: 'tue', wednesday: 'wed', thursday: 'thu', friday: 'fri', saturday: 'sat',
  mon: 'mon', tue: 'tue', tues: 'tue', wed: 'wed', weds: 'wed', thu: 'thu', thur: 'thu', thurs: 'thu',
  fri: 'fri', sat: 'sat',
};

export const OUT_OF_SCOPE_DAY_TOKENS: Record<string, string> = { sunday: 'sunday', sun: 'sunday' };

export const PRIMARY_TIME_TOKENS = new Set(['time', 'timings', 'timing', 'periodtime', 'schooltime', 'timeperiod']);
export const SNO_TOKENS = new Set(['sno', 'srno', 'serialno', 'snumber', 'sino', 'no']);
export const CLOCK_RE = /\b\d{1,2}\s*[:.]\s*\d{2}\b/g;
export const HEADER_SCAN_ROWS = 6;

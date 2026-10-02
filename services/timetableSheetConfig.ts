/**
 * Timetable Google Sheet configuration.
 *
 * The timetable is a hand-maintained *display* grid, not a structured table, so
 * the app can never assume fixed A1 ranges. Every tab is a different size and
 * the columns are not in the same order everywhere. This module is the single
 * source of truth for which tabs exist and the known structural quirks that the
 * layout detector has to cope with.
 *
 * Observed structure (verified against the live sheet, 12 tabs):
 *   Row 1        title, usually a two-line cell ("Time Table IV-A" / "Miss Daniya")
 *   Row 2        header: S.no | Time | Monday..Saturday
 *   Row 3..7     periods 1-4
 *   Row 8        "Break-Time 10:50 to 11:20"  (layout row, not a period)
 *   Row 9..11    periods 5-7
 *   Row 12+      blank separator, a "Friday Schedule:" footnote whose timings
 *                contradict the grid above, and on VII a subject->teacher
 *                reference table.
 *
 * None of the trailing rows may ever be written to. See
 * services/timetableSheetLayout.ts for the detector that enforces this.
 */

export const TIMETABLE_SHEET_ID = '1u2JTgmxgOClmOUqA0nERRAt6FiPLikjeGsZnWp8yjDo';

export const TIMETABLE_SHEET_URL = `https://docs.google.com/spreadsheets/d/${TIMETABLE_SHEET_ID}/edit`;

export interface TimetableSheetTab {
  /** Sheet tab name - required for the values.update A1 range. */
  name: string;
  /** Numeric grid id - required for the public CSV export. */
  gid: number;
  /** Class as written in the tab title, e.g. "IV-A", "GRADE-XI". */
  classLabel: string;
  /** Class teacher as written in the tab title. */
  teacher: string;
  /** VII carries an extra "Friday Time" column between Time and Monday. */
  hasFridayTimeColumn: boolean;
  /** XII has a blank S.no. header cell. */
  hasSnoHeader: boolean;
}

export const TIMETABLE_SHEET_TABS: TimetableSheetTab[] = [
  { name: 'IV-A', gid: 738313611, classLabel: 'IV-A', teacher: 'Miss Daniya', hasFridayTimeColumn: false, hasSnoHeader: true },
  { name: 'IV-B', gid: 102330794, classLabel: 'IV-B', teacher: 'Miss Ftaima', hasFridayTimeColumn: false, hasSnoHeader: true },
  { name: 'V', gid: 645273063, classLabel: 'V', teacher: 'Sir Hashim', hasFridayTimeColumn: false, hasSnoHeader: true },
  { name: 'VI-A', gid: 450787217, classLabel: 'VI-A', teacher: 'MISS Aneela', hasFridayTimeColumn: false, hasSnoHeader: true },
  { name: 'VI-B', gid: 237418442, classLabel: 'VI-B', teacher: 'SIR Shuhban', hasFridayTimeColumn: false, hasSnoHeader: true },
  { name: 'VII', gid: 1764532128, classLabel: 'VII', teacher: 'Sir Atta Muhammad Joyo', hasFridayTimeColumn: true, hasSnoHeader: true },
  { name: 'VIII', gid: 1358085796, classLabel: 'VIII', teacher: 'Miss Madiha', hasFridayTimeColumn: false, hasSnoHeader: true },
  { name: 'IX', gid: 1755705391, classLabel: 'IX', teacher: 'Sir Abdul Ahad', hasFridayTimeColumn: false, hasSnoHeader: true },
  { name: 'X-A', gid: 2116267833, classLabel: 'X-A', teacher: 'Miss Asra', hasFridayTimeColumn: false, hasSnoHeader: true },
  { name: 'X-B', gid: 979368168, classLabel: 'X-B', teacher: 'Sir Muhammad Rajab', hasFridayTimeColumn: false, hasSnoHeader: true },
  { name: 'XI', gid: 310539299, classLabel: 'XI', teacher: 'Sir Bahadur', hasFridayTimeColumn: false, hasSnoHeader: true },
  { name: 'XII', gid: 415731737, classLabel: 'XII', teacher: 'Sir kamran', hasFridayTimeColumn: false, hasSnoHeader: false },
];

/** Public CSV export for one tab. No OAuth required, so reads keep working
 *  while the Google token is expired. */
export function timetableCsvUrl(gid: number): string {
  return `https://docs.google.com/spreadsheets/d/${TIMETABLE_SHEET_ID}/export?format=csv&gid=${gid}`;
}

/**
 * The timetable does not change daily, so the sheet is polled infrequently (daily / 24 hours)
 * and can be refreshed manually at any time.
 */
export const TIMETABLE_SHEET_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export const TIMETABLE_SHEET_POLL_MS = 24 * 60 * 60 * 1000;

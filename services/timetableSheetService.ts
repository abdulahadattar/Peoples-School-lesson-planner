/**
 * timetableSheetService.ts — READ PATH (Google Sheet -> app).
 *
 * The timetable sheet is a hand-maintained *display* grid, not a structured
 * table, so nothing here may assume fixed A1 ranges. Each of the 12 tabs is
 * mapped through `detectLayout` (services/timetableSheetLayout.ts) and turned
 * into the app's own `TimetableClassEntry` shape.
 *
 * Guarantees this file is built around:
 *  - A single bad tab must never fail the whole read. Every tab is fetched,
 *    parsed and mapped independently and reports its own status in `perTab`.
 *  - Reads must work with an expired/absent Google token. The public CSV export
 *    needs no OAuth, so nothing here consults `isGoogleTokenExpired()`.
 *  - Read-only. There is no values.update / clear / batchUpdate call in here;
 *    writes belong to the writer side.
 *  - No `setInterval`. Polling belongs to a React hook, not to a service.
 *
 * Caching is memory-only. `services/storageService.ts` has exactly one
 * IndexedDB store (`phssj_student_records_cache_v2_*`) and it is typed for
 * student records, so reusing it for the timetable would poison that cache.
 * Rather than invent a second store in a file this agent does not own, the
 * snapshot is cached in memory against TIMETABLE_SHEET_CACHE_TTL_MS.
 */
import {
  TIMETABLE_SHEET_CACHE_TTL_MS,
  TIMETABLE_SHEET_TABS,
  timetableCsvUrl,
  type TimetableSheetTab,
} from './timetableSheetConfig';
import { detectLayout, readCell, type SheetDayKey, type SheetLayout } from './timetableSheetLayout';
// The writer's parser, not googleSheetsService.parseCSV. That one trims every
// cell and drops rows that collapse to nothing, which renumbers every sheet row
// below the gap - so `SheetPeriod.row1` would index the compacted array instead
// of the real sheet. These tabs are hand-maintained grids whose blank rows and
// trailing spaces carry meaning, and the writer refuses to use the trimming
// parser for exactly that reason; reading with it while writing without it meant
// the two halves of the sync saw structurally different grids for one tab.
import { parseCsvToGrid } from './timetableSheetWriter';
import type { TimetableClassEntry, TimetableData, TimetablePeriod } from './timetable';

/* ── Public types ────────────────────────────────────────────────── */

/** A period as it was read out of the sheet, with the provenance the app's
 *  `TimetablePeriod` has no room for (which row it came from, the raw time). */
export interface SheetPeriod extends TimetablePeriod {
  /** 1-based sheet row this period was read from. */
  row1: number;
  /** Raw time cell, e.g. "8:15 to 8:50". */
  rawTime: string;
  /** Raw Friday Time cell when the tab has that column, else ''. */
  rawFridayTime: string;
}

/** A class read out of the sheet, with the layout provenance kept alongside. */
export interface SheetClassEntry extends TimetableClassEntry {
  tabName: string;
  gid: number;
  /** Days the layout actually found a column for. Undetected days are skipped
   *  by the diff rather than reported as "the sheet cleared this subject". */
  detectedDays: SheetDayKey[];
  /** True when the tab carries a "Friday Time" column. */
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
  /** Ready to use as `TimetableData`. */
  data: TimetableData;
  /** Class labels whose data came from the sheet. */
  fromSheet: string[];
  /** Class labels the sheet has no tab for, kept from the local/bundled data. */
  keptLocal: string[];
  /** Class labels whose tab failed, so the local data was kept instead. */
  degraded: string[];
}

export interface FetchTimetableTabOptions {
  forceRefresh?: boolean;
}

export interface FetchTimetableSheetOptions {
  forceRefresh?: boolean;
}

/* ── Constants ───────────────────────────────────────────────────── */

const SHEET_DAYS: { key: SheetDayKey; header: RegExp }[] = [
  { key: 'mon', header: /^mon/i },
  { key: 'tue', header: /^tue/i },
  { key: 'wed', header: /^wed/i },
  { key: 'thu', header: /^thu/i },
  { key: 'fri', header: /^fri/i },
  { key: 'sat', header: /^sat/i },
];

const TIME_CELL_RE = /(\d{1,2}\s*:\s*\d{2})\s*(?:-|–|—|=>|\.\.|to\b|thru\b)\s*(\d{1,2}\s*:\s*\d{2})/i;
const SINGLE_TIME_RE = /\d{1,2}\s*:\s*\d{2}/;
const SNO_CELL_RE = /^\s*\d{1,2}\s*$/;
/** School-day resolution of a bare time, mirroring `parseTimeToMinutes` in
 *  services/timetable.ts (12 -> noon, 7-11 -> AM, 1-6 -> PM). Kept local so
 *  this service does not pull services/timetable.ts (and its JSON import) at
 *  runtime; the two must agree or every Friday would drift by hours. */
export function sheetTimeToMinutes(t: string): number {
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
    else h += 12;
  }
  return h * 60 + min;
}

/** "08:15" -> "8:15", "8:15 to 8:50" split into its two halves. */
function normaliseTimeString(t: string): string {
  return t.trim().replace(/^0(\d)/, '$1').replace(/\s*:\s*/, ':');
}

function splitTimeCell(raw: string): { start: string; end: string } | null {
  const t = raw.trim();
  if (!t) return null;
  const m = t.match(TIME_CELL_RE);
  if (m) {
    return { start: normaliseTimeString(m[1]), end: normaliseTimeString(m[2]) };
  }
  const single = t.match(SINGLE_TIME_RE);
  if (single) return { start: normaliseTimeString(single[0]), end: '' };
  return null;
}

/** Comparison normalisation for subjects: trim, collapse spaces, lower case. */
function normSubject(v: string | null | undefined): string {
  return (v ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

/* ── Layout access ───────────────────────────────────────────────── */

/**
 * The `SheetLayout` field names are owned by the layout module. These readers
 * accept the documented shape first and a small set of equivalent spellings
 * second, so a rename in the layout module degrades into a warning rather than
 * a blank timetable. When the layout yields nothing usable at all, the header
 * row is scanned directly and a warning is recorded.
 */
type AnyRecord = Record<string, unknown>;

function asRecord(v: unknown): AnyRecord | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as AnyRecord) : null;
}

function firstArrayField(rec: AnyRecord, keys: string[]): unknown[] | null {
  for (const key of keys) {
    const v = rec[key];
    if (Array.isArray(v)) return v;
  }
  return null;
}

function numberField(rec: AnyRecord, keys: string[]): number | null {
  for (const key of keys) {
    const v = rec[key];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return null;
}

/** 1-based sheet rows of the detected period rows. */
function layoutPeriodRows1(layout: SheetLayout | null | undefined): number[] {
  const rec = asRecord(layout);
  if (!rec) return [];
  const arr = firstArrayField(rec, [
    'periodRows1',
    'periodRowNumbers1',
    'periodRows',
    'periodRowNumbers',
    'rows1',
    'rows',
    'periods',
  ]);
  if (!arr) return [];
  const out: number[] = [];
  for (const item of arr) {
    let n: number | null = null;
    if (typeof item === 'number') n = item;
    else {
      const r = asRecord(item);
      if (r) n = numberField(r, ['row1', 'row', 'rowNumber', 'index1']);
    }
    if (typeof n === 'number' && Number.isFinite(n)) out.push(n);
  }
  return out;
}

const DAY_COLUMN_FIELDS = [
  'dayColumns',
  'dayColumns0',
  'dayCols',
  'colByDay',
  'dayCol',
  'dayColumnMap',
  'days',
  'dayMap',
  'columns',
  'cols',
  'headerMap',
];

/** Day -> 0-based column index, only for days the layout actually detected. */
function layoutDayColumns(layout: SheetLayout | null | undefined): Partial<Record<SheetDayKey, number>> {
  const rec = asRecord(layout);
  if (!rec) return {};
  let entries: [string, unknown][] = [];

  for (const key of DAY_COLUMN_FIELDS) {
    const v = rec[key];
    if (v === undefined || v === null) continue;

    if (Array.isArray(v)) {
      entries = v.map((item, i) => {
        if (typeof item === 'number') return [SHEET_DAYS[i]?.key ?? String(i), item] as [string, unknown];
        const r = asRecord(item);
        if (r) {
          const k = typeof r.day === 'string' ? r.day : typeof r.key === 'string' ? r.key : String(i);
          return [k, r.col0 ?? r.col ?? r.column0 ?? r.column] as [string, unknown];
        }
        return [String(i), undefined] as [string, unknown];
      });
      break;
    }
    if (v instanceof Map) {
      entries = Array.from(v.entries());
      break;
    }
    const o = asRecord(v);
    if (o) {
      entries = Object.entries(o);
      break;
    }
  }

  const out: Partial<Record<SheetDayKey, number>> = {};
  for (const [key, value] of entries) {
    let col: number | null = null;
    if (typeof value === 'number') col = value;
    else {
      const r = asRecord(value);
      if (r) col = numberField(r, ['col0', 'col', 'column0', 'column', 'index']);
    }
    if (col === null) continue;
    const day = SHEET_DAYS.find(d => d.key === key.toLowerCase() || d.header.test(key));
    if (day && col >= 0) out[day.key] = col;
  }
  return out;
}

function layoutTimeCol0(layout: SheetLayout | null | undefined): number | null {
  return numberField(asRecord(layout) ?? {}, [
    'timeColumnIndex',
    'timeCol0',
    'timeColumn0',
    'timeCol',
    'timeColumn',
  ]);
}

/** The layout reports the *presence* of VII's second time column but not its
 *  index, so the index has to come from the header scan. */
function layoutHasFridayTimeColumn(layout: SheetLayout | null | undefined): boolean {
  const rec = asRecord(layout);
  if (!rec) return false;
  if (typeof rec.hasFridayTimeColumn === 'boolean') return rec.hasFridayTimeColumn;
  return numberField(rec, [
    'fridayTimeCol0',
    'fridayTimeColumn0',
    'fridayCol0',
    'fridayTimeCol',
    'fridayTimeColumn',
  ]) !== null;
}

function layoutSnoCol0(layout: SheetLayout | null | undefined): number | null {
  return numberField(asRecord(layout) ?? {}, [
    'snoColumnIndex',
    'snoCol0',
    'snoColumn0',
    'snoCol',
    'snoColumn',
  ]);
}

/**
 * Last-resort header scan. The live header row is
 * `S.no.,Time,[Friday Time,]Monday..Saturday` on every tab, so the columns are
 * always recoverable even if the layout module's field names change.
 */
function scanHeaderRow(grid: string[][]): {
  dayColumns: Partial<Record<SheetDayKey, number>>;
  timeCol0: number;
  fridayTimeCol0: number | null;
  snoCol0: number;
  headerRow1: number;
} | null {
  for (let r = 0; r < Math.min(grid.length, 6); r++) {
    const row = grid[r] ?? [];
    const dayColumns: Partial<Record<SheetDayKey, number>> = {};
    let timeCol0 = -1;
    let fridayTimeCol0: number | null = null;
    let snoCol0 = -1;
    for (let c = 0; c < row.length; c++) {
      const v = (row[c] ?? '').trim();
      if (!v) continue;
      if (/^s\.?\s*no/i.test(v)) snoCol0 = c;
      else if (/^time$/i.test(v)) timeCol0 = c;
      else if (/friday\s*time/i.test(v)) fridayTimeCol0 = c;
      else {
        const day = SHEET_DAYS.find(d => d.header.test(v));
        if (day && dayColumns[day.key] === undefined) dayColumns[day.key] = c;
      }
    }
    if (Object.keys(dayColumns).length > 0 && timeCol0 >= 0) {
      return { dayColumns, timeCol0, fridayTimeCol0, snoCol0: snoCol0 >= 0 ? snoCol0 : 0, headerRow1: r + 1 };
    }
  }
  return null;
}

interface ResolvedLayout {
  periodRows1: number[];
  dayColumns: Partial<Record<SheetDayKey, number>>;
  detectedDays: SheetDayKey[];
  timeCol0: number;
  fridayTimeCol0: number | null;
  snoCol0: number;
  /** What the layout parsed out of the title cell, for cross-checking config. */
  titleClassLabel: string;
  warnings: string[];
}

/** Independent sanity check: a period row has a small integer in S.no. and a
 *  parsable time range. This is what keeps VII's "Break Time 10:50 to 11:20"
 *  footer row (which HAS a time cell but no S.no.) out of the timetable. */
function rowLooksLikePeriod(grid: string[][], row1: number, snoCol0: number, timeCol0: number): boolean {
  const row = grid[row1 - 1] ?? [];
  const sno = (row[snoCol0] ?? '').trim();
  if (!SNO_CELL_RE.test(sno)) return false;
  const n = parseInt(sno, 10);
  if (!(n >= 1 && n <= 12)) return false;
  return splitTimeCell(row[timeCol0] ?? '') !== null;
}

function resolveLayout(grid: string[][]): ResolvedLayout {
  const warnings: string[] = [];
  let layout: SheetLayout | null = null;
  try {
    layout = detectLayout(grid);
  } catch (err) {
    warnings.push(`layout detection threw: ${err instanceof Error ? err.message : String(err)}`);
  }

  const layoutRecord = asRecord(layout);
  if (Array.isArray(layoutRecord?.warnings)) {
    for (const w of layoutRecord.warnings as string[]) warnings.push(`layout: ${w}`);
  }

  let periodRows1 = layoutPeriodRows1(layout);
  const dayColumns = layoutDayColumns(layout);
  const timeCol0 = layoutTimeCol0(layout);
  let fridayTimeCol0 = numberField(layoutRecord ?? {}, [
    'fridayTimeColumnIndex',
    'fridayTimeCol0',
    'fridayTimeColumn0',
    'fridayCol0',
  ]);
  const snoCol0 = layoutSnoCol0(layout);
  const wantsFridayTime = layoutHasFridayTimeColumn(layout);

  // The header scan is the fallback, not the primary: the layout owns the
  // column map. It is needed for the Friday Time index, which the layout
  // reports only as a boolean.
  const scan = scanHeaderRow(grid);

  if (fridayTimeCol0 === null && wantsFridayTime) {
    fridayTimeCol0 = scan?.fridayTimeCol0 ?? null;
    if (fridayTimeCol0 === null) {
      warnings.push('layout reports a Friday Time column but its index could not be located');
    }
  }

  const effectiveTimeCol0 = timeCol0 ?? scan?.timeCol0 ?? 1;
  const effectiveSnoCol0 = snoCol0 ?? scan?.snoCol0 ?? 0;
  if (timeCol0 === null) {
    warnings.push(`time column not reported by the layout; used column ${effectiveTimeCol0} from the header scan`);
  }
  if (snoCol0 === null && scan === null) {
    warnings.push('S.no. column not reported by the layout; assumed column 0');
  }

  // Cross-check the layout against an independent scan. A mismatch means the
  // row numbers a writer would use are not trustworthy, so say so loudly - and
  // prefer the rows this file can actually justify.
  const scanned = grid
    .map((_, i) => i + 1)
    .filter(row1 => rowLooksLikePeriod(grid, row1, effectiveSnoCol0, effectiveTimeCol0));
  if (scanned.length && periodRows1.length && scanned.length !== periodRows1.length) {
    warnings.push(
      `layout detected ${periodRows1.length} period rows but ${scanned.length} rows look like periods (${scanned.join(',')}); using the layout's rows`,
    );
  } else if (scanned.length && !periodRows1.length) {
    warnings.push(
      `layout detected no period rows but ${scanned.length} rows look like periods (${scanned.join(',')}); used those rows instead`,
    );
    periodRows1 = scanned;
  }
  if (!periodRows1.length) warnings.push('no period rows detected');

  const detectedDays = SHEET_DAYS.map(d => d.key).filter(k => dayColumns[k] !== undefined);
  return {
    periodRows1,
    dayColumns,
    detectedDays,
    timeCol0: effectiveTimeCol0,
    fridayTimeCol0: fridayTimeCol0 === null ? null : fridayTimeCol0,
    snoCol0: effectiveSnoCol0,
    titleClassLabel: typeof layoutRecord?.classLabel === 'string' ? (layoutRecord.classLabel as string) : '',
    warnings,
  };
}

/* ── CSV fetch + per-tab cache ───────────────────────────────────── */

interface CacheEntry<T> {
  at: number;
  value: T;
}

const tabGridCache = new Map<number, CacheEntry<string[][]>>();
const tabInFlight = new Map<number, Promise<string[][]>>();
let snapshotCache: CacheEntry<TimetableSheetSnapshot> | null = null;
let snapshotInFlight: Promise<TimetableSheetSnapshot> | null = null;

function isFresh<T>(entry: CacheEntry<T> | null | undefined, now: number): boolean {
  return !!entry && now - entry.at < TIMETABLE_SHEET_CACHE_TTL_MS;
}

/**
 * Fetch one tab's public CSV export and parse it into a grid.
 *
 * Uses the public export URL, so it needs no OAuth and keeps working while the
 * Google token is expired. Throws on a transport/HTTP/HTML error; callers are
 * expected to degrade that tab rather than fail the read.
 */
export async function fetchTimetableTabCsv(
  gid: number,
  opts: FetchTimetableTabOptions = {},
): Promise<string[][]> {
  const now = Date.now();
  if (!opts.forceRefresh && isFresh(tabGridCache.get(gid), now)) {
    return tabGridCache.get(gid)!.value;
  }
  const existing = tabInFlight.get(gid);
  if (!opts.forceRefresh && existing) return existing;

  const url = opts.forceRefresh ? `${timetableCsvUrl(gid)}&t=${now}` : timetableCsvUrl(gid);
  const task = (async (): Promise<string[][]> => {
    const res = await fetch(url, { cache: opts.forceRefresh ? 'no-store' : 'default' });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}${res.statusText ? ` ${res.statusText}` : ''} for timetable tab gid ${gid}`);
    }
    const text = await res.text();
    // Google answers a non-public sheet with an HTML sign-in page (HTTP 200).
    const head = text.slice(0, 200).trimStart().toLowerCase();
    if (head.startsWith('<!doctype html') || head.startsWith('<html')) {
      throw new Error(`timetable tab gid ${gid} returned an HTML page instead of CSV (sheet may not be public)`);
    }
    if (!text.trim()) throw new Error(`timetable tab gid ${gid} returned an empty body`);
    const grid = parseCsvToGrid(text);
    if (!grid.length) throw new Error(`timetable tab gid ${gid} parsed to zero rows`);
    tabGridCache.set(gid, { at: Date.now(), value: grid });
    return grid;
  })();

  tabInFlight.set(gid, task);
  try {
    return await task;
  } finally {
    tabInFlight.delete(gid);
  }
}

/* ── Grid -> TimetableClassEntry ─────────────────────────────────── */

function mapTabToClass(tab: TimetableSheetTab, grid: string[][]): {
  entry: SheetClassEntry | null;
  status: TimetableSheetTabStatus;
} {
  const status: TimetableSheetTabStatus = {
    tab: tab.name,
    classLabel: tab.classLabel,
    teacher: tab.teacher,
    ok: false,
    warnings: [],
    periodCount: 0,
  };

  const layout = resolveLayout(grid);
  status.warnings.push(...layout.warnings);

  // The config is authoritative for the class label and teacher, but a title
  // that no longer matches it means the tab was renamed and the config needs
  // updating - otherwise the diff would silently stop matching the two sides.
  if (layout.titleClassLabel && looseLabel(layout.titleClassLabel) !== looseLabel(tab.classLabel)) {
    status.warnings.push(
      `tab title parses as class ${JSON.stringify(layout.titleClassLabel)} but the config says ${JSON.stringify(tab.classLabel)}`,
    );
  }

  if (!layout.periodRows1.length) {
    status.error = 'no period rows detected in the tab grid';
    return { entry: null, status };
  }

  const missingDays = SHEET_DAYS.map(d => d.key).filter(k => !layout.detectedDays.includes(k));
  if (missingDays.length) {
    status.warnings.push(`layout detected no column for: ${missingDays.join(', ')} (those days are read as empty)`);
  }
  if (layout.fridayTimeCol0 === null) {
    status.warnings.push('no "Friday Time" column; friStart/friEnd stay null for every period');
  }
  if (layout.periodRows1.length !== 7) {
    status.warnings.push(`expected 7 period rows, found ${layout.periodRows1.length}`);
  }

  const periods: SheetPeriod[] = [];
  layout.periodRows1.forEach((row1, index) => {
    const rawTime = readCell(grid, row1, layout.timeCol0);
    const rawFridayTime = layout.fridayTimeCol0 === null ? '' : readCell(grid, row1, layout.fridayTimeCol0);
    const parsed = splitTimeCell(rawTime);

    let no = index + 1;
    const snoText = readCell(grid, row1, layout.snoCol0);
    if (SNO_CELL_RE.test(snoText)) no = parseInt(snoText, 10);

    if (!parsed) {
      status.warnings.push(`row ${row1}: time cell ${JSON.stringify(rawTime)} is not a time range`);
    } else if (!parsed.end) {
      status.warnings.push(`row ${row1}: time cell ${JSON.stringify(rawTime)} has no end time`);
    }
    if (Number.isNaN(sheetTimeToMinutes(parsed?.start ?? ''))) {
      status.warnings.push(`row ${row1}: start time ${JSON.stringify(parsed?.start ?? '')} is not a clock time`);
    }

    const fri = splitTimeCell(rawFridayTime);
    const period: SheetPeriod = {
      no,
      start: parsed?.start ?? '',
      end: parsed?.end ?? '',
      friStart: fri?.start ?? null,
      friEnd: fri?.end ?? null,
      mon: readCell(grid, row1, layout.dayColumns.mon ?? -1),
      tue: readCell(grid, row1, layout.dayColumns.tue ?? -1),
      wed: readCell(grid, row1, layout.dayColumns.wed ?? -1),
      thu: readCell(grid, row1, layout.dayColumns.thu ?? -1),
      fri: readCell(grid, row1, layout.dayColumns.fri ?? -1),
      sat: readCell(grid, row1, layout.dayColumns.sat ?? -1),
      row1,
      rawTime,
      rawFridayTime,
    };
    for (const day of layout.detectedDays) {
      if (/break/i.test(period[day])) {
        status.warnings.push(`row ${row1}: ${day} cell looks like a break, not a subject: ${JSON.stringify(period[day])}`);
      }
    }
    periods.push(period);
  });

  status.periodCount = periods.length;
  status.ok = periods.length > 0;

  const entry: SheetClassEntry = {
    label: tab.classLabel,
    classTeacher: tab.teacher,
    periods,
    tabName: tab.name,
    gid: tab.gid,
    detectedDays: layout.detectedDays,
    hasFridayTimeColumn: layout.fridayTimeCol0 !== null,
  };
  return { entry, status };
}

/* ── Whole-sheet snapshot ────────────────────────────────────────── */

async function buildSnapshot(forceRefresh: boolean): Promise<TimetableSheetSnapshot> {
  const fetchedAt = Date.now();
  const classes: TimetableClassEntry[] = [];
  const perTab: TimetableSheetTabStatus[] = [];

  for (const tab of TIMETABLE_SHEET_TABS) {
    const status: TimetableSheetTabStatus = {
      tab: tab.name,
      classLabel: tab.classLabel,
      teacher: tab.teacher,
      ok: false,
      warnings: [],
      periodCount: 0,
    };
    try {
      const grid = await fetchTimetableTabCsv(tab.gid, { forceRefresh });
      const mapped = mapTabToClass(tab, grid);
      perTab.push(mapped.status);
      if (mapped.entry) classes.push(mapped.entry);
    } catch (err) {
      status.error = err instanceof Error ? err.message : String(err);
      perTab.push(status);
    }
  }

  const snapshot: TimetableSheetSnapshot = { classes, fetchedAt, perTab };
  snapshotCache = { at: Date.now(), value: snapshot };
  return snapshot;
}

/**
 * Read every tab of the timetable sheet. Cached as one snapshot for
 * TIMETABLE_SHEET_CACHE_TTL_MS (and per tab, inside fetchTimetableTabCsv), so
 * switching classes/views costs nothing. `forceRefresh: true` bypasses both.
 *
 * Never throws for a bad tab, and never throws for a bad Google token: the
 * public CSV export needs neither. It only throws if the whole read cannot
 * produce anything, which surfaces as a snapshot with zero classes.
 */
export async function fetchTimetableSheetFromSheet(
  opts: FetchTimetableSheetOptions = {},
): Promise<TimetableSheetSnapshot> {
  const now = Date.now();
  if (!opts.forceRefresh && isFresh(snapshotCache, now)) return snapshotCache!.value;
  if (!opts.forceRefresh && snapshotInFlight) return snapshotInFlight;

  const task = buildSnapshot(!!opts.forceRefresh);
  snapshotInFlight = task;
  try {
    return await task;
  } finally {
    snapshotInFlight = null;
  }
}

/** Drop both caches. A manual Refresh should pass `forceRefresh` instead. */
export function clearTimetableSheetCache(): void {
  snapshotCache = null;
  snapshotInFlight = null;
  tabGridCache.clear();
  tabInFlight.clear();
}

/* ── Diff ────────────────────────────────────────────────────────── */

function looseLabel(label: string): string {
  return normSubject(label).replace(/[^a-z0-9]/g, '');
}

function classLabelKey(label: string): string {
  return normSubject(label);
}

function timePairMinutes(start: string | null, end: string | null): string {
  const s = sheetTimeToMinutes(start ?? '');
  const e = sheetTimeToMinutes(end ?? '');
  return `${Number.isNaN(s) ? 'x' : s}-${Number.isNaN(e) ? 'x' : e}`;
}

/** The matching local period: by S.no. first, then by position, so a sheet
 *  whose S.no. column was renumbered still lines up with the local periods. */
function localPeriodFor(
  local: TimetableClassEntry,
  remotePeriod: TimetablePeriod,
  remoteIndex: number,
): TimetablePeriod | null {
  const byNo = local.periods.find(p => p.no === remotePeriod.no);
  if (byNo) return byNo;
  const byIndex = local.periods[remoteIndex];
  return byIndex && byIndex.no === remotePeriod.no ? byIndex : null;
}

/**
 * Per class, per period, which days actually differ between the local
 * timetable and the sheet. Pure function — no network, no cache.
 *
 * Normalisation: subjects are compared trimmed / space-collapsed / lower-cased;
 * times are compared as minutes-since-midnight, so the local "8:15 AM" and the
 * sheet's "8:15" are the same value and are never reported as a difference.
 * Days whose column the layout did not detect are skipped, and so are Friday
 * times on tabs that have no "Friday Time" column — otherwise every class but
 * VII would report 5 spurious differences.
 */
export function diffTimetableAgainstSheet(
  local: TimetableClassEntry[],
  remote: TimetableClassEntry[],
): TimetableDiffEntry[] {
  const localByKey = new Map<string, TimetableClassEntry>();
  const localByLoose = new Map<string, TimetableClassEntry>();
  for (const c of local) {
    localByKey.set(classLabelKey(c.label), c);
    localByLoose.set(looseLabel(c.label), c);
  }

  const out: TimetableDiffEntry[] = [];

  for (const remoteClass of remote) {
    const sheet = remoteClass as Partial<SheetClassEntry>;
    const tabName = sheet.tabName ?? remoteClass.label;
    const localClass = localByKey.get(classLabelKey(remoteClass.label)) ?? localByLoose.get(looseLabel(remoteClass.label));
    if (!localClass) continue;

    const detectedDays = Array.isArray(sheet.detectedDays) && sheet.detectedDays.length
      ? sheet.detectedDays
      : (SHEET_DAYS.map(d => d.key) as SheetDayKey[]);
    const anyFriday = remoteClass.periods.some(p => !!(p.friStart || p.friEnd));
    const compareFriday = sheet.hasFridayTimeColumn === true || anyFriday;

    for (const [remoteIndex, remotePeriod] of remoteClass.periods.entries()) {
      const localPeriod = localPeriodFor(localClass, remotePeriod, remoteIndex);
      if (!localPeriod) continue;
      const periodNo = remotePeriod.no;

      let timeDiffers = timePairMinutes(localPeriod.start, localPeriod.end) !== timePairMinutes(remotePeriod.start, remotePeriod.end);
      if (
        compareFriday &&
        timePairMinutes(localPeriod.friStart, localPeriod.friEnd) !== timePairMinutes(remotePeriod.friStart, remotePeriod.friEnd)
      ) {
        timeDiffers = true;
      }
      if (timeDiffers) {
        const fmt = (p: TimetablePeriod) =>
          [p.start, p.end].filter(Boolean).join(' to ') + (p.friStart ? ` (Fri ${p.friStart}${p.friEnd ? ` to ${p.friEnd}` : ''})` : '');
        out.push({
          classLabel: remoteClass.label,
          tabName,
          periodNo,
          day: 'time',
          local: fmt(localPeriod),
          remote: fmt(remotePeriod),
        });
      }

      for (const day of detectedDays) {
        const l = normSubject(localPeriod[day]);
        const r = normSubject(remotePeriod[day]);
        if (l === r) continue;
        out.push({
          classLabel: remoteClass.label,
          tabName,
          periodNo,
          day,
          local: (localPeriod[day] ?? '').trim(),
          remote: (remotePeriod[day] ?? '').trim(),
        });
      }
    }
  }

  return out;
}

/* ── Merge over the local / bundled timetable ────────────────────── */

function toClassEntry(c: TimetableClassEntry): TimetableClassEntry {
  return { label: c.label, classTeacher: c.classTeacher, periods: c.periods };
}

/**
 * Overlay the sheet onto the local (or bundled data/timetable.json) timetable.
 *
 * Sheet data wins for the tabs it read successfully. A class the sheet has no
 * tab for is kept from local, and a class whose tab failed is kept from local
 * too — a broken tab must not wipe a class from the app. data/timetable.json is
 * never written; this is a pure function.
 */
export function loadTimetableWithSheetMerge(
  localTimetable: TimetableData,
  snapshot: TimetableSheetSnapshot,
): TimetableSheetMergeResult {
  const localByKey = new Map<string, TimetableClassEntry>();
  for (const c of localTimetable.classes) localByKey.set(classLabelKey(c.label), c);

  const classes: TimetableClassEntry[] = [];
  const fromSheet: string[] = [];
  const keptLocal: string[] = [];
  const present = new Set<string>();
  const usedLocal = new Set<string>();

  // A failed tab contributes no class, so the local class has to be picked up by
  // the second loop below. Recording it here is what lets a caller tell "this
  // class is stale on purpose" apart from "there is no tab for this class".
  const degraded = snapshot.perTab
    .filter(s => !s.ok)
    .map(s => s.classLabel)
    .filter((label, i, all) => all.indexOf(label) === i);

  for (const sheetClass of snapshot.classes) {
    const key = classLabelKey(sheetClass.label);
    const localClass = localByKey.get(key);
    if (localClass) usedLocal.add(key);
    classes.push(toClassEntry(sheetClass));
    present.add(key);
    fromSheet.push(sheetClass.label);
  }

  for (const localClass of localTimetable.classes) {
    const key = classLabelKey(localClass.label);
    if (usedLocal.has(key) || present.has(key)) continue;
    classes.push(toClassEntry(localClass));
    present.add(key);
    keptLocal.push(localClass.label);
  }

  return {
    data: {
      generatedAt: new Date(snapshot.fetchedAt || Date.now()).toISOString(),
      classes,
    },
    fromSheet,
    keptLocal,
    degraded,
  };
}

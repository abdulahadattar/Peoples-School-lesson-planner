import {
  TIMETABLE_SHEET_CACHE_TTL_MS,
  TIMETABLE_SHEET_TABS,
  timetableCsvUrl,
  type TimetableSheetTab,
} from '../timetableSheetConfig';
import { readCell } from '../timetableSheetLayout';
import { parseCsvToGrid } from '../timetableSheetWriter';
import {
  SheetClassEntry,
  SheetPeriod,
  TimetableSheetTabStatus,
  TimetableSheetSnapshot,
  FetchTimetableTabOptions,
  FetchTimetableSheetOptions,
} from './types';
import { SHEET_DAYS, SNO_CELL_RE, splitTimeCell, sheetTimeToMinutes, normSubject } from './timeUtils';
import { resolveLayout } from './layoutResolver';

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

function looseLabel(label: string): string {
  return normSubject(label).replace(/[^a-z0-9]/g, '');
}

export function mapTabToClass(tab: TimetableSheetTab, grid: string[][]): {
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

async function buildSnapshot(forceRefresh: boolean): Promise<TimetableSheetSnapshot> {
  const fetchedAt = Date.now();
  const classes: SheetClassEntry[] = [];
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

export function clearTimetableSheetCache(): void {
  snapshotCache = null;
  snapshotInFlight = null;
  tabGridCache.clear();
  tabInFlight.clear();
}

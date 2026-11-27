import { TIMETABLE_SHEET_TABS } from '../timetableSheetConfig';
import type { TimetableSheetTab } from '../timetableSheetConfig';
import { cellRef, colIndex0, colLetter, detectLayout, readCell } from '../timetableSheetLayout';
import type { SheetDayKey, SheetLayout } from '../timetableSheetLayout';
import { parseTimeToMinutes } from '../timetable';
import type { TimetableClassEntry, TimetablePeriod } from '../timetable';
import {
  TimetableCellWrite,
  TimetableWritePlan,
  PlanTimetableWritesOptions,
  RemoteTimetableSnapshot,
  RemoteGrids,
} from './types';

export function normaliseForCompare(value: string): string {
  return String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function normaliseTimeCell(value: string): string {
  const matches = String(value ?? '').match(/\d{1,2}\s*:\s*\d{2}/g);
  if (!matches || matches.length === 0) return normaliseForCompare(value);
  return matches
    .map((token) => {
      const minutes = parseTimeToMinutes(token.replace(/\s+/g, ''));
      if (Number.isNaN(minutes)) return normaliseForCompare(token);
      const h = Math.floor(minutes / 60) % 24;
      const m = minutes % 60;
      return `${h}:${String(m).padStart(2, '0')}`;
    })
    .join(' to ');
}

function toSheetTimeText(value: string | null | undefined): string {
  const text = String(value ?? '').trim();
  if (!text) return '';
  const bare = text.replace(/\s*(am|pm)$/i, '').trim();
  const m = bare.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return bare;
  return `${parseInt(m[1], 10)}:${m[2]}`;
}

function periodTimeText(period: TimetablePeriod): string {
  return `${toSheetTimeText(period.start)} to ${toSheetTimeText(period.end)}`;
}

function periodFridayTimeText(period: TimetablePeriod): string {
  if (!period.friStart || !period.friEnd) return '';
  return `${toSheetTimeText(period.friStart)} to ${toSheetTimeText(period.friEnd)}`;
}

function periodDayText(period: TimetablePeriod, day: string): string {
  const bag = period as unknown as Record<string, unknown>;
  const raw = bag[day];
  if (typeof raw === 'string') return raw;
  if (raw === null || raw === undefined) return '';
  return String(raw);
}

function isUsableLayout(layout: SheetLayout | null | undefined): layout is SheetLayout {
  if (!layout) return false;
  if (!Array.isArray(layout.periodRows) || layout.periodRows.length === 0) return false;
  if (!layout.columns || typeof layout.columns !== 'object') return false;
  const dayCount = Object.values(layout.columns).filter((v) => typeof v === 'number' && Number.isFinite(v)).length;
  return dayCount > 0;
}

function toGrids(remote: RemoteTimetableSnapshot | RemoteGrids | null | undefined): RemoteGrids {
  if (!remote) return {};
  const maybe = remote as RemoteTimetableSnapshot;
  if (maybe.grids && typeof maybe.grids === 'object') return maybe.grids;
  return remote as RemoteGrids;
}

function findTab(label: string): TimetableSheetTab | undefined {
  const wanted = normaliseForCompare(label);
  return TIMETABLE_SHEET_TABS.find(
    (tab) => normaliseForCompare(tab.name) === wanted || normaliseForCompare(tab.classLabel) === wanted
  );
}

function rowSelfIdentifiesAsPeriod(grid: string[][], row1: number, snoColumnIndex: number): number | null {
  const row = grid[row1 - 1];
  if (!row) return null;
  const limit = Math.min(Math.max(snoColumnIndex, 2), row.length - 1);
  for (let col0 = 0; col0 <= limit; col0++) {
    const text = String(readCell(grid, row1, col0) ?? '').trim();
    if (!/^\d{1,2}$/.test(text)) continue;
    const no = parseInt(text, 10);
    if (no >= 1 && no <= 20) return no;
  }
  return null;
}

function mapPeriodRows(
  grid: string[][],
  layout: SheetLayout,
  periods: TimetablePeriod[]
): { byNo: Map<number, number>; conflicts: string[] } {
  const byNo = new Map<number, number>();
  const conflicts: string[] = [];
  const sno = typeof layout.snoColumnIndex === 'number' ? layout.snoColumnIndex : -1;

  for (const row1 of layout.periodRows) {
    const selfNo = rowSelfIdentifiesAsPeriod(grid, row1, sno);
    if (selfNo === null) {
      conflicts.push(`${row1} is reported as a period row but does not carry a period number, so it was left untouched.`);
      continue;
    }
    const existing = byNo.get(selfNo);
    if (existing !== undefined && existing !== row1) {
      conflicts.push(`Rows ${existing} and ${row1} both claim period ${selfNo}; the duplicate was left untouched.`);
      continue;
    }
    byNo.set(selfNo, row1);
  }

  periods.forEach((period, index) => {
    if (byNo.has(period.no)) return;
    const fallback = layout.periodRows[index];
    if (fallback === undefined) return;
    if (rowSelfIdentifiesAsPeriod(grid, fallback, sno) !== period.no) return;
    byNo.set(period.no, fallback);
  });

  return { byNo, conflicts };
}

function normaliseCol0(a1: string, fallback: number): number {
  const letters = String(a1 ?? '').match(/^\$?([A-Za-z]+)\$?\d+$/);
  if (!letters) return fallback;
  const index = colIndex0(letters[1]);
  return typeof index === 'number' && Number.isFinite(index) && index >= 0 ? index : fallback;
}

export function planTimetableWrites(
  classes: TimetableClassEntry[],
  remote: RemoteTimetableSnapshot | RemoteGrids | null | undefined,
  opts: PlanTimetableWritesOptions = {}
): TimetableWritePlan {
  const allowTimeWrites = opts.allowTimeWrites === true;
  const writeFridayTimeColumn = opts.writeFridayTimeColumn !== false;
  const wantedTabs = opts.tabNames && opts.tabNames.length > 0 ? new Set(opts.tabNames) : null;
  const grids = toGrids(remote);

  const plan: TimetableWritePlan = {
    writes: [],
    timeWrites: [],
    skippedTabs: [],
    unchangedTabs: [],
    totalCellsConsidered: 0,
    guards: {},
  };

  const skip = (tabName: string, classLabel: string, reason: string) => {
    plan.skippedTabs.push({ tabName, classLabel, reason });
  };

  for (const entry of classes ?? []) {
    const label = entry?.label ?? '';
    if (wantedTabs && !wantedTabs.has(label)) continue;

    const tab = findTab(label);
    if (!tab) {
      skip('(none)', label, `No timetable sheet tab is configured for class "${label}", so nothing was written.`);
      continue;
    }

    const grid = grids[tab.name];
    if (!grid || grid.length === 0) {
      skip(tab.name, tab.classLabel, 'No remote grid was supplied for this tab, so its current state is unknown. Refusing to guess a range.');
      continue;
    }

    const layout = detectLayout(grid);
    if (!isUsableLayout(layout)) {
      skip(tab.name, tab.classLabel, 'Layout could not be detected for this tab. Refusing to guess a range; the tab was left untouched.');
      continue;
    }

    const periods = Array.isArray(entry.periods) ? entry.periods : [];
    const headerRow = typeof layout.headerRow === 'number' ? layout.headerRow : -1;
    const breakRows = new Set<number>((layout.breakRows ?? []).filter((r) => typeof r === 'number'));
    const ignoredRows = new Set<number>((layout.ignoredRows ?? []).filter((r) => typeof r === 'number'));
    const periodRowSet = new Set<number>(layout.periodRows.filter((r) => typeof r === 'number'));

    const blockedRows = new Set<number>([1, ...breakRows, ...ignoredRows]);
    if (headerRow > 0) blockedRows.add(headerRow);

    const { byNo, conflicts } = mapPeriodRows(grid, layout, periods);
    const snoColumnIndex = typeof layout.snoColumnIndex === 'number' ? layout.snoColumnIndex : -1;

    const tabWrites: TimetableCellWrite[] = [];
    const tabTimeWrites: TimetableCellWrite[] = [];
    const tabSkips: string[] = [...conflicts];
    const dayColumns: number[] = [];
    const plannedTimeCols: number[] = [];
    const dayKeys = Object.keys(layout.columns).filter((key) => {
      const col = layout.columns[key];
      return typeof col === 'number' && Number.isFinite(col) && col >= 0;
    });

    const assertWritable = (row1: number, col0: number, periodNo: number, day: string): string | null => {
      if (!periodRowSet.has(row1)) return `${colLetter(col0)}${row1} (period ${periodNo}) is not a detected period row. Refused.`;
      if (blockedRows.has(row1)) return `${colLetter(col0)}${row1} (period ${periodNo}) is a protected row. Refused.`;
      if (rowSelfIdentifiesAsPeriod(grid, row1, snoColumnIndex) !== periodNo) {
        return `${colLetter(col0)}${row1} does not identify itself as period ${periodNo}. Refused.`;
      }
      if (day === 'time') {
        if (!plannedTimeCols.includes(col0)) return `${colLetter(col0)}${row1} is not an opted-in time column. Refused.`;
      } else if (!dayColumns.includes(col0)) {
        return `Column ${colLetter(col0)} for ${day} is not a detected day column. Refused.`;
      }
      return null;
    };

    for (const day of dayKeys) {
      const col0 = layout.columns[day];
      if (!dayColumns.includes(col0)) dayColumns.push(col0);
      for (const period of periods) {
        const row1 = byNo.get(period.no);
        if (row1 === undefined) {
          tabSkips.push(`Period ${period.no} has no usable period row on this tab, so it was left untouched.`);
          continue;
        }
        plan.totalCellsConsidered += 1;

        const refusal = assertWritable(row1, col0, period.no, day);
        if (refusal) {
          tabSkips.push(refusal);
          continue;
        }

        const previous = String(readCell(grid, row1, col0) ?? '');
        const value = periodDayText(period, day);
        if (normaliseForCompare(value) === normaliseForCompare(previous)) continue;

        const a1 = cellRef(layout, row1, day as SheetDayKey);
        tabWrites.push({
          tabName: tab.name,
          classLabel: tab.classLabel,
          a1,
          row1,
          col0: normaliseCol0(a1, col0),
          day: day as SheetDayKey,
          periodNo: period.no,
          value,
          previous,
        });
      }
    }

    const timeCol0 = typeof layout.timeColumnIndex === 'number' && layout.timeColumnIndex >= 0 ? layout.timeColumnIndex : -1;
    const timeColumnIsSane = timeCol0 >= 0 && !dayColumns.includes(timeCol0) && timeCol0 !== snoColumnIndex;

    if (timeCol0 >= 0 && !timeColumnIsSane) {
      tabSkips.push(`The detected time column (${colLetter(timeCol0)}) overlaps the S.no. or a day column, so no timing was written.`);
    }

    if (timeCol0 >= 0 && timeColumnIsSane) {
      let timeDiffs = 0;
      for (const period of periods) {
        const row1 = byNo.get(period.no);
        if (row1 === undefined) continue;
        if (!periodRowSet.has(row1) || blockedRows.has(row1)) continue;
        if (rowSelfIdentifiesAsPeriod(grid, row1, snoColumnIndex) !== period.no) continue;

        const desired = periodTimeText(period);
        const previous = String(readCell(grid, row1, timeCol0) ?? '');
        if (normaliseTimeCell(desired) === normaliseTimeCell(previous)) continue;
        timeDiffs += 1;
        plan.totalCellsConsidered += 1;
        if (!allowTimeWrites) continue;
        plannedTimeCols.push(timeCol0);

        tabTimeWrites.push({
          tabName: tab.name,
          classLabel: tab.classLabel,
          a1: `${colLetter(timeCol0)}${row1}`,
          row1,
          col0: timeCol0,
          day: 'time',
          periodNo: period.no,
          value: desired,
          previous,
        });
      }

      const friCol0 = timeCol0 + 1;
      const friHeader = headerRow > 0 ? String(readCell(grid, headerRow, friCol0) ?? '').trim() : '';
      if (writeFridayTimeColumn && layout.hasFridayTimeColumn && normaliseForCompare(friHeader) === 'friday time') {
        for (const period of periods) {
          const row1 = byNo.get(period.no);
          if (row1 === undefined) continue;
          if (!periodRowSet.has(row1) || blockedRows.has(row1)) continue;
          if (rowSelfIdentifiesAsPeriod(grid, row1, snoColumnIndex) !== period.no) continue;
          const desired = periodFridayTimeText(period);
          const previous = String(readCell(grid, row1, friCol0) ?? '');
          if (!desired || normaliseTimeCell(desired) === normaliseTimeCell(previous)) continue;
          timeDiffs += 1;
          plan.totalCellsConsidered += 1;
          if (!allowTimeWrites) continue;
          plannedTimeCols.push(friCol0);
          tabTimeWrites.push({
            tabName: tab.name,
            classLabel: tab.classLabel,
            a1: `${colLetter(friCol0)}${row1}`,
            row1,
            col0: friCol0,
            day: 'time',
            periodNo: period.no,
            value: desired,
            previous,
          });
        }
      } else if (layout.hasFridayTimeColumn && writeFridayTimeColumn) {
        tabSkips.push('Tab declares a Friday Time column but no such header was found next to Time; its Friday timings were left untouched.');
      }

      if (timeDiffs > 0 && !allowTimeWrites) {
        tabSkips.push(`${timeDiffs} time cell(s) differ from the app. Timings are not written unless the caller passes allowTimeWrites: true.`);
      }
    }

    for (const reason of tabSkips) skip(tab.name, tab.classLabel, reason);

    plan.writes.push(...tabWrites);
    plan.timeWrites.push(...tabTimeWrites);
    if (tabWrites.length === 0 && tabTimeWrites.length === 0 && tabSkips.length === 0) {
      plan.unchangedTabs.push(tab.name);
    }
    plan.guards[tab.name] = {
      tabName: tab.name,
      periodRows: [...periodRowSet],
      forbiddenRows: [...blockedRows],
      dayColumns: [...dayColumns],
      timeColumns: [...new Set(plannedTimeCols)],
    };
  }

  return plan;
}

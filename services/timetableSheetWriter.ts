/**
 * timetableSheetWriter.ts — WRITE PATH (app -> Google Sheet) for the timetable.
 *
 * The timetable sheet is a hand-maintained *display* grid, so the write path is
 * deliberately paranoid: it never assumes a range, it never touches anything
 * except a detected day cell on a detected period row, and it sends
 * value-only requests so Google cannot reformat the sheet behind the
 * principal's back.
 *
 * The three layers, in the order the UI should call them:
 *
 *   1. planTimetableWrites(classes, remote)   PURE. No network, no token, no
 *                                             side effects. Returns the minimal
 *                                             set of cell writes by diffing the
 *                                             desired classes against the
 *                                             last-read grids. A no-op sync
 *                                             returns zero writes.
 *   2. applyTimetableWrites(plan, token)     Executes a plan. Value-only,
 *                                             valueInputOption=RAW, one
 *                                             request per contiguous run of
 *                                             same-row cells, per-tab error
 *                                             isolation.
 *   3. syncTimetableToSheet(classes, opts)    Read -> plan -> apply, with
 *                                             `dryRun` (the default) stopping
 *                                             after planning so the UI can
 *                                             preview changes.
 *
 * Grid convention: a grid is `string[][]` indexed by SHEET row and column,
 * i.e. `grid[row1 - 1][col0]`, with blank rows preserved as empty arrays
 * filled with ''. Never compact the rows — the trailing rows of these tabs
 * (break block, "Friday Schedule:" footnote, teacher reference table) are
 * exactly the rows that must never be written, and compacting them would shift
 * every row number above them.
 */

import { TIMETABLE_SHEET_ID, TIMETABLE_SHEET_TABS, timetableCsvUrl } from './timetableSheetConfig';
import type { TimetableSheetTab } from './timetableSheetConfig';
import { cellRef, colIndex0, colLetter, detectLayout, readCell } from './timetableSheetLayout';
import type { SheetDayKey, SheetLayout } from './timetableSheetLayout';
import { parseTimeToMinutes } from './timetable';
import type { TimetableClassEntry, TimetablePeriod } from './timetable';

const SHEETS_VALUES_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

/** One cell the planner decided must change to reach the desired state. */
export interface TimetableCellWrite {
  /** Sheet tab name, exactly as configured. */
  tabName: string;
  /** Class label as written on the tab, e.g. "VII". */
  classLabel: string;
  /** A1 of the target cell, e.g. "D4". No sheet prefix. */
  a1: string;
  /** 1-based sheet row. */
  row1: number;
  /** 0-based sheet column. */
  col0: number;
  /** Detected day column, or 'time' for the Time / Friday Time columns. */
  day: SheetDayKey | 'time';
  /** App period number (1-based, matches the S.no. column where present). */
  periodNo: number;
  /** Desired text. '' means clear the cell. */
  value: string;
  /** Current sheet text, for the UI diff preview. */
  previous: string;
}

/** A tab (or a single candidate cell on a tab) that was refused, and why. */
export interface TimetableTabSkip {
  tabName: string;
  classLabel: string;
  reason: string;
}

/**
 * Per-tab safety envelope captured at plan time and re-checked at apply time, so
 * a plan that was built against one layout can never be replayed against a
 * sheet that has since been reshaped.
 */
export interface TimetableTabGuard {
  tabName: string;
  /** The only rows that may be written. */
  periodRows: number[];
  /** Title row, header row, break rows and ignored rows: never writable. */
  forbiddenRows: number[];
  /** The only day columns that may be written. */
  dayColumns: number[];
  /** Columns writable only because the caller opted into time writes. */
  timeColumns: number[];
}

export interface TimetableWritePlan {
  /** Subject/day cells that must change. */
  writes: TimetableCellWrite[];
  /** Time-column cells that must change. Populated ONLY when opted in. */
  timeWrites: TimetableCellWrite[];
  /** Tabs (or cells) that were refused. Never silently dropped. */
  skippedTabs: TimetableTabSkip[];
  /** Tabs verified to already match, with no skips. */
  unchangedTabs: string[];
  /** Candidate cells examined, for the UI's "checked N cells" copy. */
  totalCellsConsidered: number;
  /** Safety envelopes for applyTimetableWrites. */
  guards: Record<string, TimetableTabGuard>;
}

export interface PlanTimetableWritesOptions {
  /**
   * Off by default. Timings live in the Time column, which is otherwise
   * forbidden, and the sheet's "Friday Schedule:" footnote deliberately
   * contradicts the grid timings. So an ordinary subject sync can never alter a
   * single time; changing a time is a separate, explicit action.
   */
  allowTimeWrites?: boolean;
  /** Restrict the plan to these tab names. */
  tabNames?: string[];
  /** Also write the VII "Friday Time" column when the layout confirms it. Default true. */
  writeFridayTimeColumn?: boolean;
}

/** Last-read state of every tab: tab name -> row/column preserved grid. */
export interface RemoteTimetableSnapshot {
  grids: Record<string, string[][]>;
  readAt?: number;
}

export type RemoteGrids = Record<string, string[][]>;

// ---------------------------------------------------------------------------
// CSV reading
// ---------------------------------------------------------------------------

/**
 * Row-preserving CSV parse.
 *
 * Deliberately NOT services/googleSheetsService.parseCSV: that helper drops
 * fully blank rows and compacts the array, which silently renumbers every row
 * below the blank one. These tabs all have a blank separator row in the middle
 * (and VII has blank rows between the break block and the footnote), so a
 * compacted grid would make row 15 look like row 13 and a write would land on
 * the wrong line. Cell text is kept exactly as exported — trailing spaces are
 * part of the hand-maintained content and are only stripped later, by the
 * comparison normaliser, never by the reader.
 */
export function parseCsvToGrid(text: string): string[][] {
  const raw = text.replace(/^\uFEFF/, '').split(/\r\n|\n|\r/);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  let sawCell = false;

  const endCell = () => {
    row.push(cell);
    cell = '';
    sawCell = true;
  };
  const endRow = () => {
    endCell();
    rows.push(row);
    row = [];
    sawCell = false;
  };

  for (let i = 0; i < raw.length; i++) {
    const line = raw[i];
    let index = 0;
    while (index < line.length) {
      const ch = line[index];
      if (ch === '"') {
        if (inQuotes && line[index + 1] === '"') {
          cell += '"';
          index += 2;
          continue;
        }
        inQuotes = !inQuotes;
        index += 1;
        continue;
      }
      if (ch === ',' && !inQuotes) {
        endCell();
        index += 1;
        continue;
      }
      cell += ch;
      index += 1;
    }
    if (inQuotes) {
      // Multi-line quoted cell: the newline is part of the value.
      cell += '\n';
      continue;
    }
    // A trailing newline produces a final empty record; only emit it when the
    // export actually had content there, so row counts stay honest.
    if (i < raw.length - 1 || line.length > 0) {
      endRow();
    }
  }
  if (cell.length > 0 || sawCell || row.length > 0) {
    endRow();
  }

  let width = 0;
  for (const r of rows) if (r.length > width) width = r.length;
  return rows.map((r) => {
    const padded = r.slice();
    while (padded.length < width) padded.push('');
    return padded;
  });
}

/** Raw cell read, used only where the layout module's reader is not enough. */
function gridAt(grid: string[][], row1: number, col0: number): string {
  const row = grid[row1 - 1];
  if (!row) return '';
  const value = row[col0];
  return typeof value === 'string' ? value : '';
}

// ---------------------------------------------------------------------------
// Normalisation (diff only — never applied to what the sheet holds)
// ---------------------------------------------------------------------------

/**
 * Comparison form of a cell. The sheet is hand-maintained, so it carries
 * trailing spaces ("Sindhi "), double spaces and inconsistent capitalisation
 * ("sci" vs "Sci"). Comparing raw text would make every sync rewrite the whole
 * sheet with no visible change; comparing the normalised form means a
 * no-op sync touches zero cells, which is the whole point of the feature.
 * What gets *written* is always the app's text, untouched.
 */
export function normaliseForCompare(value: string): string {
  return String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Canonical form of a Time cell so "8:15 to 8:50", "08:15 to 08:50" and
 * "8:15 AM to 8:50 AM" all compare equal. The sheet writes 24h for the morning
 * and 12h-without-meridiem for the afternoon ("12:40 to 1:20"), so string
 * equality would never hold.
 */
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

/** "8:15 AM" -> "8:15", matching how the sheet prints its Time column. */
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

/** Subject text for a day, tolerant of a 'mon' vs 'Monday' day key. */
function periodDayText(period: TimetablePeriod, day: string): string {
  const bag = period as unknown as Record<string, unknown>;
  const raw = bag[day];
  if (typeof raw === 'string') return raw;
  if (raw === null || raw === undefined) return '';
  return String(raw);
}

// ---------------------------------------------------------------------------
// Planning
// ---------------------------------------------------------------------------

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

/**
 * The period number a row claims for ITSELF, read from the row's own content
 * rather than from the detector.
 *
 * Every period row of every tab starts with its period number in the first
 * three columns ("1", "2", ... "7"). Nothing else on these tabs does: the
 * Break-Time layout row starts with "Break-Time 10:50 to 11:20", the Friday
 * Schedule footnote with "Friday Schedule: ...", VII's break sub-block with an
 * empty S.no. cell, and VII's teacher reference table with a blank first cell.
 * A Time cell such as "8:15 to 8:50" is not a bare integer, so it cannot be
 * mistaken for a period number.
 *
 * This makes the write path independent of the detector's row numbering. If
 * detectLayout ever reports the wrong period rows, the planner loses the
 * affected writes and says so in skippedTabs - it cannot write a subject over
 * the Break-Time row.
 */
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

/**
 * Maps app period numbers onto sheet rows, and only onto rows that agree.
 *
 * A row is a candidate only when BOTH the detector calls it a period row AND
 * the row's own content claims the same period number. Positional fallback is
 * used only for a period no other row claimed, and only when the content agrees
 * as well, so a shifted or partial layout degrades to "no write" rather than to
 * a write in the wrong place.
 */
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
      conflicts.push(
        `${row1} is reported as a period row but does not carry a period number, so it was left untouched.`
      );
      continue;
    }
    const existing = byNo.get(selfNo);
    if (existing !== undefined && existing !== row1) {
      conflicts.push(
        `Rows ${existing} and ${row1} both claim period ${selfNo}; the duplicate was left untouched.`
      );
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

/**
 * PURE planner. No network, no token, no storage, no side effects.
 *
 * Returns the minimal set of cell writes needed to make the sheet match
 * `classes`. A cell is written only when all of the following hold:
 *   - the layout for its tab was detected (otherwise the tab is skipped),
 *   - its row is one of layout.periodRows,
 *   - its row is not the title row, the header row, a break row or an ignored
 *     row,
 *   - its column is a detected day column (or the time column, and only when
 *     allowTimeWrites is set),
 *   - and the normalised desired text differs from the current sheet text.
 */
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
      skip(
        tab.name,
        tab.classLabel,
        'No remote grid was supplied for this tab, so its current state is unknown. Refusing to guess a range.'
      );
      continue;
    }

    const layout = detectLayout(grid);
    if (!isUsableLayout(layout)) {
      skip(
        tab.name,
        tab.classLabel,
        'Layout could not be detected for this tab. Refusing to guess a range; the tab was left untouched.'
      );
      continue;
    }

    const periods = Array.isArray(entry.periods) ? entry.periods : [];
    const headerRow = typeof layout.headerRow === 'number' ? layout.headerRow : -1;
    const breakRows = new Set<number>((layout.breakRows ?? []).filter((r) => typeof r === 'number'));
    const ignoredRows = new Set<number>((layout.ignoredRows ?? []).filter((r) => typeof r === 'number'));
    const periodRowSet = new Set<number>(layout.periodRows.filter((r) => typeof r === 'number'));

    // Hard, non-negotiable blocked rows. The title row is blocked even if a
    // detector ever mis-reports it as a period row.
    const blockedRows = new Set<number>([1, ...breakRows, ...ignoredRows]);
    if (headerRow > 0) blockedRows.add(headerRow);

    const { byNo, conflicts } = mapPeriodRows(grid, layout, periods);
    const snoColumnIndex = typeof layout.snoColumnIndex === 'number' ? layout.snoColumnIndex : -1;

    const tabWrites: TimetableCellWrite[] = [];
    const tabTimeWrites: TimetableCellWrite[] = [];
    const tabSkips: string[] = [...conflicts];
    const dayColumns: number[] = [];
    // The time columns this plan is actually allowed to touch: empty unless the
    // caller opted in AND a difference was found, so a hand-edited plan cannot
    // smuggle a time write past apply's guard.
    const plannedTimeCols: number[] = [];
    const dayKeys = Object.keys(layout.columns).filter((key) => {
      const col = layout.columns[key];
      return typeof col === 'number' && Number.isFinite(col) && col >= 0;
    });

    /** Every write must clear all four assertions; returns the refusal or null. */
    const assertWritable = (row1: number, col0: number, periodNo: number, day: string): string | null => {
      // 1. the row must be a detected period row
      if (!periodRowSet.has(row1)) return `${colLetter(col0)}${row1} (period ${periodNo}) is not a detected period row. Refused.`;
      // 2. the row must not be the title, header, a break row or an ignored row
      if (blockedRows.has(row1)) return `${colLetter(col0)}${row1} (period ${periodNo}) is a protected row. Refused.`;
      // 3. the row must claim that same period number in its own content, so a
      //    shifted layout can never move a write onto a neighbouring row
      if (rowSelfIdentifiesAsPeriod(grid, row1, snoColumnIndex) !== periodNo) {
        return `${colLetter(col0)}${row1} does not identify itself as period ${periodNo}. Refused.`;
      }
      // 4. the column must be a detected day column (or an opted-in time column)
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

    // ---- Time column: opt-in only -----------------------------------------
    const timeCol0 =
      typeof layout.timeColumnIndex === 'number' && layout.timeColumnIndex >= 0 ? layout.timeColumnIndex : -1;
    // A detector that could not find a "Time" header guesses a column. That guess
    // may well be the S.no. column or a day column, so a guessed time column is
    // never written - timings stay put rather than land on the wrong column.
    const timeColumnIsSane =
      timeCol0 >= 0 && !dayColumns.includes(timeCol0) && timeCol0 !== snoColumnIndex;

    if (timeCol0 >= 0 && !timeColumnIsSane) {
      tabSkips.push(
        `The detected time column (${colLetter(timeCol0)}) overlaps the S.no. or a day column, so no timing was written.`
      );
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

      // VII carries a second timing column ("Friday Time"). Only touch it when
      // the header cell literally says so — never assume it sits at +1.
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
        tabSkips.push(
          `Tab declares a Friday Time column but no such header was found next to Time; its Friday timings were left untouched.`
        );
      }

      if (timeDiffs > 0 && !allowTimeWrites) {
        tabSkips.push(
          `${timeDiffs} time cell(s) differ from the app. Timings are not written unless the caller passes allowTimeWrites: true.`
        );
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

/**
 * Column index for a write, taken from the layout's own A1 so the 0-based
 * index and the A1 can never disagree. cellRef()/colIndex0() are a matched pair
 * in services/timetableSheetLayout.ts, so this is the authoritative answer
 * regardless of which base the detector stored in layout.columns.
 */
function normaliseCol0(a1: string, fallback: number): number {
  const letters = String(a1 ?? '').match(/^\$?([A-Za-z]+)\$?\d+$/);
  if (!letters) return fallback;
  const index = colIndex0(letters[1]);
  return typeof index === 'number' && Number.isFinite(index) && index >= 0 ? index : fallback;
}

// ---------------------------------------------------------------------------
// Applying
// ---------------------------------------------------------------------------

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

/**
 * Groups cell writes into the fewest possible requests: one request per
 * contiguous run of cells on the same row of the same tab. A day column is
 * usually a single cell, so this is usually one request per cell; a full row
 * resync collapses to one request per row.
 */
export function groupWritesIntoRanges(writes: TimetableCellWrite[]): TimetableCellRange[] {
  const byTab = new Map<string, Map<number, TimetableCellWrite[]>>();
  for (const write of writes) {
    let rows = byTab.get(write.tabName);
    if (!rows) {
      rows = new Map<number, TimetableCellWrite[]>();
      byTab.set(write.tabName, rows);
    }
    const rowCells = rows.get(write.row1) ?? [];
    rowCells.push(write);
    rows.set(write.row1, rowCells);
  }

  const ranges: TimetableCellRange[] = [];
  for (const [tabName, rows] of byTab) {
    for (const row1 of [...rows.keys()].sort((a, b) => a - b)) {
      const cells = [...(rows.get(row1) ?? [])].sort((a, b) => a.col0 - b.col0);
      let run: TimetableCellWrite[] = [];
      const flush = () => {
        if (run.length === 0) return;
        const first = run[0];
        const last = run[run.length - 1];
        const start = first.a1.replace(/\d+$/, '');
        const range =
          run.length === 1 && start === last.a1.replace(/\d+$/, '')
            ? `'${escapeTabName(tabName)}'!${first.a1}`
            : `'${escapeTabName(tabName)}'!${start}${row1}:${last.a1.replace(/\d+$/, '')}${row1}`;
        ranges.push({ range, values: [run.map((c) => c.value)], cells: run.length });
        run = [];
      };
      for (const cell of cells) {
        if (run.length > 0 && cell.col0 !== run[run.length - 1].col0 + 1) flush();
        run.push(cell);
      }
      flush();
    }
  }
  return ranges;
}

function escapeTabName(name: string): string {
  return String(name ?? '').replace(/'/g, "''");
}

/**
 * Re-checks a plan against the safety envelope it was built with. A tab with a
 * single violation is rejected wholesale: a half-applied tab is worse than an
 * untouched one, and an operator would have no way to know which half landed.
 */
function verifyTabAgainstGuard(
  tabName: string,
  writes: TimetableCellWrite[],
  guard: TimetableTabGuard | undefined
): string | null {
  if (!guard) return `No safety envelope was recorded for tab "${tabName}"; refusing to write.`;
  const periodRows = new Set(guard.periodRows);
  const forbidden = new Set(guard.forbiddenRows);
  const dayCols = new Set(guard.dayColumns);
  const timeCols = new Set(guard.timeColumns);
  for (const write of writes) {
    if (!periodRows.has(write.row1)) return `${write.a1} is not a period row of the plan's layout.`;
    if (forbidden.has(write.row1)) return `${write.a1} is a protected row (title/header/break/ignored).`;
    if (write.day === 'time') {
      if (timeCols.size === 0) return `${write.a1} is a time cell but the plan was not opted into time writes.`;
      if (!timeCols.has(write.col0)) return `${write.a1} is not a writable time column of the plan's layout.`;
    } else if (!dayCols.has(write.col0)) {
      return `${write.a1} is not a detected day column of the plan's layout.`;
    }
  }
  return null;
}

export interface ApplyTimetableWritesOptions {
  /** Injectable for tests. Defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

/**
 * Executes a plan against Google Sheets.
 *
 * Why values.update with valueInputOption=RAW and nothing else:
 *   - RAW stores the text exactly as given. USER_ENTERED would re-parse it:
 *     "8:15" becomes a time serial and "1-1" becomes a date, which then
 *     *displays* as a different string and shifts the whole grid out of
 *     alignment. USER_ENTERED is only safe when every value is already a
 *     number, which is never true here.
 *   - values.update writes userEnteredValue only. It never sends
 *     userEnteredFormat, and it never touches format, merge, dimension,
 *     rowMetadata or columnProperties, so fonts, colours, borders, merges,
 *     column widths and alignment survive untouched. A batchUpdate with
 *     updateCells requests would work too, but the values API is what the rest
 *     of this codebase already uses, and it has no field that can express a
 *     format change.
 *   - Clears are sent as a RAW empty string in the same values.update request
 *     (see applyTimetableWrites). values.batchClear was rejected as the
 *     mechanism because it is a separate request shape that cannot be merged
 *     with the value writes, and its clearing behaviour is not guaranteed to be
 *     confined to the cell's value, whereas a RAW "" write is a pure
 *     userEnteredValue assignment.
 *
 * The /api/sheets/update server proxy is deliberately NOT used as a fallback
 * here: services/app.ts builds that route as
 * `'${sheetTitle}'!${startColumn}${rowNumber}:AO${rowNumber}` with
 * valueInputOption=USER_ENTERED, so proxying a single timetable cell would both
 * re-parse the text and overwrite every column up to AO of that row. A failed
 * timetable write is reported, not retried through a route that would wreck
 * the sheet.
 */
export async function applyTimetableWrites(
  plan: TimetableWritePlan,
  accessToken: string,
  options: ApplyTimetableWritesOptions = {}
): Promise<TimetableApplyResult> {
  const doFetch = options.fetchImpl ?? fetch;
  const result: TimetableApplyResult = {
    ok: true,
    needsReconnect: false,
    tabsWritten: [],
    cellsWritten: 0,
    skipped: [...(plan?.skippedTabs ?? [])],
    errors: [],
    perTab: [],
  };

  if (!accessToken) {
    return { ...result, ok: false, needsReconnect: true };
  }
  if (!plan) {
    return { ...result, ok: false, errors: [{ tabName: '(none)', range: '', message: 'No plan was supplied.' }] };
  }

  const allWrites = [...(plan.writes ?? []), ...(plan.timeWrites ?? [])];
  if (allWrites.length === 0) {
    return result;
  }

  const classLabelByTab = new Map<string, string>();
  for (const write of allWrites) if (!classLabelByTab.has(write.tabName)) classLabelByTab.set(write.tabName, write.classLabel);

  const writesByTab = new Map<string, TimetableCellWrite[]>();
  for (const write of allWrites) {
    const list = writesByTab.get(write.tabName) ?? [];
    list.push(write);
    writesByTab.set(write.tabName, list);
  }

  // Set once a write fails for a reason every remaining write would fail for
  // too. Google allows 60 write requests per user per minute; pushing the rest
  // of a plan through a revoked token spends that budget on requests that cannot
  // succeed, and turns one sign-in problem into twenty reported write errors.
  let haltForReconnect = false;

  for (const [tabName, writes] of writesByTab) {
    if (haltForReconnect) break;
    const classLabel = classLabelByTab.get(tabName) ?? tabName;
    const guardProblem = verifyTabAgainstGuard(tabName, writes, plan.guards?.[tabName]);
    if (guardProblem) {
      const message = `Tab "${tabName}" rejected before writing: ${guardProblem}`;
      result.ok = false;
      result.errors.push({ tabName, range: '', message });
      result.perTab.push({ tabName, classLabel, ok: false, cellsWritten: 0, ranges: [], error: message });
      continue;
    }

    const tabResult: TimetableTabResult = { tabName, classLabel, ok: true, cellsWritten: 0, ranges: [] };
    const ranges = groupWritesIntoRanges(writes);

    /** Records a failed range and promotes the message to whatever the shared
     *  classifier can say about it, which is usually more useful than Google's.
     *
     *  The status code is prefixed deliberately. The classifier keys on it, and
     *  Google's own body text is not enough: a 401 whose body says only
     *  "Unauthorized" matches none of its phrases, so without the number here a
     *  dead token reads as an unknown write error and is never retried
     *  correctly. */
    const reportFailure = async (rangeLabel: string, raw: string) => {
      const message = `Sheet write failed for ${rangeLabel}: ${raw}`;
      const classified = await classifyWriteError(message);
      const shown = classified.kind === 'unknown' ? message : classified.message;
      tabResult.ok = false;
      tabResult.error = shown;
      result.ok = false;
      result.errors.push({ tabName, range: rangeLabel, message: shown });
      return classified.kind;
    };

    for (const range of ranges) {
      const url = `${SHEETS_VALUES_BASE}/${TIMETABLE_SHEET_ID}/values/${encodeURIComponent(range.range)}?valueInputOption=RAW`;
      try {
        const response = await doFetch(url, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ range: range.range, majorDimension: 'ROWS', values: range.values }),
        });
        if (!response.ok) {
          const text = await safeText(response);
          const kind = await reportFailure(
            range.range,
            `HTTP ${response.status}${text ? `: ${text}` : ''}`,
          );
          if (kind === 'auth' || kind === 'scope') {
            result.needsReconnect = true;
            haltForReconnect = true;
            break;
          }
          continue;
        }
        tabResult.ranges.push(range.range);
        tabResult.cellsWritten += range.cells;
      } catch (err) {
        await reportFailure(range.range, (err as Error)?.message ?? String(err));
      }
    }
    if (tabResult.ok && tabResult.cellsWritten > 0) {
      result.tabsWritten.push(tabName);
      result.cellsWritten += tabResult.cellsWritten;
    }
    result.perTab.push(tabResult);
  }

  return result;
}

async function safeText(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 400);
  } catch {
    return '';
  }
}

/**
 * Routes a write failure through the classifier the register and attendance
 * paths already use, so a dead token is reported as a sign-in problem rather
 * than as an opaque write error.
 *
 * Imported lazily for the same reason googleAuth is: it keeps this module
 * importable from a plain Node/test context that has no browser storage behind
 * it. Falling back to 'unknown' is always safe - it means "no special handling".
 */
async function classifyWriteError(message: string): Promise<{ kind: string; message: string }> {
  try {
    const { classifySheetsWriteError } = await import('./googleSheetsService');
    return classifySheetsWriteError(message);
  } catch {
    return { kind: 'unknown', message };
  }
}

// ---------------------------------------------------------------------------
// Convenience wrapper
// ---------------------------------------------------------------------------

export interface SyncTimetableOptions extends PlanTimetableWritesOptions {
  /** Preview only: read + plan, no write. DEFAULT true. */
  dryRun?: boolean;
  /** Supply a token explicitly (tests, or a caller that already has one). */
  accessToken?: string;
  /** Injectable for tests. Defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Append a cache-busting param to the CSV read so a post-write read is fresh. Default true. */
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
  /** The plan behind this report, for a diff preview in the UI. */
  plan: TimetableWritePlan;
}

/** Reads every configured tab's CSV export. Public export, so it needs no token. */
export async function fetchTimetableGrids(
  tabs: TimetableSheetTab[] = TIMETABLE_SHEET_TABS,
  options: { fetchImpl?: typeof fetch; cacheBust?: boolean } = {}
): Promise<RemoteTimetableSnapshot> {
  const doFetch = options.fetchImpl ?? fetch;
  const grids: RemoteGrids = {};
  const errors: string[] = [];
  for (const tab of tabs) {
    const url = options.cacheBust === false ? timetableCsvUrl(tab.gid) : `${timetableCsvUrl(tab.gid)}&_=${Date.now()}`;
    try {
      const response = await doFetch(url, { redirect: 'follow' });
      if (!response.ok) {
        errors.push(`${tab.name}: HTTP ${response.status}`);
        continue;
      }
      grids[tab.name] = parseCsvToGrid(await response.text());
    } catch (err) {
      errors.push(`${tab.name}: ${(err as Error)?.message ?? String(err)}`);
    }
  }
  return { grids, readAt: Date.now(), ...(errors.length ? { errors } : {}) } as RemoteTimetableSnapshot;
}

/**
 * Read -> plan -> apply, with `dryRun` (the default) stopping after planning.
 *
 * dryRun deliberately does NOT require a Google token: the plan is built from
 * the public CSV export plus pure logic, so the UI can preview a sync for a
 * signed-out user. Only the apply step needs a token, and a missing/expired
 * token there returns needsReconnect and writes nothing at all.
 */
export async function syncTimetableToSheet(
  classes: TimetableClassEntry[],
  options: SyncTimetableOptions = {}
): Promise<SyncTimetableReport> {
  const dryRun = options.dryRun !== false;
  const doFetch = options.fetchImpl ?? fetch;
  const tabs = TIMETABLE_SHEET_TABS.filter((tab) => !options.tabNames || options.tabNames.includes(tab.name));

  const remote = await fetchTimetableGrids(tabs, { fetchImpl: doFetch, cacheBust: options.cacheBust });
  const plan = planTimetableWrites(classes, remote, options);
  const readErrors = ((remote as unknown as { errors?: string[] }).errors ?? []).map((message) => ({
    tabName: '(read)',
    range: '',
    message,
  }));

  const base: SyncTimetableReport = {
    ok: readErrors.length === 0,
    dryRun,
    needsReconnect: false,
    tabsWritten: [],
    cellsWritten: 0,
    unchangedTabs: plan.unchangedTabs,
    skipped: plan.skippedTabs,
    errors: readErrors,
    perTab: [],
    plan,
  };

  if (dryRun) {
    return base;
  }

  let token = options.accessToken ?? null;
  if (!token) {
    // Imported lazily so the pure planner and the executor stay usable in a
    // plain Node/test context with no Firebase in the module graph.
    const { getAccessToken, isGoogleTokenExpired } = await import('./googleAuth');
    if (isGoogleTokenExpired()) {
      return { ...base, ok: false, needsReconnect: true };
    }
    token = await getAccessToken();
  }
  if (!token) {
    return { ...base, ok: false, needsReconnect: true };
  }

  const applied = await applyTimetableWrites(plan, token, { fetchImpl: doFetch });
  return {
    ok: applied.ok,
    dryRun: false,
    needsReconnect: applied.needsReconnect,
    tabsWritten: applied.tabsWritten,
    cellsWritten: applied.cellsWritten,
    unchangedTabs: plan.unchangedTabs,
    skipped: applied.skipped,
    errors: [...readErrors, ...applied.errors],
    perTab: applied.perTab,
    plan,
  };
}

/**
 * Timetable sheet layout detector.
 *
 * The timetable is a hand-maintained *display* grid, so nothing about it can be
 * assumed: the header row moves, tab VII carries an extra "Friday Time" column,
 * tab XII has no `S.no.` header at all, and every tab ends with a free-text
 * "Friday Schedule:" footnote whose timings CONTRADICT the grid above it, plus
 * (on VII) a subject->teacher reference table.
 *
 * This module turns a parsed CSV grid (`string[][]`, 0-based) into a description
 * of where the header, the period rows, the day columns and the never-write
 * rows live. It is deliberately pure and dependency free: no network, no React,
 * no Google APIs, so it can be unit tested against live CSVs and reused by the
 * reader and the writer without either of them re-deriving the layout.
 *
 * Verified live layout (after RFC4180 parsing, 12 tabs):
 *   row 1      title, often a two-line cell ("Time Table IV-A\nMiss Daniya")
 *   row 2      header: S.no | Time | Monday..Saturday  (VII adds "Friday Time")
 *   rows 3-6   periods 1-4
 *   row 7      "Break-Time 10:50 to 11:20"  (layout row, not a period)
 *   rows 8-10  periods 5-7
 *   row 11+    blank, the "Friday Schedule:" footnote, (VII) teacher table
 *
 * Everything the detector reports in `ignoredRows` must never be written to.
 */

export type SheetDayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat';

export interface SheetLayout {
  /** Parsed from the title, e.g. "IV-A". */
  classLabel: string;
  /** Parsed from the title, e.g. "Miss Daniya". */
  teacher: string;
  /** Raw title cell, newlines included. */
  title: string;
  /** 1-based sheet row of the header. 0 when no header was found. */
  headerRow: number;
  /** 1-based sheet row of the first period. 0 when there are no periods. */
  firstPeriodRow: number;
  /** 1-based sheet row of the last period. 0 when there are no periods. */
  lastPeriodRow: number;
  /** 0-based column of the time-of-day cell. */
  timeColumnIndex: number;
  /** 0-based column of the S.no cell, null when that header is blank/absent. */
  snoColumnIndex: number | null;
  /** Day -> 0-based column. A day with no header is omitted, never guessed. */
  columns: Record<SheetDayKey, number>;
  /** True when the header carries a second, day-specific time column (VII). */
  hasFridayTimeColumn: boolean;
  /** 1-based period rows, ascending. */
  periodRows: number[];
  /** 1-based break/layout rows (never periods). */
  breakRows: number[];
  /** 1-based rows that must never be written. */
  ignoredRows: number[];
  /** Human readable anomalies. */
  warnings: string[];
}

type PartialColumns = Partial<Record<SheetDayKey, number>>;

/** Every day the timetable can carry, in display order. */
const DAY_KEYS: SheetDayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/** Full day names first, then the abbreviations a hand-maintained sheet uses. */
const DAY_TOKENS: Record<string, SheetDayKey> = {
  monday: 'mon', tuesday: 'tue', wednesday: 'wed', thursday: 'thu', friday: 'fri', saturday: 'sat',
  mon: 'mon', tue: 'tue', tues: 'tue', wed: 'wed', weds: 'wed', thu: 'thu', thur: 'thu', thurs: 'thu',
  fri: 'fri', sat: 'sat',
};

/** Days that are real but out of scope for the app. */
const OUT_OF_SCOPE_DAY_TOKENS: Record<string, string> = { sunday: 'sunday', sun: 'sunday' };

/** Normalised spellings of the S.no header. */
const SNO_TOKENS = new Set(['sno', 'srno', 'srno', 'serialno', 'snumber', 'sino', 'no']);

/** Headers that are the *primary* time column. */
const PRIMARY_TIME_TOKENS = new Set(['time', 'timings', 'timing', 'periodtime', 'schooltime', 'timeperiod']);

/** A clock reading, e.g. "8:15" or "8.15". */
const CLOCK_RE = /\b\d{1,2}\s*[:.]\s*\d{2}\b/g;

/** How many leading rows may hold the header. */
const HEADER_SCAN_ROWS = 6;

/* ------------------------------------------------------------------ *
 * Cell / column primitives
 * ------------------------------------------------------------------ */

function collapse(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

function rowAt(grid: unknown, index: number): string[] {
  const rows = grid as unknown;
  if (!Array.isArray(rows)) return [];
  const row = (rows as unknown[])[index];
  return Array.isArray(row) ? (row as string[]) : [];
}

function cellText(cells: string[], index: number): string {
  if (!Array.isArray(cells) || index < 0 || index >= cells.length) return '';
  return collapse(cells[index]);
}

function cellRaw(cells: string[], index: number): string {
  if (!Array.isArray(cells) || index < 0 || index >= cells.length) return '';
  const value = cells[index];
  return value === null || value === undefined ? '' : String(value);
}

function firstNonEmpty(cells: string[]): { index: number; value: string } {
  if (!Array.isArray(cells)) return { index: -1, value: '' };
  for (let i = 0; i < cells.length; i++) {
    const v = cellText(cells, i);
    if (v) return { index: i, value: v };
  }
  return { index: -1, value: '' };
}

/** Lower-case alphanumeric token of a header cell: "S.no." -> "sno". */
function headerToken(raw: unknown): string {
  return collapse(raw).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function isTimeishToken(token: string): boolean {
  if (!token) return false;
  return PRIMARY_TIME_TOKENS.has(token) || token.endsWith('time');
}

/** "8:15 to 8:50" is a range; a single clock reading is not. */
function looksLikeTimeRange(value: string): boolean {
  if (!value) return false;
  const matches = value.match(CLOCK_RE);
  return !!matches && matches.length >= 2;
}

/** A free-text footnote: prose with several clock readings. Never a period. */
function looksLikeFootnoteRow(cells: string[]): boolean {
  const first = firstNonEmpty(cells);
  if (!first.value) return false;
  let joined = '';
  for (let i = 0; i < cells.length; i++) {
    const value = cellText(cells, i);
    if (value) joined += `${value} | `;
  }
  const clocks = joined.match(CLOCK_RE);
  if (!clocks || clocks.length < 3) return false;
  return first.value.includes(':') || /schedule|note|remark/i.test(first.value);
}

/* ------------------------------------------------------------------ *
 * Title parsing
 * ------------------------------------------------------------------ */

const CLASS_PATTERNS: RegExp[] = [
  /\bgrade\s*-?\s*([0-9]{1,2}|[ivxlc]{1,6}(?:\s*-\s*[a-z])?)\b/i,
  /\b([ivxlc]{1,6})\s*-\s*([a-z])\b/i,
  /\b([ivxlc]{1,6})\b/i,
];

const TITLE_PREFIX_RE = /^\s*time\s*tables?\b\s*/i;
const TITLE_NOISE_WORD_RE = /^\s*(?:for|of|grade|class|section|subject|teacher|schedule|schedual)\b\s*/i;

function parseTitle(raw: string): { classLabel: string; teacher: string } {
  const lines = raw
    .split(/\r\n|\r|\n/)
    .map((l) => collapse(l))
    .filter((l) => l.length > 0);
  const flat = lines.join(' ').replace(/\btime\s*tables?\b/gi, ' ').replace(/\s+/g, ' ').trim();

  let classLabel = '';
  for (const pattern of CLASS_PATTERNS) {
    const m = flat.match(pattern);
    if (m) {
      classLabel = collapse(m[1] + (m[2] ? `-${m[2]}` : '')).toUpperCase();
      break;
    }
  }

  const residuals: string[] = [];
  for (const line of lines) {
    let rest = line.replace(TITLE_PREFIX_RE, '');
    if (classLabel) {
      const labelRe = new RegExp(classLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      rest = rest.replace(labelRe, ' ');
    }
    let stripped = rest.replace(TITLE_NOISE_WORD_RE, '');
    while (stripped !== rest) {
      rest = stripped;
      stripped = rest.replace(TITLE_NOISE_WORD_RE, '');
    }
    rest = stripped.replace(/\s+/g, ' ').trim().replace(/^[\s\-:|,.]+/, '').replace(/[\s\-:|,.]+$/, '').trim();
    if (rest) residuals.push(rest);
  }

  let teacher = '';
  for (const candidate of residuals) {
    if (candidate.length > teacher.length) teacher = candidate;
  }
  return { classLabel, teacher };
}

/* ------------------------------------------------------------------ *
 * Detector
 * ------------------------------------------------------------------ */

function emptyColumns(): Record<SheetDayKey, number> {
  return {} as Record<SheetDayKey, number>;
}

function fallbackLayout(warnings: string[]): SheetLayout {
  return {
    classLabel: '',
    teacher: '',
    title: '',
    headerRow: 0,
    firstPeriodRow: 0,
    lastPeriodRow: 0,
    timeColumnIndex: 0,
    snoColumnIndex: null,
    columns: emptyColumns(),
    hasFridayTimeColumn: false,
    periodRows: [],
    breakRows: [],
    ignoredRows: [],
    warnings,
  };
}

function findHeaderRow(rows: string[][]): number {
  let bestIndex = -1;
  let bestScore = 0;
  const limit = Math.min(rows.length, HEADER_SCAN_ROWS);
  for (let r = 0; r < limit; r++) {
    const cells = rowAt(rows, r);
    const days = new Set<SheetDayKey>();
    let timeish = 0;
    for (let i = 0; i < cells.length; i++) {
      const token = headerToken(cells[i]);
      if (!token) continue;
      const day = DAY_TOKENS[token];
      if (day) days.add(day);
      else if (isTimeishToken(token)) timeish++;
    }
    if (timeish > 0 && days.size >= 4) return r;
    const score = days.size + (timeish > 0 ? 1 : 0);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = r;
    }
  }
  return bestScore >= 4 ? bestIndex : -1;
}

function detect(grid: string[][], warnings: string[]): SheetLayout {
  const totalRows = Array.isArray(grid) ? grid.length : 0;

  // --- header ------------------------------------------------------
  const headerIndex = findHeaderRow(grid);

  // --- title (always the first non-empty cell above the header) ----
  let title = '';
  const titleScan = headerIndex >= 0 ? headerIndex : Math.min(totalRows, 3);
  for (let r = 0; r < titleScan; r++) {
    const first = firstNonEmpty(rowAt(grid, r));
    if (first.value) {
      title = cellRaw(rowAt(grid, r), first.index);
      break;
    }
  }
  const { classLabel, teacher } = parseTitle(title);
  if (!classLabel) warnings.push(`no class label could be parsed from the title ${JSON.stringify(title)}`);
  if (!teacher) warnings.push(`no teacher could be parsed from the title ${JSON.stringify(title)}`);

  if (headerIndex < 0) {
    warnings.push('no header row found (need a time-ish cell and at least 4 day names in the first rows)');
    return {
      ...fallbackLayout(warnings),
      classLabel,
      teacher,
      title,
    };
  }
  const headerRow = headerIndex + 1;
  const headerCells = rowAt(grid, headerIndex);

  // --- columns -----------------------------------------------------
  const columns = emptyColumns();
  const timeishCells: { index: number; value: string; token: string }[] = [];
  let snoColumnIndex: number | null = null;

  for (let i = 0; i < headerCells.length; i++) {
    const value = cellText(headerCells, i);
    const token = headerToken(headerCells[i]);
    if (!token) continue;
    const ref = `${colLetter(i)}${headerRow}`;

    const day = DAY_TOKENS[token];
    if (day) {
      if (columns[day] === undefined) columns[day] = i;
      else warnings.push(`duplicate '${value}' header at ${ref}; keeping ${colLetter(columns[day])}${headerRow}`);
      continue;
    }
    if (SNO_TOKENS.has(token)) {
      if (snoColumnIndex === null) snoColumnIndex = i;
      else warnings.push(`duplicate '${value}' header at ${ref}; keeping ${colLetter(snoColumnIndex)}${headerRow}`);
      continue;
    }
    if (isTimeishToken(token)) {
      timeishCells.push({ index: i, value, token });
      continue;
    }
    const outOfScope = OUT_OF_SCOPE_DAY_TOKENS[token];
    if (outOfScope) {
      warnings.push(`${value} column at ${ref} ignored`);
      continue;
    }
    warnings.push(`unknown header cell '${value}' at ${ref}`);
  }

  // The plain "Time" header wins; any other time-ish header (VII's
  // "Friday Time") is a per-day time column, never a day column.
  const primaryTimeCell = timeishCells.find((c) => PRIMARY_TIME_TOKENS.has(c.token)) || timeishCells[0];
  const extraTimeCells = timeishCells.filter((c) => c !== primaryTimeCell);
  let timeColumnIndex = primaryTimeCell ? primaryTimeCell.index : null;
  if (timeColumnIndex === null) {
    const dayColumns = Object.values(columns).filter((v): v is number => typeof v === 'number');
    timeColumnIndex = dayColumns.length ? Math.min(...dayColumns) - 1 : 0;
    if (timeColumnIndex < 0) timeColumnIndex = 0;
    warnings.push(`no 'Time' header found; assuming the time column is ${colLetter(timeColumnIndex)}${headerRow}`);
  }
  for (const extra of extraTimeCells) {
    const ref = `${colLetter(extra.index)}${headerRow}`;
    warnings.push(`unknown header cell '${extra.value}' at ${ref} (extra time column, not a day column)`);
  }
  const hasFridayTimeColumn = extraTimeCells.some((c) => c.token.includes('fri'));

  for (const day of DAY_KEYS) {
    if (columns[day] === undefined) {
      warnings.push(`no '${day}' column in the header row ${headerRow}`);
    }
  }

  // --- rows --------------------------------------------------------
  const periodRows: number[] = [];
  const breakRows: number[] = [];
  const ignored = new Set<number>();
  const labelLimit = Math.max(timeColumnIndex, snoColumnIndex === null ? 0 : snoColumnIndex);
  let gridEnded = false;

  for (let r = headerIndex + 1; r < totalRows; r++) {
    const row1 = r + 1;
    const cells = rowAt(grid, r);
    const first = firstNonEmpty(cells);

    // A break row is labelled in the S.no/Time label area, never in a day cell.
    if (!gridEnded && first.index >= 0 && first.index <= labelLimit && /break/i.test(first.value)) {
      breakRows.push(row1);
      ignored.add(row1);
      continue;
    }

    const snoValue = snoColumnIndex === null ? first.value : cellText(cells, snoColumnIndex);
    const isPeriod = /^\d{1,3}$/.test(snoValue) && looksLikeTimeRange(cellText(cells, timeColumnIndex));
    if (!gridEnded && isPeriod) {
      periodRows.push(row1);
      continue;
    }

    // Not a period, so it must never be written. The first such row after the
    // grid has started ends it: the footnote and the teacher table below can
    // never be absorbed as periods. Scanning continues only to report them.
    ignored.add(row1);
    if (looksLikeFootnoteRow(cells)) {
      warnings.push(`row ${row1} is free text carrying several clock readings and is never treated as a period`);
    }
    if (periodRows.length > 0) gridEnded = true;
  }

  const lastPeriodRow = periodRows.length ? periodRows[periodRows.length - 1] : 0;
  const firstPeriodRow = periodRows.length ? periodRows[0] : 0;
  if (periodRows.length) {
    for (let row1 = lastPeriodRow + 1; row1 <= totalRows; row1++) ignored.add(row1);
  }
  if (periodRows.length === 0) {
    warnings.push('no period rows found: the grid does not look like a timetable');
  } else {
    if (periodRows.length > 1 && breakRows.filter((b) => b > firstPeriodRow && b < lastPeriodRow).length === 0) {
      warnings.push(`no break row found between period rows ${firstPeriodRow} and ${lastPeriodRow}`);
    }
    for (let i = 1; i < periodRows.length; i++) {
      const gap = periodRows[i] - periodRows[i - 1];
      if (gap !== 1 && gap !== 2) {
        warnings.push(`gap of ${gap - 1} row(s) between period rows ${periodRows[i - 1]} and ${periodRows[i]}`);
      }
    }
  }

  const ignoredRows = [...ignored].sort((a, b) => a - b);

  return {
    classLabel,
    teacher,
    title,
    headerRow,
    firstPeriodRow,
    lastPeriodRow,
    timeColumnIndex,
    snoColumnIndex,
    columns,
    hasFridayTimeColumn,
    periodRows,
    breakRows,
    ignoredRows,
    warnings,
  };
}

/**
 * Describe where everything lives in a parsed timetable grid. Never throws: a
 * malformed or empty grid comes back with warnings and empty arrays.
 */
export function detectLayout(grid: string[][]): SheetLayout {
  const warnings: string[] = [];
  if (!Array.isArray(grid) || grid.length === 0) {
    warnings.push('empty grid: no timetable layout could be detected');
    return fallbackLayout(warnings);
  }
  try {
    return detect(grid, warnings);
  } catch (err) {
    warnings.push(`layout detection failed: ${err instanceof Error ? err.message : String(err)}`);
    return fallbackLayout(warnings);
  }
}

/** 0 -> "A", 25 -> "Z", 26 -> "AA". */
export function colLetter(index0: number): string {
  if (!Number.isFinite(index0)) return '';
  let n = Math.trunc(index0);
  if (n < 0) return '';
  let out = '';
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

/** "A" -> 0, "AA" -> 26. Returns -1 for anything that is not a column letter. */
export function colIndex0(letter: string): number {
  const text = collapse(letter).replace(/[^a-zA-Z]/g, '').toUpperCase();
  if (!text) return -1;
  let n = 0;
  for (const ch of text) {
    const d = ch.charCodeAt(0) - 64;
    if (d < 1 || d > 26) return -1;
    n = n * 26 + d;
  }
  return n - 1;
}

/**
 * Bare A1 for a day cell, e.g. "D4". The sheet name is the caller's job.
 * Returns '' when the day has no column or the row is not a sheet row.
 */
export function cellRef(layout: SheetLayout, row1: number, day: SheetDayKey): string {
  if (!layout || !Number.isFinite(row1) || row1 < 1) return '';
  const col = layout.columns ? layout.columns[day] : undefined;
  if (typeof col !== 'number' || col < 0) return '';
  return `${colLetter(col)}${Math.trunc(row1)}`;
}

/** Trimmed, whitespace-collapsed cell read. 1-based row, 0-based column. */
export function readCell(grid: string[][], row1: number, col0: number): string {
  if (!Array.isArray(grid)) return '';
  if (!Number.isFinite(row1) || !Number.isFinite(col0)) return '';
  const r = Math.trunc(row1) - 1;
  const c = Math.trunc(col0);
  if (r < 0 || c < 0 || r >= grid.length) return '';
  return cellText(rowAt(grid, r), c);
}

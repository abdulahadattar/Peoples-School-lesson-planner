import {
  SheetDayKey,
  SheetLayout,
  DAY_KEYS,
  DAY_TOKENS,
  OUT_OF_SCOPE_DAY_TOKENS,
  PRIMARY_TIME_TOKENS,
  SNO_TOKENS,
  HEADER_SCAN_ROWS,
} from './types';
import {
  rowAt,
  cellText,
  cellRaw,
  firstNonEmpty,
  headerToken,
  isTimeishToken,
  looksLikeTimeRange,
  looksLikeFootnoteRow,
  colLetter,
} from './cellUtils';
import { parseTitle } from './titleParser';

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
  const headerIndex = findHeaderRow(grid);

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

  const periodRows: number[] = [];
  const breakRows: number[] = [];
  const ignored = new Set<number>();
  const labelLimit = Math.max(timeColumnIndex, snoColumnIndex === null ? 0 : snoColumnIndex);
  let gridEnded = false;

  for (let r = headerIndex + 1; r < totalRows; r++) {
    const row1 = r + 1;
    const cells = rowAt(grid, r);
    const first = firstNonEmpty(cells);

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

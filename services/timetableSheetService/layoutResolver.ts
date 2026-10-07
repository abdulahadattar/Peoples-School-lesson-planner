import { detectLayout, type SheetDayKey, type SheetLayout } from '../timetableSheetLayout';
import { SHEET_DAYS, SNO_CELL_RE, splitTimeCell } from './timeUtils';

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

function rowLooksLikePeriod(grid: string[][], row1: number, snoCol0: number, timeCol0: number): boolean {
  const row = grid[row1 - 1] ?? [];
  const sno = (row[snoCol0] ?? '').trim();
  if (!SNO_CELL_RE.test(sno)) return false;
  const n = parseInt(sno, 10);
  if (!(n >= 1 && n <= 12)) return false;
  return splitTimeCell(row[timeCol0] ?? '') !== null;
}

export interface ResolvedLayout {
  periodRows1: number[];
  dayColumns: Partial<Record<SheetDayKey, number>>;
  detectedDays: SheetDayKey[];
  timeCol0: number;
  fridayTimeCol0: number | null;
  snoCol0: number;
  titleClassLabel: string;
  warnings: string[];
}

export function resolveLayout(grid: string[][]): ResolvedLayout {
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

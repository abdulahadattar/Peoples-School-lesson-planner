import {
  SheetDayKey,
  SheetLayout,
  CLOCK_RE,
  PRIMARY_TIME_TOKENS,
} from './types';

export function collapse(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

export function rowAt(grid: unknown, index: number): string[] {
  const rows = grid as unknown;
  if (!Array.isArray(rows)) return [];
  const row = (rows as unknown[])[index];
  return Array.isArray(row) ? (row as string[]) : [];
}

export function cellText(cells: string[], index: number): string {
  if (!Array.isArray(cells) || index < 0 || index >= cells.length) return '';
  return collapse(cells[index]);
}

export function cellRaw(cells: string[], index: number): string {
  if (!Array.isArray(cells) || index < 0 || index >= cells.length) return '';
  const value = cells[index];
  return value === null || value === undefined ? '' : String(value);
}

export function firstNonEmpty(cells: string[]): { index: number; value: string } {
  if (!Array.isArray(cells)) return { index: -1, value: '' };
  for (let i = 0; i < cells.length; i++) {
    const v = cellText(cells, i);
    if (v) return { index: i, value: v };
  }
  return { index: -1, value: '' };
}

export function headerToken(raw: unknown): string {
  return collapse(raw).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

export function isTimeishToken(token: string): boolean {
  if (!token) return false;
  return PRIMARY_TIME_TOKENS.has(token) || token.endsWith('time');
}

export function looksLikeTimeRange(value: string): boolean {
  if (!value) return false;
  const matches = value.match(CLOCK_RE);
  return !!matches && matches.length >= 2;
}

export function looksLikeFootnoteRow(cells: string[]): boolean {
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

export function cellRef(layout: SheetLayout, row1: number, day: SheetDayKey): string {
  if (!layout || !Number.isFinite(row1) || row1 < 1) return '';
  const col = layout.columns ? layout.columns[day] : undefined;
  if (typeof col !== 'number' || col < 0) return '';
  return `${colLetter(col)}${Math.trunc(row1)}`;
}

export function readCell(grid: string[][], row1: number, col0: number): string {
  if (!Array.isArray(grid)) return '';
  if (!Number.isFinite(row1) || !Number.isFinite(col0)) return '';
  const r = Math.trunc(row1) - 1;
  const c = Math.trunc(col0);
  if (r < 0 || c < 0 || r >= grid.length) return '';
  return cellText(rowAt(grid, r), c);
}

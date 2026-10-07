import type { SheetDayKey } from '../timetableSheetLayout';

export const SHEET_DAYS: { key: SheetDayKey; header: RegExp }[] = [
  { key: 'mon', header: /^mon/i },
  { key: 'tue', header: /^tue/i },
  { key: 'wed', header: /^wed/i },
  { key: 'thu', header: /^thu/i },
  { key: 'fri', header: /^fri/i },
  { key: 'sat', header: /^sat/i },
];

export const TIME_CELL_RE = /(\d{1,2}\s*:\s*\d{2})\s*(?:-|–|—|=>|\.\.|to\b|thru\b)\s*(\d{1,2}\s*:\s*\d{2})/i;
export const SINGLE_TIME_RE = /\d{1,2}\s*:\s*\d{2}/;
export const SNO_CELL_RE = /^\s*\d{1,2}\s*$/;

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

export function normaliseTimeString(t: string): string {
  return t.trim().replace(/^0(\d)/, '$1').replace(/\s*:\s*/, ':');
}

export function splitTimeCell(raw: string): { start: string; end: string } | null {
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

export function normSubject(v: string | null | undefined): string {
  return (v ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

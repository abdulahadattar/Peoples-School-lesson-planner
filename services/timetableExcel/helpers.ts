export function sanitizeSheetName(name: string, fallback = 'Sheet'): string {
  const cleaned = name.replace(/[:\\/?*\[\]]/g, ' ').trim();
  if (!cleaned) return fallback;
  return cleaned.substring(0, 31);
}

export const STANDARD_PERIOD_TIMES = [
  '8:15 AM – 8:50 AM',
  '8:50 AM – 9:30 AM',
  '9:30 AM – 10:10 AM',
  '10:10 AM – 10:50 AM',
  '11:20 AM – 12:00 PM',
  '12:00 PM – 12:40 PM',
  '12:40 PM – 01:20 PM',
];

export const FRIDAY_PERIOD_TIMES = [
  '8:15 AM – 8:50 AM',
  '8:50 AM – 9:25 AM',
  '9:25 AM – 10:00 AM',
  '10:30 AM – 11:10 AM',
  '11:10 AM – 11:50 AM',
  '—',
  '—',
];

export const CLASS_SHEET_COLS = [
  { wch: 14 },
  { wch: 28 },
  { wch: 20 },
  { wch: 24 },
  { wch: 24 },
  { wch: 24 },
  { wch: 24 },
  { wch: 24 },
  { wch: 24 },
];

export const TEACHER_SHEET_COLS = [
  { wch: 14 },
  { wch: 24 },
  { wch: 20 },
  { wch: 28 },
  { wch: 28 },
  { wch: 28 },
  { wch: 28 },
  { wch: 28 },
  { wch: 28 },
];

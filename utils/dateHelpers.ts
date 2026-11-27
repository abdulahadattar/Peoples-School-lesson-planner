/**
 * dateHelpers.ts — Canonical date formatters for school records and attendance.
 */

export function getTodayDateString(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatSchoolDate(
  date: string | Date | null | undefined,
  style: 'short' | 'full' | 'weekday' = 'short'
): string {
  if (!date) return '—';

  const d = typeof date === 'string' ? new Date(date.includes('T') ? date : `${date}T00:00:00`) : date;
  if (isNaN(d.getTime())) return String(date);

  switch (style) {
    case 'weekday':
      return d.toLocaleDateString('en-GB', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    case 'full':
      return d.toLocaleDateString('en-GB', {
        weekday: 'long',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    case 'short':
    default:
      return d.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
  }
}

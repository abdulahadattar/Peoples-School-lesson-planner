/**
 * attendanceUtils.ts — Standardized attendance percentage styling and badge themes.
 */

export function getAttendanceProgressColor(pct: number): string {
  if (pct >= 90) return 'bg-emerald-500';
  if (pct >= 80) return 'bg-blue-500';
  if (pct >= 70) return 'bg-amber-500';
  return 'bg-rose-500';
}

export function getAttendanceTextColor(pct: number): string {
  if (pct >= 90) return 'text-emerald-700 dark:text-emerald-400';
  if (pct >= 80) return 'text-blue-700 dark:text-blue-400';
  if (pct >= 70) return 'text-amber-700 dark:text-amber-400';
  return 'text-rose-700 dark:text-rose-400';
}

export function getAttendanceBadgeBg(pct: number): string {
  if (pct >= 90) return 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800';
  if (pct >= 80) return 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800';
  if (pct >= 70) return 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800';
  return 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800';
}

export function getStudentStatusBadgeClass(status?: string): string {
  const s = (status || '').toLowerCase();
  if (s.includes('promot') || s.includes('active')) {
    return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800';
  }
  if (s.includes('new') || s.includes('enroll')) {
    return 'bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300 border-sky-200 dark:border-sky-800';
  }
  if (s.includes('drop') || s.includes('struck') || s.includes('left')) {
    return 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border-rose-200 dark:border-rose-800';
  }
  return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700';
}

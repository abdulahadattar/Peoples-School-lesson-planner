import { triggerFileDownload } from '../../utils/download';
import { ClassAttendanceRow, SchoolAttendanceSummary } from './types';

export function exportAttendanceCSV(
  date: string,
  rows: ClassAttendanceRow[],
  summary: SchoolAttendanceSummary
): void {
  const headers = [
    'Grade',
    'Enrolled Boys',
    'Enrolled Girls',
    'Total Enrolled',
    'Present Boys',
    'Present Girls',
    'Total Present',
    'Total Absent',
    'Attendance %',
  ];
  const data = rows.map((r) => [
    r.displayName,
    r.enrolledBoys,
    r.enrolledGirls,
    r.totalEnrolled,
    typeof r.presentBoys === 'number' ? r.presentBoys : 0,
    typeof r.presentGirls === 'number' ? r.presentGirls : 0,
    r.totalPresent,
    r.absentTotal,
    `${r.percentage}%`,
  ]);

  data.push([
    'TOTAL ATTENDANCE',
    summary.enrolledBoys,
    summary.enrolledGirls,
    summary.totalEnrolled,
    summary.presentBoys,
    summary.presentGirls,
    summary.totalPresent,
    summary.totalAbsent,
    `${summary.overallPercentage}%`,
  ]);

  const csvContent = [headers.join(','), ...data.map((d) => d.join(','))].join('\n');
  triggerFileDownload(csvContent, `Attendance_${date}.csv`, 'text/csv;charset=utf-8;');
}

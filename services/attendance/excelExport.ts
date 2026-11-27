import * as XLSX from 'xlsx';
import { ClassAttendanceRow, SchoolAttendanceSummary } from './types';

export function buildAttendanceWorkbook(
  date: string,
  rows: ClassAttendanceRow[],
  summary: SchoolAttendanceSummary,
  recordedBy?: string,
  notes?: string
): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  const summarySheetData: Array<Array<string | number>> = [
    ['Peoples Higher Secondary School Jamshoro (PHSSJ)'],
    ['Daily Student Attendance Summary'],
    ['Date', date],
    ['In-Charge / Recorded By', recordedBy || 'Unassigned'],
    ['Notes', notes || '—'],
    [],
    ['Metric', 'Count / Value'],
    ['Enrolled Boys', summary.enrolledBoys],
    ['Enrolled Girls', summary.enrolledGirls],
    ['Total Enrolled', summary.totalEnrolled],
    ['Present Boys', summary.presentBoys],
    ['Present Girls', summary.presentGirls],
    ['Total Present', summary.totalPresent],
    ['Total Absent', summary.totalAbsent],
    ['Overall Attendance %', `${summary.overallPercentage}%`],
  ];

  const wsSummary = XLSX.utils.aoa_to_sheet(summarySheetData);
  wsSummary['!cols'] = [{ wch: 28 }, { wch: 28 }];

  const classHeaders = [
    'Class / Section',
    'Enrolled Boys',
    'Enrolled Girls',
    'Total Enrolled',
    'Present Boys',
    'Present Girls',
    'Total Present',
    'Total Absent',
    'Attendance %',
    'Class Teacher',
  ];

  const classRows: Array<Array<string | number>> = rows.map((r) => [
    r.displayName,
    r.enrolledBoys,
    r.enrolledGirls,
    r.totalEnrolled,
    typeof r.presentBoys === 'number' ? r.presentBoys : 0,
    typeof r.presentGirls === 'number' ? r.presentGirls : 0,
    r.totalPresent,
    r.absentTotal,
    `${r.percentage}%`,
    r.classTeacher || '',
  ]);

  classRows.push([
    'TOTAL',
    summary.enrolledBoys,
    summary.enrolledGirls,
    summary.totalEnrolled,
    summary.presentBoys,
    summary.presentGirls,
    summary.totalPresent,
    summary.totalAbsent,
    `${summary.overallPercentage}%`,
    '',
  ]);

  const wsClasses = XLSX.utils.aoa_to_sheet([
    [`PHSSJ Daily Attendance — ${date}`],
    [],
    classHeaders,
    ...classRows,
  ]);
  wsClasses['!cols'] = [
    { wch: 20 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 24 },
  ];

  XLSX.utils.book_append_sheet(wb, wsClasses, 'Classwise Attendance');
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

  return wb;
}

export function exportAttendanceExcel(
  date: string,
  rows: ClassAttendanceRow[],
  summary: SchoolAttendanceSummary,
  recordedBy?: string,
  notes?: string
): void {
  const wb = buildAttendanceWorkbook(date, rows, summary, recordedBy, notes);
  XLSX.writeFile(wb, `PHSSJ_Attendance_${date}.xlsx`);
}

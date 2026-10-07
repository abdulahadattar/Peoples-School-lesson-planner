import * as XLSX from 'xlsx';
import { Teacher } from '../../types';
import { TimetableClassEntry, DAY_KEYS, DAY_LABELS } from '../timetable';
import { buildTeacherMasterSchedule, auditFullTimetable } from '../timetableConflictEngine';
import { sanitizeSheetName, STANDARD_PERIOD_TIMES, FRIDAY_PERIOD_TIMES, TEACHER_SHEET_COLS } from './helpers';

export function exportTeacherWiseTimetableToExcel(
  timetableMap: Record<string, TimetableClassEntry>,
  teachers: Teacher[],
  schoolName = 'Peoples Secondary School'
) {
  const wb = XLSX.utils.book_new();
  const sortedTeachers = teachers.slice().sort((a, b) => a.name.localeCompare(b.name));
  const auditReport = auditFullTimetable(timetableMap, teachers);

  const summaryData: (string | number)[][] = [
    [schoolName.toUpperCase()],
    ['FACULTY MASTER TEACHING LOAD & TIMETABLE AUDIT SUMMARY'],
    [`Generated on: ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} at ${new Date().toLocaleTimeString()}`],
    [],
    [
      'S.No',
      'Teacher Name',
      'Designation',
      'Subjects Taught',
      'Assigned Classes',
      'Weekly Teaching Periods',
      'Mon',
      'Tue',
      'Wed',
      'Thu',
      'Fri',
      'Sat',
      'Clash Status',
    ],
  ];

  let totalSchoolTeachingSlots = 0;
  const dayTotals: Record<string, number> = { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0, sat: 0 };

  sortedTeachers.forEach((t, idx) => {
    const sched = buildTeacherMasterSchedule(t.id, timetableMap, teachers);
    totalSchoolTeachingSlots += sched.totalTeachingPeriods;

    DAY_KEYS.forEach((dKey) => {
      dayTotals[dKey] += sched.weeklySchedule[dKey].length;
    });

    const teacherClashes = auditReport.clashes.filter((c) => c.teacher.id === t.id);
    const clashNote = teacherClashes.length === 0
      ? '✓ Clear'
      : `⚠️ ${teacherClashes.length} Clash(es)`;

    summaryData.push([
      idx + 1,
      t.name,
      t.designation || 'Teacher',
      t.subjects.map((s) => s.name).join(', '),
      sched.classesTaught.join(', ') || 'None',
      sched.totalTeachingPeriods,
      sched.weeklySchedule.mon.length,
      sched.weeklySchedule.tue.length,
      sched.weeklySchedule.wed.length,
      sched.weeklySchedule.thu.length,
      sched.weeklySchedule.fri.length,
      sched.weeklySchedule.sat.length,
      clashNote,
    ]);
  });

  summaryData.push([]);
  summaryData.push([
    'TOTALS',
    `${sortedTeachers.length} Faculty Members`,
    '',
    '',
    '',
    totalSchoolTeachingSlots,
    dayTotals.mon,
    dayTotals.tue,
    dayTotals.wed,
    dayTotals.thu,
    dayTotals.fri,
    dayTotals.sat,
    auditReport.totalClashes === 0 ? '✓ Entire School 100% Conflict Free' : `⚠️ Total ${auditReport.totalClashes} Clashes`,
  ]);

  const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
  summarySheet['!cols'] = [
    { wch: 6 },
    { wch: 22 },
    { wch: 18 },
    { wch: 30 },
    { wch: 24 },
    { wch: 22 },
    { wch: 8 },
    { wch: 8 },
    { wch: 8 },
    { wch: 8 },
    { wch: 8 },
    { wch: 8 },
    { wch: 18 },
  ];
  XLSX.utils.book_append_sheet(wb, summarySheet, 'Faculty Summary');

  sortedTeachers.forEach((t) => {
    const sheetName = sanitizeSheetName(t.name);
    const sched = buildTeacherMasterSchedule(t.id, timetableMap, teachers);

    const teacherData: (string | number)[][] = [
      [schoolName.toUpperCase()],
      [`FACULTY TEACHING SCHEDULE — ${t.name.toUpperCase()}`],
      [
        `Designation: ${t.designation || 'Teacher'}`,
        `Subjects: ${t.subjects.map((s) => s.name).join(', ')}`,
        `Weekly Load: ${sched.totalTeachingPeriods} periods`,
        sched.clashCount > 0 ? `Status: ⚠️ ${sched.clashCount} Clashes` : 'Status: ✓ Conflict Free',
      ],
      [`Generated on: ${new Date().toLocaleDateString('en-GB')}`],
      [],
      [
        'Period',
        'Timing (Mon-Thu, Sat)',
        'Timing (Fri)',
        'Monday',
        'Tuesday',
        'Wednesday',
        'Thursday',
        'Friday',
        'Saturday',
      ],
    ];

    [1, 2, 3, 4, 5, 6, 7].forEach((pNo) => {
      if (pNo === 5) {
        teacherData.push([
          'RECESS',
          '10:50 AM – 11:20 AM',
          '10:00 AM – 10:30 AM',
          '☕ STAFF ROOM RECESS',
          '☕ STAFF ROOM RECESS',
          '☕ STAFF ROOM RECESS',
          '☕ STAFF ROOM RECESS',
          '☕ STAFF ROOM RECESS',
          '☕ STAFF ROOM RECESS',
        ]);
      }

      const row: (string | number)[] = [
        `Period ${pNo}`,
        STANDARD_PERIOD_TIMES[pNo - 1] || '—',
        FRIDAY_PERIOD_TIMES[pNo - 1] || '—',
      ];

      DAY_KEYS.forEach((dKey) => {
        const slots = sched.weeklySchedule[dKey].filter((s) => s.periodNo === pNo);
        if (slots.length === 0) {
          row.push('Free (Staff Room)');
        } else if (slots.length === 1) {
          row.push(`Class ${slots[0].classLabel} — ${slots[0].subject}`);
        } else {
          row.push(`⚠️ CLASH: ${slots.map((s) => `Class ${s.classLabel} (${s.subject})`).join(' + ')}`);
        }
      });

      teacherData.push(row);
    });

    teacherData.push([]);
    teacherData.push(['DAILY WORKLOAD BREAKDOWN']);
    teacherData.push(['Day', 'Teaching Periods Assigned', 'Classes Taught']);

    DAY_KEYS.forEach((dKey) => {
      const slots = sched.weeklySchedule[dKey];
      const classesOnDay = Array.from(new Set(slots.map((s) => `Class ${s.classLabel}`)));
      teacherData.push([
        DAY_LABELS[dKey],
        slots.length,
        classesOnDay.join(', ') || 'None (Off / Free)',
      ]);
    });

    const sheet = XLSX.utils.aoa_to_sheet(teacherData);
    sheet['!cols'] = TEACHER_SHEET_COLS;
    XLSX.utils.book_append_sheet(wb, sheet, sheetName);
  });

  const fileName = `Teacher_Wise_Timetable_${schoolName.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, fileName);
  return fileName;
}

export function exportSingleTeacherToExcel(
  teacherId: string,
  timetableMap: Record<string, TimetableClassEntry>,
  teachers: Teacher[],
  schoolName = 'Peoples Secondary School'
) {
  const teacher = teachers.find((t) => t.id === teacherId);
  if (!teacher) return;

  const wb = XLSX.utils.book_new();
  const sched = buildTeacherMasterSchedule(teacher.id, timetableMap, teachers);

  const teacherData: (string | number)[][] = [
    [schoolName.toUpperCase()],
    [`TEACHER WEEKLY TIMETABLE — ${teacher.name.toUpperCase()}`],
    [
      `Designation: ${teacher.designation || 'Teacher'}`,
      `Subjects: ${teacher.subjects.map((s) => s.name).join(', ')}`,
      `Total Weekly Load: ${sched.totalTeachingPeriods} periods`,
      sched.clashCount > 0 ? `Status: ⚠️ ${sched.clashCount} Clashes` : 'Status: ✓ 100% Conflict Free',
    ],
    [`Generated on: ${new Date().toLocaleDateString('en-GB')}`],
    [],
    [
      'Period',
      'Timing (Mon-Thu, Sat)',
      'Timing (Fri)',
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
    ],
  ];

  [1, 2, 3, 4, 5, 6, 7].forEach((pNo) => {
    if (pNo === 5) {
      teacherData.push([
        'RECESS',
        '10:50 AM – 11:20 AM',
        '10:00 AM – 10:30 AM',
        '☕ STAFF ROOM RECESS',
        '☕ STAFF ROOM RECESS',
        '☕ STAFF ROOM RECESS',
        '☕ STAFF ROOM RECESS',
        '☕ STAFF ROOM RECESS',
        '☕ STAFF ROOM RECESS',
      ]);
    }

    const row: (string | number)[] = [
      `Period ${pNo}`,
      STANDARD_PERIOD_TIMES[pNo - 1] || '—',
      FRIDAY_PERIOD_TIMES[pNo - 1] || '—',
    ];

    DAY_KEYS.forEach((dKey) => {
      const slots = sched.weeklySchedule[dKey].filter((s) => s.periodNo === pNo);
      if (slots.length === 0) {
        row.push('Free (Staff Room)');
      } else if (slots.length === 1) {
        row.push(`Class ${slots[0].classLabel} — ${slots[0].subject}`);
      } else {
        row.push(`⚠️ CLASH: ${slots.map((s) => `Class ${s.classLabel} (${s.subject})`).join(' + ')}`);
      }
    });

    teacherData.push(row);
  });

  const sheet = XLSX.utils.aoa_to_sheet(teacherData);
  sheet['!cols'] = TEACHER_SHEET_COLS;
  XLSX.utils.book_append_sheet(wb, sheet, sanitizeSheetName(teacher.name));
  const fileName = `Teacher_${teacher.name.replace(/\s+/g, '_')}_Timetable_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, fileName);
  return fileName;
}

import * as XLSX from 'xlsx';
import { Teacher } from '../types';
import { TimetableClassEntry, DayKey, DAY_KEYS, DAY_LABELS } from './timetable';
import { parseTimetableCell, buildTeacherMasterSchedule, auditFullTimetable } from './timetableConflictEngine';

/**
 * Sanitizes a string so it can be used safely as an Excel worksheet name.
 * Excel limits sheet names to 31 chars and forbids: \ / ? * : [ ]
 */
function sanitizeSheetName(name: string, fallback = 'Sheet'): string {
  const cleaned = name.replace(/[:\\/?*\[\]]/g, ' ').trim();
  if (!cleaned) return fallback;
  return cleaned.substring(0, 31);
}

/**
 * Export Class-Wise Timetable to Excel (.xlsx)
 * Contains an Overview Master Sheet + individual sheets for every class section.
 */
export function exportClassWiseTimetableToExcel(
  timetableMap: Record<string, TimetableClassEntry>,
  teachers: Teacher[],
  schoolName = 'Peoples Secondary School'
) {
  const wb = XLSX.utils.book_new();
  const classes = Object.values(timetableMap);

  // ─────────────────────────────────────────────────────────────
  // 1. MASTER CLASS OVERVIEW SHEET
  // ─────────────────────────────────────────────────────────────
  const overviewData: (string | number)[][] = [
    [schoolName.toUpperCase()],
    ['INSTITUTIONAL TIMETABLE — MASTER CLASS OVERVIEW'],
    [`Generated on: ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} at ${new Date().toLocaleTimeString()}`],
    [],
    ['Class Section', 'Class Teacher', 'Day', 'Period 1', 'Period 2', 'Period 3', 'Period 4', 'RECESS', 'Period 5', 'Period 6', 'Period 7'],
  ];

  classes.forEach(cls => {
    DAY_KEYS.forEach((dKey, dIdx) => {
      const row: (string | number)[] = [
        dIdx === 0 ? cls.label : '',
        dIdx === 0 ? cls.classTeacher || 'Unassigned' : '',
        DAY_LABELS[dKey],
      ];

      // Periods 1 to 4
      for (let pNo = 1; pNo <= 4; pNo++) {
        const period = cls.periods.find(p => p.no === pNo);
        const cellRaw = period ? period[dKey] : '—';
        const parsed = parseTimetableCell(cellRaw || '—', cls.label, teachers);
        if (parsed.empty) {
          row.push('—');
        } else {
          const tNames = parsed.teachers.map(t => t.name).join(', ');
          row.push(tNames ? `${parsed.label} (${tNames})` : parsed.label);
        }
      }

      // Recess
      row.push('RECESS BREAK');

      // Periods 5 to 7
      for (let pNo = 5; pNo <= 7; pNo++) {
        const period = cls.periods.find(p => p.no === pNo);
        const cellRaw = period ? period[dKey] : '—';
        const parsed = parseTimetableCell(cellRaw || '—', cls.label, teachers);
        if (parsed.empty) {
          row.push('—');
        } else {
          const tNames = parsed.teachers.map(t => t.name).join(', ');
          row.push(tNames ? `${parsed.label} (${tNames})` : parsed.label);
        }
      }

      overviewData.push(row);
    });
    overviewData.push([]); // blank divider line between classes
  });

  const overviewSheet = XLSX.utils.aoa_to_sheet(overviewData);
  overviewSheet['!cols'] = [
    { wch: 16 }, // Class Section
    { wch: 22 }, // Class Teacher
    { wch: 14 }, // Day
    { wch: 26 }, // Period 1
    { wch: 26 }, // Period 2
    { wch: 26 }, // Period 3
    { wch: 26 }, // Period 4
    { wch: 16 }, // Recess
    { wch: 26 }, // Period 5
    { wch: 26 }, // Period 6
    { wch: 26 }, // Period 7
  ];
  XLSX.utils.book_append_sheet(wb, overviewSheet, 'Master Overview');

  // ─────────────────────────────────────────────────────────────
  // 2. INDIVIDUAL CLASS SHEETS
  // ─────────────────────────────────────────────────────────────
  const usedSheetNames = new Set<string>(['Master Overview']);

  classes.forEach(cls => {
    let sheetName = sanitizeSheetName(`Class ${cls.label}`);
    let counter = 1;
    while (usedSheetNames.has(sheetName)) {
      sheetName = sanitizeSheetName(`Class ${cls.label} (${counter})`);
      counter++;
    }
    usedSheetNames.add(sheetName);

    const classData: (string | number)[][] = [
      [schoolName.toUpperCase()],
      [`WEEKLY TIMETABLE — CLASS ${cls.label.toUpperCase()}`],
      [`Class Teacher: ${cls.classTeacher || 'Unassigned'}`, '', '', `Academic Year: 2025–2026`],
      [],
      [
        'Period',
        'Standard Timing (Mon-Thu, Sat)',
        'Friday Timing',
        'Monday',
        'Tuesday',
        'Wednesday',
        'Thursday',
        'Friday',
        'Saturday',
      ],
    ];

    cls.periods.forEach(p => {
      // If after Period 4, insert Recess Break row
      if (p.no === 5) {
        classData.push([
          'RECESS',
          '10:50 AM – 11:20 AM',
          '10:00 AM – 10:30 AM',
          '☕ RECESS BREAK',
          '☕ RECESS BREAK',
          '☕ RECESS BREAK',
          '☕ RECESS BREAK',
          '☕ RECESS BREAK',
          '☕ RECESS BREAK',
        ]);
      }

      const row: (string | number)[] = [
        `Period ${p.no}`,
        `${p.start} – ${p.end}`,
        p.friStart && p.friEnd && p.friStart !== '—' ? `${p.friStart} – ${p.friEnd}` : '—',
      ];

      DAY_KEYS.forEach(dKey => {
        const cellRaw = p[dKey] || '—';
        const parsed = parseTimetableCell(cellRaw, cls.label, teachers);
        if (parsed.empty) {
          row.push('—');
        } else {
          const tNames = parsed.teachers.map(t => t.name).join(', ');
          row.push(tNames ? `${parsed.label} [${tNames}]` : parsed.label);
        }
      });

      classData.push(row);
    });

    // Class Curriculum Summary at bottom
    classData.push([]);
    classData.push(['SUBJECT & TEACHER SUMMARY FOR CLASS ' + cls.label]);
    classData.push(['Subject', 'Assigned Teacher(s)', 'Periods Per Week']);

    const subjectStats: Record<string, { teachers: Set<string>; count: number }> = {};
    cls.periods.forEach(p => {
      DAY_KEYS.forEach(dKey => {
        const parsed = parseTimetableCell(p[dKey] || '—', cls.label, teachers);
        if (!parsed.empty) {
          const subKey = parsed.label;
          if (!subjectStats[subKey]) {
            subjectStats[subKey] = { teachers: new Set(), count: 0 };
          }
          subjectStats[subKey].count++;
          parsed.teachers.forEach(t => subjectStats[subKey].teachers.add(t.name));
        }
      });
    });

    Object.entries(subjectStats).forEach(([subject, stats]) => {
      classData.push([
        subject,
        Array.from(stats.teachers).join(', ') || 'Unassigned',
        stats.count,
      ]);
    });

    const sheet = XLSX.utils.aoa_to_sheet(classData);
    sheet['!cols'] = [
      { wch: 14 }, // Period
      { wch: 28 }, // Standard Timing
      { wch: 20 }, // Friday Timing
      { wch: 24 }, // Monday
      { wch: 24 }, // Tuesday
      { wch: 24 }, // Wednesday
      { wch: 24 }, // Thursday
      { wch: 24 }, // Friday
      { wch: 24 }, // Saturday
    ];

    XLSX.utils.book_append_sheet(wb, sheet, sheetName);
  });

  const fileName = `Class_Wise_Timetable_${schoolName.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, fileName);
  return fileName;
}

/**
 * Export Teacher-Wise Master Timetable to Excel (.xlsx)
 * Contains a Faculty Load Summary Sheet + individual sheets for every faculty member.
 */
export function exportTeacherWiseTimetableToExcel(
  timetableMap: Record<string, TimetableClassEntry>,
  teachers: Teacher[],
  schoolName = 'Peoples Secondary School'
) {
  const wb = XLSX.utils.book_new();
  const sortedTeachers = teachers.slice().sort((a, b) => a.name.localeCompare(b.name));
  const auditReport = auditFullTimetable(timetableMap, teachers);

  // ─────────────────────────────────────────────────────────────
  // 1. FACULTY LOAD SUMMARY SHEET
  // ─────────────────────────────────────────────────────────────
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

  sortedTeachers.forEach((teacher, idx) => {
    const sched = buildTeacherMasterSchedule(teacher.id, timetableMap, teachers);
    const dayCounts = DAY_KEYS.map(dKey => sched.weeklySchedule[dKey].length);

    summaryData.push([
      idx + 1,
      teacher.name,
      teacher.designation || 'Teacher',
      teacher.subjects.map(s => s.name).join(', '),
      sched.classesTaught.join(', ') || 'None',
      sched.totalTeachingPeriods,
      dayCounts[0], // Mon
      dayCounts[1], // Tue
      dayCounts[2], // Wed
      dayCounts[3], // Thu
      dayCounts[4], // Fri
      dayCounts[5], // Sat
      sched.clashCount > 0 ? `⚠️ ${sched.clashCount} CLASH(ES)` : '✓ Conflict Free',
    ]);
  });

  // Overall Statistics Row
  summaryData.push([]);
  summaryData.push([
    'TOTALS',
    `Total Faculty: ${sortedTeachers.length}`,
    '',
    '',
    '',
    `Total Classes: ${Object.keys(timetableMap).length}`,
    '',
    '',
    '',
    '',
    '',
    '',
    auditReport.totalClashes === 0 ? '✓ Entire School Conflict Free' : `⚠️ ${auditReport.totalClashes} Clashes Found`,
  ]);

  const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
  summarySheet['!cols'] = [
    { wch: 6 },  // S.No
    { wch: 24 }, // Teacher Name
    { wch: 22 }, // Designation
    { wch: 30 }, // Subjects Taught
    { wch: 22 }, // Assigned Classes
    { wch: 24 }, // Weekly Periods
    { wch: 8 },  // Mon
    { wch: 8 },  // Tue
    { wch: 8 },  // Wed
    { wch: 8 },  // Thu
    { wch: 8 },  // Fri
    { wch: 8 },  // Sat
    { wch: 20 }, // Clash Status
  ];
  XLSX.utils.book_append_sheet(wb, summarySheet, 'Faculty Load Summary');

  // ─────────────────────────────────────────────────────────────
  // 2. INDIVIDUAL TEACHER TIMETABLE SHEETS
  // ─────────────────────────────────────────────────────────────
  const usedSheetNames = new Set<string>(['Faculty Load Summary']);

  sortedTeachers.forEach(teacher => {
    const sched = buildTeacherMasterSchedule(teacher.id, timetableMap, teachers);
    let rawSheetName = teacher.name.replace(/^(sir|miss|mr|mrs|ms|dr)\.?\s+/i, '');
    let sheetName = sanitizeSheetName(rawSheetName || teacher.name);
    let counter = 1;
    while (usedSheetNames.has(sheetName)) {
      sheetName = sanitizeSheetName(`${rawSheetName} (${counter})`);
      counter++;
    }
    usedSheetNames.add(sheetName);

    const teacherData: (string | number)[][] = [
      [schoolName.toUpperCase()],
      [`TEACHER WEEKLY TIMETABLE — ${teacher.name.toUpperCase()}`],
      [
        `Designation: ${teacher.designation || 'Teacher'}`,
        `Subjects: ${teacher.subjects.map(s => s.name).join(', ')}`,
        `Total Weekly Load: ${sched.totalTeachingPeriods} periods`,
        sched.clashCount > 0 ? `Status: ⚠️ ${sched.clashCount} Clashes` : 'Status: ✓ 100% Conflict Free',
      ],
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

    const standardTimes = [
      '8:15 AM – 8:50 AM',
      '8:50 AM – 9:30 AM',
      '9:30 AM – 10:10 AM',
      '10:10 AM – 10:50 AM',
      '11:20 AM – 12:00 PM',
      '12:00 PM – 12:40 PM',
      '12:40 PM – 01:20 PM',
    ];

    const fridayTimes = [
      '8:15 AM – 8:50 AM',
      '8:50 AM – 9:25 AM',
      '9:25 AM – 10:00 AM',
      '10:30 AM – 11:10 AM',
      '11:10 AM – 11:50 AM',
      '—',
      '—',
    ];

    [1, 2, 3, 4, 5, 6, 7].forEach(pNo => {
      // Recess break row after Period 4
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
        standardTimes[pNo - 1] || '—',
        fridayTimes[pNo - 1] || '—',
      ];

      DAY_KEYS.forEach(dKey => {
        const slots = sched.weeklySchedule[dKey].filter(s => s.periodNo === pNo);
        if (slots.length === 0) {
          row.push('Free (Staff Room)');
        } else if (slots.length === 1) {
          row.push(`Class ${slots[0].classLabel} — ${slots[0].subject}`);
        } else {
          // Clash
          row.push(`⚠️ CLASH: ${slots.map(s => `Class ${s.classLabel} (${s.subject})`).join(' + ')}`);
        }
      });

      teacherData.push(row);
    });

    // Day breakdown
    teacherData.push([]);
    teacherData.push(['DAILY WORKLOAD BREAKDOWN']);
    teacherData.push(['Day', 'Teaching Periods Assigned', 'Classes Taught']);

    DAY_KEYS.forEach(dKey => {
      const slots = sched.weeklySchedule[dKey];
      const classesOnDay = Array.from(new Set(slots.map(s => `Class ${s.classLabel}`)));
      teacherData.push([
        DAY_LABELS[dKey],
        slots.length,
        classesOnDay.join(', ') || 'None (Off / Free)',
      ]);
    });

    const sheet = XLSX.utils.aoa_to_sheet(teacherData);
    sheet['!cols'] = [
      { wch: 14 }, // Period
      { wch: 24 }, // Timing Mon-Thu
      { wch: 20 }, // Timing Fri
      { wch: 28 }, // Monday
      { wch: 28 }, // Tuesday
      { wch: 28 }, // Wednesday
      { wch: 28 }, // Thursday
      { wch: 28 }, // Friday
      { wch: 28 }, // Saturday
    ];

    XLSX.utils.book_append_sheet(wb, sheet, sheetName);
  });

  const fileName = `Teacher_Wise_Timetable_${schoolName.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, fileName);
  return fileName;
}

/**
 * Export Single Class Timetable to Excel (.xlsx)
 */
export function exportSingleClassToExcel(
  classEntry: TimetableClassEntry,
  teachers: Teacher[],
  schoolName = 'Peoples Secondary School'
) {
  const wb = XLSX.utils.book_new();
  const classData: (string | number)[][] = [
    [schoolName.toUpperCase()],
    [`WEEKLY TIMETABLE — CLASS ${classEntry.label.toUpperCase()}`],
    [`Class Teacher: ${classEntry.classTeacher || 'Unassigned'}`, '', '', `Academic Year: 2025–2026`],
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

  classEntry.periods.forEach(p => {
    if (p.no === 5) {
      classData.push([
        'RECESS',
        '10:50 AM – 11:20 AM',
        '10:00 AM – 10:30 AM',
        '☕ RECESS BREAK',
        '☕ RECESS BREAK',
        '☕ RECESS BREAK',
        '☕ RECESS BREAK',
        '☕ RECESS BREAK',
        '☕ RECESS BREAK',
      ]);
    }

    const row: (string | number)[] = [
      `Period ${p.no}`,
      `${p.start} – ${p.end}`,
      p.friStart && p.friEnd && p.friStart !== '—' ? `${p.friStart} – ${p.friEnd}` : '—',
    ];

    DAY_KEYS.forEach(dKey => {
      const cellRaw = p[dKey] || '—';
      const parsed = parseTimetableCell(cellRaw, classEntry.label, teachers);
      if (parsed.empty) {
        row.push('—');
      } else {
        const tNames = parsed.teachers.map(t => t.name).join(', ');
        row.push(tNames ? `${parsed.label} [${tNames}]` : parsed.label);
      }
    });

    classData.push(row);
  });

  const sheet = XLSX.utils.aoa_to_sheet(classData);
  sheet['!cols'] = [
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

  XLSX.utils.book_append_sheet(wb, sheet, `Class ${classEntry.label}`);
  const fileName = `Class_${classEntry.label}_Timetable_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, fileName);
  return fileName;
}

/**
 * Export Single Teacher Timetable to Excel (.xlsx)
 */
export function exportSingleTeacherToExcel(
  teacherId: string,
  timetableMap: Record<string, TimetableClassEntry>,
  teachers: Teacher[],
  schoolName = 'Peoples Secondary School'
) {
  const teacher = teachers.find(t => t.id === teacherId);
  if (!teacher) return;

  const wb = XLSX.utils.book_new();
  const sched = buildTeacherMasterSchedule(teacher.id, timetableMap, teachers);

  const teacherData: (string | number)[][] = [
    [schoolName.toUpperCase()],
    [`TEACHER WEEKLY TIMETABLE — ${teacher.name.toUpperCase()}`],
    [
      `Designation: ${teacher.designation || 'Teacher'}`,
      `Subjects: ${teacher.subjects.map(s => s.name).join(', ')}`,
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

  const standardTimes = [
    '8:15 AM – 8:50 AM',
    '8:50 AM – 9:30 AM',
    '9:30 AM – 10:10 AM',
    '10:10 AM – 10:50 AM',
    '11:20 AM – 12:00 PM',
    '12:00 PM – 12:40 PM',
    '12:40 PM – 01:20 PM',
  ];

  const fridayTimes = [
    '8:15 AM – 8:50 AM',
    '8:50 AM – 9:25 AM',
    '9:25 AM – 10:00 AM',
    '10:30 AM – 11:10 AM',
    '11:10 AM – 11:50 AM',
    '—',
    '—',
  ];

  [1, 2, 3, 4, 5, 6, 7].forEach(pNo => {
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
      standardTimes[pNo - 1] || '—',
      fridayTimes[pNo - 1] || '—',
    ];

    DAY_KEYS.forEach(dKey => {
      const slots = sched.weeklySchedule[dKey].filter(s => s.periodNo === pNo);
      if (slots.length === 0) {
        row.push('Free (Staff Room)');
      } else if (slots.length === 1) {
        row.push(`Class ${slots[0].classLabel} — ${slots[0].subject}`);
      } else {
        row.push(`⚠️ CLASH: ${slots.map(s => `Class ${s.classLabel} (${s.subject})`).join(' + ')}`);
      }
    });

    teacherData.push(row);
  });

  const sheet = XLSX.utils.aoa_to_sheet(teacherData);
  sheet['!cols'] = [
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

  XLSX.utils.book_append_sheet(wb, sheet, sanitizeSheetName(teacher.name));
  const fileName = `Teacher_${teacher.name.replace(/\s+/g, '_')}_Timetable_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, fileName);
  return fileName;
}

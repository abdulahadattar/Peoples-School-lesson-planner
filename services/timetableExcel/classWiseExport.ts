import * as XLSX from 'xlsx';
import { Teacher } from '../../types';
import { TimetableClassEntry, DAY_KEYS, DAY_LABELS } from '../timetable';
import { parseTimetableCell } from '../timetableConflictEngine';
import { sanitizeSheetName, CLASS_SHEET_COLS } from './helpers';

export function exportClassWiseTimetableToExcel(
  timetableMap: Record<string, TimetableClassEntry>,
  teachers: Teacher[],
  schoolName = 'Peoples Secondary School'
) {
  const wb = XLSX.utils.book_new();
  const classes = Object.values(timetableMap);

  const overviewData: (string | number)[][] = [
    [schoolName.toUpperCase()],
    ['INSTITUTIONAL TIMETABLE — MASTER CLASS OVERVIEW'],
    [`Generated on: ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} at ${new Date().toLocaleTimeString()}`],
    [],
    ['Class Section', 'Class Teacher', 'Day', 'Period 1', 'Period 2', 'Period 3', 'Period 4', 'RECESS', 'Period 5', 'Period 6', 'Period 7'],
  ];

  classes.forEach((cls) => {
    DAY_KEYS.forEach((dKey, dIdx) => {
      const row: (string | number)[] = [
        dIdx === 0 ? cls.label : '',
        dIdx === 0 ? cls.classTeacher || 'Unassigned' : '',
        DAY_LABELS[dKey],
      ];

      for (let pNo = 1; pNo <= 4; pNo++) {
        const period = cls.periods.find((p) => p.no === pNo);
        const cellRaw = period ? period[dKey] : '—';
        const parsed = parseTimetableCell(cellRaw || '—', cls.label, teachers);
        if (parsed.empty) {
          row.push('—');
        } else {
          const tNames = parsed.teachers.map((t) => t.name).join(', ');
          row.push(tNames ? `${parsed.label} (${tNames})` : parsed.label);
        }
      }

      row.push('☕ RECESS');

      for (let pNo = 5; pNo <= 7; pNo++) {
        const period = cls.periods.find((p) => p.no === pNo);
        const cellRaw = period ? period[dKey] : '—';
        const parsed = parseTimetableCell(cellRaw || '—', cls.label, teachers);
        if (parsed.empty) {
          row.push('—');
        } else {
          const tNames = parsed.teachers.map((t) => t.name).join(', ');
          row.push(tNames ? `${parsed.label} (${tNames})` : parsed.label);
        }
      }

      overviewData.push(row);
    });
    overviewData.push([]);
  });

  const overviewSheet = XLSX.utils.aoa_to_sheet(overviewData);
  overviewSheet['!cols'] = [
    { wch: 16 },
    { wch: 22 },
    { wch: 14 },
    { wch: 22 },
    { wch: 22 },
    { wch: 22 },
    { wch: 22 },
    { wch: 14 },
    { wch: 22 },
    { wch: 22 },
    { wch: 22 },
  ];
  XLSX.utils.book_append_sheet(wb, overviewSheet, 'Master Overview');

  classes.forEach((cls) => {
    const sheetName = sanitizeSheetName(`Class ${cls.label}`);
    const classData: (string | number)[][] = [
      [schoolName.toUpperCase()],
      [`WEEKLY TIMETABLE — CLASS ${cls.label.toUpperCase()}`],
      [`Class Teacher: ${cls.classTeacher || 'Unassigned'}`, '', '', `Academic Year: 2025–2026`],
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

    cls.periods.forEach((p) => {
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

      DAY_KEYS.forEach((dKey) => {
        const cellRaw = p[dKey] || '—';
        const parsed = parseTimetableCell(cellRaw, cls.label, teachers);
        if (parsed.empty) {
          row.push('—');
        } else {
          const tNames = parsed.teachers.map((t) => t.name).join(', ');
          row.push(tNames ? `${parsed.label} [${tNames}]` : parsed.label);
        }
      });

      classData.push(row);
    });

    classData.push([]);
    classData.push(['SUBJECT & TEACHER SUMMARY FOR CLASS ' + cls.label]);
    classData.push(['Subject', 'Assigned Teacher(s)', 'Periods Per Week']);

    const subjectStats: Record<string, { teachers: Set<string>; count: number }> = {};
    cls.periods.forEach((p) => {
      DAY_KEYS.forEach((dKey) => {
        const parsed = parseTimetableCell(p[dKey] || '—', cls.label, teachers);
        if (!parsed.empty) {
          const subKey = parsed.label;
          if (!subjectStats[subKey]) {
            subjectStats[subKey] = { teachers: new Set(), count: 0 };
          }
          subjectStats[subKey].count++;
          parsed.teachers.forEach((t) => subjectStats[subKey].teachers.add(t.name));
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
    sheet['!cols'] = CLASS_SHEET_COLS;
    XLSX.utils.book_append_sheet(wb, sheet, sheetName);
  });

  const fileName = `Class_Wise_Timetable_${schoolName.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, fileName);
  return fileName;
}

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

  classEntry.periods.forEach((p) => {
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

    DAY_KEYS.forEach((dKey) => {
      const cellRaw = p[dKey] || '—';
      const parsed = parseTimetableCell(cellRaw, classEntry.label, teachers);
      if (parsed.empty) {
        row.push('—');
      } else {
        const tNames = parsed.teachers.map((t) => t.name).join(', ');
        row.push(tNames ? `${parsed.label} [${tNames}]` : parsed.label);
      }
    });

    classData.push(row);
  });

  const sheet = XLSX.utils.aoa_to_sheet(classData);
  sheet['!cols'] = CLASS_SHEET_COLS;
  XLSX.utils.book_append_sheet(wb, sheet, `Class ${classEntry.label}`);
  const fileName = `Class_${classEntry.label}_Timetable_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, fileName);
  return fileName;
}

import { TimetableClassEntry, TimetablePeriod, TimetableData } from '../../services/timetable';
import { SchoolConfig } from '../../services/schoolConfigService';

const CLASS_ORDER = [
  'ECCE',
  'I-A',
  'I-B',
  'II',
  'III-A',
  'III-B',
  'IV-A',
  'IV-B',
  'V',
  'VI-A',
  'VI-B',
  'VII',
  'VIII',
  'IX',
  'X-A',
  'X-B',
  'XI',
  'XII',
];

export function syncClassesWithConfig(
  timetable: TimetableData | null,
  schoolConfig: SchoolConfig | null | undefined
): TimetableClassEntry[] {
  if (!timetable) return [];

  // Map existing timetable classes to schoolConfig overrides
  const updatedTimetableClasses: TimetableClassEntry[] = timetable.classes.map(c => {
    const norm = c.label.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    const match = schoolConfig?.classes?.find(sc => {
      const k1 = sc.classKey.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
      const k2 = sc.romanName.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
      return k1 === norm || k2 === norm;
    });

    if (match) {
      const isPlaceholder =
        !match.classTeacher ||
        match.classTeacher.toLowerCase() === 'unassigned' ||
        /^(miss\s+)?(fozia|hina|rabia|saima|nadia|farzana)$/i.test(match.classTeacher.trim());

      return {
        ...c,
        label: match.romanName || c.label,
        classTeacher: isPlaceholder ? c.classTeacher : match.classTeacher,
      };
    }
    return c;
  });

  // Reference standard period times from IV-A
  const basePeriods = updatedTimetableClasses[0]?.periods || [];

  // Append any configured primary classes (ECCE, I-A, I-B, II, III-A, III-B) not in timetable
  const additionalClasses: TimetableClassEntry[] = [];
  if (schoolConfig?.classes) {
    schoolConfig.classes.forEach(sc => {
      const norm = sc.classKey.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
      const exists = updatedTimetableClasses.some(c => {
        const cNorm = c.label.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
        return cNorm === norm;
      });

      if (!exists) {
        const primarySubjects =
          sc.subjects && sc.subjects.length > 0
            ? sc.subjects
            : ['English', 'Urdu', 'Sindhi', 'Mathematics', 'General Science', 'Islamiat', 'Arts & Drawing'];

        const isPlaceholder =
          !sc.classTeacher ||
          sc.classTeacher.toLowerCase() === 'unassigned' ||
          /^(miss\s+)?(fozia|hina|rabia|saima|nadia|farzana)$/i.test(sc.classTeacher.trim());
        const validTeacher = isPlaceholder ? '' : sc.classTeacher;

        const classTeacherPeriods: TimetablePeriod[] = basePeriods.map((p, pIdx) => {
          const subject = primarySubjects[pIdx % primarySubjects.length] || 'General Studies';
          const cellVal = validTeacher ? `${subject} / ${validTeacher}` : subject;

          return {
            no: p.no,
            start: p.start,
            end: p.end,
            friStart: p.friStart,
            friEnd: p.friEnd,
            mon: cellVal,
            tue: cellVal,
            wed: cellVal,
            thu: cellVal,
            fri: pIdx < 5 ? cellVal : '—',
            sat: '—',
          };
        });

        additionalClasses.push({
          label: sc.romanName || sc.displayName || sc.classKey,
          classTeacher: validTeacher || 'Unassigned',
          periods: classTeacherPeriods,
        });
      }
    });
  }

  const all = [...additionalClasses, ...updatedTimetableClasses].map(c => {
    const norm = c.label.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    const customMatch = schoolConfig?.customTimetable?.find(ct => {
      const ctNorm = ct.label.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
      return ctNorm === norm;
    });
    if (customMatch && customMatch.periods && customMatch.periods.length > 0) {
      return {
        ...c,
        classTeacher: customMatch.classTeacher || c.classTeacher,
        periods: customMatch.periods,
      };
    }
    return c;
  });

  all.sort((a, b) => {
    const idxA = CLASS_ORDER.indexOf(a.label);
    const idxB = CLASS_ORDER.indexOf(b.label);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return a.label.localeCompare(b.label);
  });

  return all;
}

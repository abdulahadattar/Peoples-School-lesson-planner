import { TimetableClassEntry, TimetablePeriod, TimetableData } from '../../services/timetable';
import { SchoolConfig } from '../../services/schoolConfigService';

const CLASS_ORDER = [
  'ECCE',
  'ECE',
  'I-A',
  'I-B',
  'I',
  'II',
  'III-A',
  'III-B',
  'III',
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

function baseClassNorm(raw: string): string {
  const norm = raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (norm === 'ECCE' || norm === 'ECE') return 'ECE';
  return norm;
}

function timetableCoversConfigClass(
  timetableLabels: string[],
  scKey: string,
  scRoman: string
): boolean {
  const n1 = baseClassNorm(scKey);
  const n2 = baseClassNorm(scRoman);
  return timetableLabels.some((lbl) => {
    const cNorm = baseClassNorm(lbl);
    if (cNorm === n1 || cNorm === n2) return true;
    // Match sectioned entries like IVA / IVB for config grade IV, VIA / VIB for VI, XA / XB for X
    if (/^[A-Z0-9]+$/.test(n1) && (cNorm === `${n1}A` || cNorm === `${n1}B` || cNorm === `${n1}C`)) return true;
    if (/^[A-Z0-9]+$/.test(n2) && (cNorm === `${n2}A` || cNorm === `${n2}B` || cNorm === `${n2}C`)) return true;
    return false;
  });
}

function normalizeTeacherName(name: string): string {
  if (/^miss\s+ftaima$/i.test(name.trim())) return 'Miss Fatima Qureshi';
  return name;
}

export function syncClassesWithConfig(
  timetable: TimetableData | null,
  schoolConfig: SchoolConfig | null | undefined
): TimetableClassEntry[] {
  if (!timetable) return [];

  // Map existing timetable classes to schoolConfig overrides
  const updatedTimetableClasses: TimetableClassEntry[] = timetable.classes.map(c => {
    const norm = baseClassNorm(c.label);
    const match = schoolConfig?.classes?.find(sc => {
      const k1 = baseClassNorm(sc.classKey);
      const k2 = baseClassNorm(sc.romanName);
      return k1 === norm || k2 === norm;
    });

    const cleanDefaultTeacher = normalizeTeacherName(c.classTeacher);

    if (match) {
      const isPlaceholder =
        !match.classTeacher ||
        match.classTeacher.toLowerCase() === 'unassigned' ||
        /^(miss\s+)?(fozia|hina|rabia|saima|nadia|farzana)$/i.test(match.classTeacher.trim());

      return {
        ...c,
        label: match.romanName || c.label,
        classTeacher: isPlaceholder ? cleanDefaultTeacher : normalizeTeacherName(match.classTeacher),
      };
    }
    return {
      ...c,
      classTeacher: cleanDefaultTeacher,
    };
  });

  // Reference standard period times from IV-A
  const basePeriods = updatedTimetableClasses[0]?.periods || [];
  const existingLabels = updatedTimetableClasses.map((c) => c.label);

  // Append only configured primary classes (ECE/ECCE, I, II, III) not already represented in timetable
  const additionalClasses: TimetableClassEntry[] = [];
  if (schoolConfig?.classes) {
    schoolConfig.classes.forEach(sc => {
      const exists = timetableCoversConfigClass(existingLabels, sc.classKey, sc.romanName);

      if (!exists) {
        const primarySubjects =
          sc.subjects && sc.subjects.length > 0
            ? sc.subjects
            : ['English', 'Urdu', 'Sindhi', 'Mathematics', 'General Science', 'Islamiat', 'Arts & Drawing'];

        const isPlaceholder =
          !sc.classTeacher ||
          sc.classTeacher.toLowerCase() === 'unassigned' ||
          /^(miss\s+)?(fozia|hina|rabia|saima|nadia|farzana)$/i.test(sc.classTeacher.trim());
        const validTeacher = isPlaceholder ? '' : normalizeTeacherName(sc.classTeacher);

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
    const norm = baseClassNorm(c.label);
    const customMatch = schoolConfig?.customTimetable?.find(ct => {
      const ctNorm = baseClassNorm(ct.label);
      return ctNorm === norm;
    });
    if (customMatch && customMatch.periods && customMatch.periods.length > 0) {
      return {
        ...c,
        classTeacher: normalizeTeacherName(customMatch.classTeacher || c.classTeacher),
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

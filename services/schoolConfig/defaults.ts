import { Teacher } from '../../types';
import teachersData from '../../data/teachers.json';
import { PeriodTiming, ClassTeacherConfig, SchoolConfig } from './types';
import {
  DEFAULT_CLASS_TEACHERS,
  DEFAULT_CLASS_SUBJECTS,
  buildDefaultClassConfigs,
  hydrateClassConfigMetadata,
  lookupClassSubjectsSeed,
  lookupClassTeacherSeed,
  normalizeTeacherDisplayName,
} from './classStructure';
import { getSeedBaselineTimetableClasses } from './timetableSeed';

export { DEFAULT_CLASS_TEACHERS, DEFAULT_CLASS_SUBJECTS };

export const DEFAULT_PERIOD_TIMINGS: PeriodTiming[] = [
  { no: 0, name: 'Morning Assembly', start: '07:45 AM', end: '08:15 AM', friStart: '07:45 AM', friEnd: '08:15 AM', durationMinutes: 30 },
  { no: 1, name: 'Period 1', start: '08:15 AM', end: '08:50 AM', friStart: '08:15 AM', friEnd: '08:50 AM', durationMinutes: 35 },
  { no: 2, name: 'Period 2', start: '08:50 AM', end: '09:30 AM', friStart: '08:50 AM', friEnd: '09:25 AM', durationMinutes: 40 },
  { no: 3, name: 'Period 3', start: '09:30 AM', end: '10:10 AM', friStart: '09:25 AM', friEnd: '10:00 AM', durationMinutes: 40 },
  { no: 4, name: 'Period 4', start: '10:10 AM', end: '10:50 AM', friStart: '10:30 AM', friEnd: '11:10 AM', durationMinutes: 40 },
  { no: -1, name: 'Break / Recess', start: '10:50 AM', end: '11:20 AM', friStart: '10:00 AM', friEnd: '10:30 AM', durationMinutes: 30, isBreak: true },
  { no: 5, name: 'Period 5', start: '11:20 AM', end: '12:00 PM', friStart: '11:10 AM', friEnd: '11:50 AM', durationMinutes: 40 },
  { no: 6, name: 'Period 6', start: '12:00 PM', end: '12:40 PM', friStart: 'Dismissal', friEnd: '11:50 AM', durationMinutes: 40 },
  { no: 7, name: 'Period 7', start: '12:40 PM', end: '01:20 PM', friStart: '—', friEnd: '—', durationMinutes: 40 },
];

export const DEFAULT_CLASS_CONFIGS: ClassTeacherConfig[] = buildDefaultClassConfigs();

export function getSeedBaselineTeachers(): Teacher[] {
  const raw = (teachersData as { teachers: Teacher[] }).teachers || [];
  return raw.map((t) => ({
    ...t,
    subjects: (t.subjects || []).map((s) => ({ ...s, sections: [...(s.sections || [])] })),
  }));
}

export const DEFAULT_SCHOOL_CONFIG: SchoolConfig = {
  schoolName: 'Peoples Higher Secondary School Jamshoro',
  affiliation: 'Affiliated with Ziauddin University Examination Board',
  academicSession: '2025-2026',
  principalName: "Ma'am Arsala",
  vicePrincipalName: "Ma'am Layla Abrejo",
  coordinatorName: 'Sir Abdul Razzaq / Miss Narjis',
  schoolAddress: 'Peoples Higher Secondary School, University Road, Jamshoro, Sindh',
  contactEmail: 'abdul7762ahad@gmail.com',
  schoolLogoUrl: '/logos/phssj.png',
  affiliationLogoUrl: '/logos/ziauddin-university.png',
  principalSignatureUrl: '/logos/principal-signature.png',
  enrollmentMode: 'manual',
  sheetEditingEnabled: true,
  sheetEditingLockedMessage: 'Google Sheet student editing is temporarily locked by School Administration. Contact Admin (abdul7762ahad@gmail.com) to request record modifications.',
  classes: DEFAULT_CLASS_CONFIGS,
  teachers: getSeedBaselineTeachers(),
  periods: DEFAULT_PERIOD_TIMINGS,
  customTimetable: getSeedBaselineTimetableClasses(),
  timetableNote: 'Regular Schedule: Mon-Thu 7 Periods (08:15 AM - 01:20 PM), Friday 5 Periods (08:15 AM - 11:50 AM)',
  updatedAt: Date.now(),
  updatedBy: 'System Baseline',
};

const PLACEHOLDER_NAMES_REGEX = /^(miss\s+)?(fozia|hina|rabia|saima|nadia|farzana)$/i;

export function sanitizeSchoolConfig(raw: Partial<SchoolConfig>): SchoolConfig {
  const base: SchoolConfig = {
    ...DEFAULT_SCHOOL_CONFIG,
    ...raw,
    schoolLogoUrl: raw.schoolLogoUrl !== undefined ? raw.schoolLogoUrl : DEFAULT_SCHOOL_CONFIG.schoolLogoUrl,
    affiliationLogoUrl: raw.affiliationLogoUrl !== undefined ? raw.affiliationLogoUrl : DEFAULT_SCHOOL_CONFIG.affiliationLogoUrl,
    principalSignatureUrl: raw.principalSignatureUrl !== undefined ? raw.principalSignatureUrl : DEFAULT_SCHOOL_CONFIG.principalSignatureUrl,
  };

  if (Array.isArray(raw.classes)) {
    base.classes = raw.classes.map((cls) => {
      let teacher = cls.classTeacher || 'Unassigned';
      if (PLACEHOLDER_NAMES_REGEX.test(teacher.trim())) {
        teacher = lookupClassTeacherSeed(cls.classKey, cls.romanName);
      }
      teacher = normalizeTeacherDisplayName(teacher);

      const isGeneric = !cls.subjects || cls.subjects.length === 0 || (
        cls.subjects.length === 7 &&
        cls.subjects.includes('Social Studies') &&
        !cls.subjects.includes('Physics') &&
        !cls.subjects.includes('ICT') &&
        ['IX', 'X-A', 'X-B', 'XI', 'XII', 'IV-A', 'IV-B', 'V', 'VI-A', 'VI-B', 'VII', 'VIII'].includes(cls.classKey)
      );

      const subjects = isGeneric
        ? [...lookupClassSubjectsSeed(cls.classKey, cls.romanName)]
        : cls.subjects;

      return hydrateClassConfigMetadata({
        ...cls,
        classTeacher: teacher,
        subjects,
      });
    });
  } else {
    base.classes = buildDefaultClassConfigs();
  }

  if (!Array.isArray(raw.periods) || raw.periods.length === 0) {
    base.periods = DEFAULT_PERIOD_TIMINGS;
  }

  // Keep Admin roster edits intact (even customized/reduced lists); only seed when missing.
  if (Array.isArray(raw.teachers) && (raw.teachers.length > 0 || Boolean(raw.updatedBy && raw.updatedBy !== 'System Baseline'))) {
    base.teachers = raw.teachers;
  } else {
    base.teachers = getSeedBaselineTeachers();
  }

  // Keep Admin timetable edits intact; only seed from bundled JSON when absent.
  if (Array.isArray(raw.customTimetable) && (raw.customTimetable.length > 0 || Boolean(raw.updatedBy && raw.updatedBy !== 'System Baseline'))) {
    base.customTimetable = raw.customTimetable;
  } else {
    base.customTimetable = getSeedBaselineTimetableClasses();
  }

  return base;
}

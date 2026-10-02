import { db, handleFirestoreError, OperationType } from './firebase';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { Teacher } from '../types';
import teachersData from '../data/teachers.json';
import { DEFAULT_GRADE_ENROLLMENTS, ClassEnrollment } from './attendanceService';
import type { TimetableClassEntry } from './timetable';

export interface PeriodTiming {
  no: number;
  name: string;
  start: string;
  end: string;
  friStart?: string;
  friEnd?: string;
  durationMinutes?: number;
  isBreak?: boolean;
}

export interface ClassTeacherConfig {
  classKey: string;
  displayName: string;
  romanName: string;
  classTeacher: string;
  enrolledBoys: number;
  enrolledGirls: number;
  totalEnrollment?: number;
  subjects?: string[];
}

export interface SchoolConfig {
  // Institutional Details
  schoolName: string;
  affiliation: string;
  academicSession: string;
  principalName: string;
  vicePrincipalName?: string;
  coordinatorName?: string;
  schoolAddress?: string;
  contactEmail?: string;

  // Attendance & Enrollment Mode
  enrollmentMode: 'manual' | 'google_sheet';

  // Google Sheet Edit Permissions Control
  sheetEditingEnabled: boolean;
  sheetEditingLockedMessage?: string;

  // Classes, Teachers & Timetable
  classes: ClassTeacherConfig[];
  teachers: Teacher[];
  periods: PeriodTiming[];
  customTimetable?: TimetableClassEntry[];
  timetableNote?: string;

  updatedAt: number;
  updatedBy: string;
}

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

/** Verified class teachers from institutional timetable and staff roster (no placeholders) */
export const DEFAULT_CLASS_TEACHERS: Record<string, string> = {
  ECCE: 'Unassigned',
  IA: 'Unassigned',
  'I-A': 'Unassigned',
  IB: 'Unassigned',
  'I-B': 'Unassigned',
  II: 'Unassigned',
  IIIA: 'Unassigned',
  'III-A': 'Unassigned',
  IIIB: 'Unassigned',
  'III-B': 'Unassigned',
  IVA: 'Miss Daniya',
  'IV-A': 'Miss Daniya',
  IVB: 'Miss Fatima Qureshi',
  'IV-B': 'Miss Fatima Qureshi',
  V: 'Sir Hashim',
  VIA: 'Miss Aneela',
  'VI-A': 'Miss Aneela',
  VIB: 'Sir Shuhban',
  'VI-B': 'Sir Shuhban',
  VII: 'Sir Atta Muhammad Joyo',
  VIII: 'Miss Madiha',
  IX: 'Sir Abdul Ahad',
  XA: 'Miss Asra',
  'X-A': 'Miss Asra',
  XB: 'Sir Muhammad Rajab',
  'X-B': 'Sir Muhammad Rajab',
  XI: 'Sir Bahadur',
  XII: 'Sir Kamran',
};

/** Accurate, complete curriculum subjects for every class in the institution */
export const DEFAULT_CLASS_SUBJECTS: Record<string, string[]> = {
  ECCE: ['Early Childhood Care & Education', 'English Phonics', 'Urdu Haroof', 'Basic Mathematics', 'General Knowledge', 'Rhymes & Arts'],
  'I-A': ['English', 'Urdu', 'Sindhi', 'Mathematics', 'General Science', 'Islamiat', 'Arts & Drawing'],
  IA: ['English', 'Urdu', 'Sindhi', 'Mathematics', 'General Science', 'Islamiat', 'Arts & Drawing'],
  'I-B': ['English', 'Urdu', 'Sindhi', 'Mathematics', 'General Science', 'Islamiat', 'Arts & Drawing'],
  IB: ['English', 'Urdu', 'Sindhi', 'Mathematics', 'General Science', 'Islamiat', 'Arts & Drawing'],
  II: ['English', 'Urdu', 'Sindhi', 'Mathematics', 'General Science', 'Islamiat', 'Social Studies', 'Arts & Drawing'],
  'III-A': ['English', 'Urdu', 'Sindhi', 'Mathematics', 'General Science', 'Islamiat', 'Social Studies', 'Computer', 'Arts & Drawing'],
  IIIA: ['English', 'Urdu', 'Sindhi', 'Mathematics', 'General Science', 'Islamiat', 'Social Studies', 'Computer', 'Arts & Drawing'],
  'III-B': ['English', 'Urdu', 'Sindhi', 'Mathematics', 'General Science', 'Islamiat', 'Social Studies', 'Computer', 'Arts & Drawing'],
  IIIB: ['English', 'Urdu', 'Sindhi', 'Mathematics', 'General Science', 'Islamiat', 'Social Studies', 'Computer', 'Arts & Drawing'],
  'IV-A': ['English', 'Urdu', 'Sindhi', 'Mathematics', 'Science', 'Islamiat', 'Social Studies', 'ICT', 'Art', 'Library', 'P.E'],
  IVA: ['English', 'Urdu', 'Sindhi', 'Mathematics', 'Science', 'Islamiat', 'Social Studies', 'ICT', 'Art', 'Library', 'P.E'],
  'IV-B': ['English', 'Urdu', 'Sindhi', 'Mathematics', 'Science', 'Islamiat', 'Social Studies', 'ICT', 'Art', 'Library', 'P.E'],
  IVB: ['English', 'Urdu', 'Sindhi', 'Mathematics', 'Science', 'Islamiat', 'Social Studies', 'ICT', 'Art', 'Library', 'P.E'],
  V: ['English', 'Urdu', 'Sindhi', 'Mathematics', 'Science', 'Islamiat', 'Social Studies', 'ICT', 'Art', 'Library', 'P.E'],
  'VI-A': ['English', 'Urdu', 'Sindhi', 'Mathematics', 'Science', 'Islamiat', 'Social Studies', 'ICT', 'Art', 'Library', 'P.E'],
  VIA: ['English', 'Urdu', 'Sindhi', 'Mathematics', 'Science', 'Islamiat', 'Social Studies', 'ICT', 'Art', 'Library', 'P.E'],
  'VI-B': ['English', 'Urdu', 'Sindhi', 'Mathematics', 'Science', 'Islamiat', 'Social Studies', 'ICT', 'Art', 'Library', 'P.E'],
  VIB: ['English', 'Urdu', 'Sindhi', 'Mathematics', 'Science', 'Islamiat', 'Social Studies', 'ICT', 'Art', 'Library', 'P.E'],
  VII: ['English', 'Urdu', 'Sindhi', 'Mathematics', 'Science', 'Islamiat', 'Social Studies', 'ICT', 'Art', 'Library', 'P.E'],
  VIII: ['English', 'Urdu', 'Sindhi', 'Mathematics', 'Science', 'Islamiat', 'Social Studies', 'ICT', 'Art', 'Library', 'P.E'],
  IX: ['English', 'Urdu', 'Sindhi', 'Mathematics', 'Physics', 'Chemistry', 'Biology', 'Islamiat', 'ICT'],
  'X-A': ['English', 'Sindhi', 'Asan Urdu', 'Mathematics', 'Physics', 'Chemistry', 'Biology', 'Pak Studies', 'ICT', 'Art', 'P.E'],
  XA: ['English', 'Sindhi', 'Asan Urdu', 'Mathematics', 'Physics', 'Chemistry', 'Biology', 'Pak Studies', 'ICT', 'Art', 'P.E'],
  'X-B': ['English', 'Urdu', 'Sindhi', 'Mathematics', 'Physics', 'Chemistry', 'Biology', 'Pak Studies', 'ICT', 'Art', 'P.E'],
  XB: ['English', 'Urdu', 'Sindhi', 'Mathematics', 'Physics', 'Chemistry', 'Biology', 'Pak Studies', 'ICT', 'Art', 'P.E'],
  XI: ['English', 'Urdu', 'Sindhi', 'Asan Urdu', 'Mathematics', 'Physics', 'Chemistry', 'Biology', 'Islamiat', 'ICT', 'Art', 'P.E'],
  XII: ['English', 'Urdu', 'Sindhi', 'Mathematics', 'Physics', 'Chemistry', 'Biology', 'Pak Studies', 'P.E'],
};

export const DEFAULT_CLASS_CONFIGS: ClassTeacherConfig[] = DEFAULT_GRADE_ENROLLMENTS.map((g) => ({
  classKey: g.classKey,
  romanName: g.romanName,
  displayName: `Class ${g.romanName}`,
  classTeacher: DEFAULT_CLASS_TEACHERS[g.classKey] || 'Unassigned',
  enrolledBoys: g.enrolledBoys,
  enrolledGirls: g.enrolledGirls,
  totalEnrollment: g.totalEnrollment || (g.enrolledBoys + g.enrolledGirls),
  subjects: DEFAULT_CLASS_SUBJECTS[g.classKey] || DEFAULT_CLASS_SUBJECTS[g.romanName] || [
    'English',
    'Urdu',
    'Sindhi',
    'Mathematics',
    'Science',
    'Islamiat',
  ],
}));

export const DEFAULT_SCHOOL_CONFIG: SchoolConfig = {
  schoolName: 'Peoples Higher Secondary School Jamshoro',
  affiliation: 'Affiliated with Ziauddin University Examination Board',
  academicSession: '2025-2026',
  principalName: "Ma'am Arsala",
  vicePrincipalName: "Ma'am Layla Abrejo",
  coordinatorName: 'Sir Abdul Razzaq / Miss Narjis',
  schoolAddress: 'Peoples Higher Secondary School, University Road, Jamshoro, Sindh',
  contactEmail: 'abdul7762ahad@gmail.com',
  enrollmentMode: 'manual',
  sheetEditingEnabled: true,
  sheetEditingLockedMessage: 'Google Sheet student editing is temporarily locked by School Administration. Contact Admin (abdul7762ahad@gmail.com) to request record modifications.',
  classes: DEFAULT_CLASS_CONFIGS,
  teachers: (teachersData as { teachers: Teacher[] }).teachers || [],
  periods: DEFAULT_PERIOD_TIMINGS,
  timetableNote: 'Regular Schedule: Mon-Thu 7 Periods (08:15 AM - 01:20 PM), Friday 5 Periods (08:15 AM - 11:50 AM)',
  updatedAt: Date.now(),
  updatedBy: 'System Baseline',
};

const PLACEHOLDER_NAMES_REGEX = /^(miss\s+)?(fozia|hina|rabia|saima|nadia|farzana)$/i;

/**
 * Sanitizes any cached config to purge placeholder names and ensure complete subject rosters.
 */
export function sanitizeSchoolConfig(raw: Partial<SchoolConfig>): SchoolConfig {
  const base: SchoolConfig = {
    ...DEFAULT_SCHOOL_CONFIG,
    ...raw,
  };

  // Clean classes: purge placeholders & fill accurate subjects
  if (Array.isArray(base.classes)) {
    base.classes = base.classes.map((cls) => {
      let teacher = cls.classTeacher || 'Unassigned';
      if (PLACEHOLDER_NAMES_REGEX.test(teacher.trim())) {
        teacher = DEFAULT_CLASS_TEACHERS[cls.classKey] || 'Unassigned';
      }
      if (teacher.toLowerCase() === 'miss ftaima') {
        teacher = 'Miss Fatima Qureshi';
      }

      // Check if subjects are missing or just the generic 7-subject placeholder
      const isGeneric = !cls.subjects || cls.subjects.length === 0 || (
        cls.subjects.length === 7 &&
        cls.subjects.includes('Social Studies') &&
        !cls.subjects.includes('Physics') &&
        !cls.subjects.includes('ICT') &&
        ['IX', 'X-A', 'X-B', 'XI', 'XII', 'IV-A', 'IV-B', 'V', 'VI-A', 'VI-B', 'VII', 'VIII'].includes(cls.classKey)
      );

      const subjects = isGeneric
        ? (DEFAULT_CLASS_SUBJECTS[cls.classKey] || DEFAULT_CLASS_SUBJECTS[cls.romanName] || cls.subjects)
        : cls.subjects;

      return {
        ...cls,
        classTeacher: teacher,
        subjects,
      };
    });
  } else {
    base.classes = DEFAULT_CLASS_CONFIGS;
  }

  // Ensure periods are present
  if (!Array.isArray(base.periods) || base.periods.length === 0) {
    base.periods = DEFAULT_PERIOD_TIMINGS;
  }

  // Ensure teachers are present
  if (!Array.isArray(base.teachers) || base.teachers.length === 0) {
    base.teachers = (teachersData as { teachers: Teacher[] }).teachers || [];
  }

  // Preserve custom timetable if defined
  if (Array.isArray(base.customTimetable) && base.customTimetable.length > 0) {
    base.customTimetable = base.customTimetable;
  }

  return base;
}

const SETTINGS_DOC_PATH = 'settings';
const SETTINGS_DOC_ID = 'school_config';

/**
 * Loads school config from Firestore with fallback to LocalStorage and Defaults.
 */
export async function getSchoolConfig(): Promise<SchoolConfig> {
  try {
    const docRef = doc(db, SETTINGS_DOC_PATH, SETTINGS_DOC_ID);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data() as Partial<SchoolConfig>;
      if (data && data.schoolName) {
        const merged = sanitizeSchoolConfig(data);
        localStorage.setItem('phssj_school_config', JSON.stringify(merged));
        return merged;
      }
    }
  } catch (error) {
    console.warn('Could not read school config from Firestore, falling back to local storage', error);
  }

  // Fallback to local storage
  try {
    const cached = localStorage.getItem('phssj_school_config');
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed && parsed.schoolName) {
        const sanitized = sanitizeSchoolConfig(parsed);
        localStorage.setItem('phssj_school_config', JSON.stringify(sanitized));
        return sanitized;
      }
    }
  } catch {}

  return DEFAULT_SCHOOL_CONFIG;
}

/**
 * Subscribes to real-time school config updates from Firestore.
 */
export function subscribeSchoolConfig(
  onUpdate: (config: SchoolConfig) => void,
  onError?: (err: unknown) => void
): () => void {
  const docRef = doc(db, SETTINGS_DOC_PATH, SETTINGS_DOC_ID);
  const unsubscribe = onSnapshot(
    docRef,
    (snap) => {
      if (snap.exists()) {
        const data = snap.data() as Partial<SchoolConfig>;
        if (data && data.schoolName) {
          const merged = sanitizeSchoolConfig(data);
          localStorage.setItem('phssj_school_config', JSON.stringify(merged));
          onUpdate(merged);
          return;
        }
      }
      onUpdate(DEFAULT_SCHOOL_CONFIG);
    },
    (err) => {
      console.warn('Firestore onSnapshot error on school_config', err);
      if (onError) onError(err);
      handleFirestoreError(err, OperationType.GET, `${SETTINGS_DOC_PATH}/${SETTINGS_DOC_ID}`);
    }
  );

  return unsubscribe;
}

/**
 * Saves school config to Firestore (Admin only) and persists locally.
 */
export async function saveSchoolConfig(config: SchoolConfig, userEmail?: string): Promise<void> {
  const updatedPayload: SchoolConfig = {
    ...config,
    updatedAt: Date.now(),
    updatedBy: userEmail || 'Admin',
  };

  // 1. Save main config
  try {
    const docRef = doc(db, SETTINGS_DOC_PATH, SETTINGS_DOC_ID);
    await setDoc(docRef, updatedPayload);
  } catch (error) {
    console.error('Failed to save school config to Firestore', error);
    handleFirestoreError(error, OperationType.WRITE, `${SETTINGS_DOC_PATH}/${SETTINGS_DOC_ID}`);
  }

  // 2. Backward-compatibility: Also update classEnrollments doc so daily attendance syncs
  try {
    const legacyEnrollments: ClassEnrollment[] = updatedPayload.classes.map((c) => ({
      classKey: c.classKey,
      romanName: c.romanName,
      displayName: c.displayName,
      enrolledBoys: c.enrolledBoys,
      enrolledGirls: c.enrolledGirls,
      totalEnrollment: c.totalEnrollment || (c.enrolledBoys + c.enrolledGirls),
    }));
    const enrollmentsDoc = doc(db, 'settings', 'classEnrollments');
    await setDoc(enrollmentsDoc, {
      enrollments: legacyEnrollments,
      updatedAt: Date.now(),
      updatedBy: userEmail || 'Admin',
    });
    localStorage.setItem('school_class_enrollments', JSON.stringify(legacyEnrollments));
  } catch (e) {
    console.warn('Legacy enrollments sync skipped', e);
  }

  // 3. Local storage persistence
  localStorage.setItem('phssj_school_config', JSON.stringify(updatedPayload));
}

/**
 * Resets school config to standard baseline.
 */
export async function resetSchoolConfigToDefaults(userEmail?: string): Promise<SchoolConfig> {
  const resetConfig: SchoolConfig = {
    ...DEFAULT_SCHOOL_CONFIG,
    updatedAt: Date.now(),
    updatedBy: userEmail ? `${userEmail} (Reset)` : 'Admin (Reset)',
  };
  await saveSchoolConfig(resetConfig, userEmail);
  return resetConfig;
}

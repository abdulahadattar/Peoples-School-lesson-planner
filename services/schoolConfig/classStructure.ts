import { DEFAULT_GRADE_ENROLLMENTS } from '../attendance/types';
import type { ClassTeacherConfig } from './types';

export const CLASS_DISPLAY_ORDER = [
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
] as const;

export const DEFAULT_CLASS_TEACHERS: Record<string, string> = {
  ECCE: 'Unassigned',
  ECE: 'Unassigned',
  'I-A': 'Unassigned',
  'I-B': 'Unassigned',
  I: 'Unassigned',
  II: 'Unassigned',
  'III-A': 'Unassigned',
  'III-B': 'Unassigned',
  III: 'Unassigned',
  'IV-A': 'Miss Daniya',
  'IV-B': 'Miss Fatima Qureshi',
  IV: 'Miss Daniya / Miss Fatima Qureshi',
  V: 'Sir Hashim',
  'VI-A': 'Miss Aneela',
  'VI-B': 'Sir Shuhban',
  VI: 'Miss Aneela / Sir Shuhban',
  VII: 'Sir Atta Muhammad Joyo',
  VIII: 'Miss Madiha',
  IX: 'Sir Abdul Ahad',
  'X-A': 'Miss Asra',
  'X-B': 'Sir Muhammad Rajab',
  X: 'Miss Asra / Sir Muhammad Rajab',
  XI: 'Sir Bahadur',
  XII: 'Sir Kamran',
};

const STANDARD_MIDDLE_SUBJECTS = [
  'English',
  'Urdu',
  'Sindhi',
  'Mathematics',
  'Science',
  'Islamiat',
  'Social Studies',
  'ICT',
  'Art',
  'Library',
  'P.E',
];

const PRIMARY_LOWER_SUBJECTS = [
  'English',
  'Urdu',
  'Sindhi',
  'Mathematics',
  'General Science',
  'Islamiat',
  'Arts & Drawing',
];

export const DEFAULT_CLASS_SUBJECTS: Record<string, string[]> = {
  ECCE: ['Early Childhood Care & Education', 'English Phonics', 'Urdu Haroof', 'Basic Mathematics', 'General Knowledge', 'Rhymes & Arts'],
  ECE: ['Early Childhood Care & Education', 'English Phonics', 'Urdu Haroof', 'Basic Mathematics', 'General Knowledge', 'Rhymes & Arts'],
  I: PRIMARY_LOWER_SUBJECTS,
  'I-A': PRIMARY_LOWER_SUBJECTS,
  'I-B': PRIMARY_LOWER_SUBJECTS,
  II: ['English', 'Urdu', 'Sindhi', 'Mathematics', 'General Science', 'Islamiat', 'Social Studies', 'Arts & Drawing'],
  III: ['English', 'Urdu', 'Sindhi', 'Mathematics', 'General Science', 'Islamiat', 'Social Studies', 'Computer', 'Arts & Drawing'],
  'III-A': ['English', 'Urdu', 'Sindhi', 'Mathematics', 'General Science', 'Islamiat', 'Social Studies', 'Computer', 'Arts & Drawing'],
  'III-B': ['English', 'Urdu', 'Sindhi', 'Mathematics', 'General Science', 'Islamiat', 'Social Studies', 'Computer', 'Arts & Drawing'],
  IV: STANDARD_MIDDLE_SUBJECTS,
  'IV-A': STANDARD_MIDDLE_SUBJECTS,
  'IV-B': STANDARD_MIDDLE_SUBJECTS,
  V: STANDARD_MIDDLE_SUBJECTS,
  VI: STANDARD_MIDDLE_SUBJECTS,
  'VI-A': STANDARD_MIDDLE_SUBJECTS,
  'VI-B': STANDARD_MIDDLE_SUBJECTS,
  VII: STANDARD_MIDDLE_SUBJECTS,
  VIII: STANDARD_MIDDLE_SUBJECTS,
  IX: ['English', 'Urdu', 'Sindhi', 'Mathematics', 'Physics', 'Chemistry', 'Biology', 'Islamiat', 'ICT'],
  X: ['English', 'Sindhi', 'Urdu', 'Mathematics', 'Physics', 'Chemistry', 'Biology', 'Pak Studies', 'ICT', 'Art', 'P.E'],
  'X-A': ['English', 'Sindhi', 'Asan Urdu', 'Mathematics', 'Physics', 'Chemistry', 'Biology', 'Pak Studies', 'ICT', 'Art', 'P.E'],
  'X-B': ['English', 'Urdu', 'Sindhi', 'Mathematics', 'Physics', 'Chemistry', 'Biology', 'Pak Studies', 'ICT', 'Art', 'P.E'],
  XI: ['English', 'Urdu', 'Sindhi', 'Asan Urdu', 'Mathematics', 'Physics', 'Chemistry', 'Biology', 'Islamiat', 'ICT', 'Art', 'P.E'],
  XII: ['English', 'Urdu', 'Sindhi', 'Mathematics', 'Physics', 'Chemistry', 'Biology', 'Pak Studies', 'P.E'],
};

interface GradeMetadataSeed {
  sections: string[];
  sectionTeachers?: Record<string, string>;
  roomNumber: string;
  capacity: number;
}

const DEFAULT_GRADE_STRUCTURE_META: Record<string, GradeMetadataSeed> = {
  ECE: { sections: ['ECE'], roomNumber: 'ECE Activity Room', capacity: 35 },
  I: { sections: ['I'], roomNumber: 'Room G-01', capacity: 70 },
  II: { sections: ['II'], roomNumber: 'Room G-02', capacity: 70 },
  III: { sections: ['III'], roomNumber: 'Room G-03', capacity: 70 },
  IV: {
    sections: ['IV-A', 'IV-B'],
    sectionTeachers: { 'IV-A': 'Miss Daniya', 'IV-B': 'Miss Fatima Qureshi' },
    roomNumber: 'Rooms G-04 / G-05',
    capacity: 80,
  },
  V: { sections: ['V'], roomNumber: 'Room G-06', capacity: 70 },
  VI: {
    sections: ['VI-A', 'VI-B'],
    sectionTeachers: { 'VI-A': 'Miss Aneela', 'VI-B': 'Sir Shuhban' },
    roomNumber: 'Rooms F-01 / F-02',
    capacity: 100,
  },
  VII: { sections: ['VII'], roomNumber: 'Room F-03', capacity: 105 },
  VIII: { sections: ['VIII'], roomNumber: 'Room F-04', capacity: 115 },
  IX: { sections: ['IX'], roomNumber: 'Room F-05', capacity: 95 },
  X: {
    sections: ['X-A', 'X-B'],
    sectionTeachers: { 'X-A': 'Miss Asra', 'X-B': 'Sir Muhammad Rajab' },
    roomNumber: 'Rooms S-01 / S-02',
    capacity: 60,
  },
  XI: { sections: ['XI'], roomNumber: 'Room S-03', capacity: 65 },
  XII: { sections: ['XII'], roomNumber: 'Room S-04', capacity: 45 },
};

export function normalizeTeacherDisplayName(name?: string): string {
  const trimmed = String(name || '').trim();
  if (!trimmed) return 'Unassigned';
  if (/^miss\s+ftaima$/i.test(trimmed)) return 'Miss Fatima Qureshi';
  return trimmed;
}

export function normalizeClassAliasKey(raw: string): string {
  const compact = String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/^CLASS\s+/i, '')
    .replace(/\s+/g, '');
  if (compact === 'ECCE') return 'ECE';
  const match = compact.match(/^([A-Z0-9]+?)-?([A-C])$/);
  if (match && /^(I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII)$/.test(match[1])) {
    return `${match[1]}-${match[2]}`;
  }
  return compact;
}

export function resolveClassOrderIndex(label: string): number {
  const idx = CLASS_DISPLAY_ORDER.indexOf(label as (typeof CLASS_DISPLAY_ORDER)[number]);
  if (idx !== -1) return idx;
  const alias = normalizeClassAliasKey(label);
  return CLASS_DISPLAY_ORDER.indexOf(alias as (typeof CLASS_DISPLAY_ORDER)[number]);
}

export function compareClassLabels(a: string, b: string): number {
  const ia = resolveClassOrderIndex(a);
  const ib = resolveClassOrderIndex(b);
  if (ia !== -1 && ib !== -1) return ia - ib;
  if (ia !== -1) return -1;
  if (ib !== -1) return 1;
  return a.localeCompare(b);
}

export function lookupClassTeacherSeed(classKey: string, romanName?: string): string {
  return (
    DEFAULT_CLASS_TEACHERS[classKey] ||
    DEFAULT_CLASS_TEACHERS[normalizeClassAliasKey(classKey)] ||
    (romanName ? DEFAULT_CLASS_TEACHERS[romanName] || DEFAULT_CLASS_TEACHERS[normalizeClassAliasKey(romanName)] : '') ||
    'Unassigned'
  );
}

export function lookupClassSubjectsSeed(classKey: string, romanName?: string): string[] {
  return (
    DEFAULT_CLASS_SUBJECTS[classKey] ||
    DEFAULT_CLASS_SUBJECTS[normalizeClassAliasKey(classKey)] ||
    (romanName ? DEFAULT_CLASS_SUBJECTS[romanName] || DEFAULT_CLASS_SUBJECTS[normalizeClassAliasKey(romanName)] : undefined) || [
      'English',
      'Urdu',
      'Sindhi',
      'Mathematics',
      'Science',
      'Islamiat',
    ]
  );
}

export function buildDefaultClassConfigs(): ClassTeacherConfig[] {
  return DEFAULT_GRADE_ENROLLMENTS.map((g) => {
    const meta = DEFAULT_GRADE_STRUCTURE_META[g.classKey];
    const total = g.totalEnrollment || g.enrolledBoys + g.enrolledGirls;
    return {
      classKey: g.classKey,
      romanName: g.romanName,
      displayName: `Class ${g.romanName}`,
      gradeLevel: g.romanName,
      section: meta?.sections?.length === 1 ? undefined : meta?.sections?.join(', '),
      sections: meta?.sections ? [...meta.sections] : [g.romanName],
      sectionTeachers: meta?.sectionTeachers ? { ...meta.sectionTeachers } : undefined,
      roomNumber: meta?.roomNumber || `Room ${g.romanName}`,
      capacity: meta?.capacity || Math.max(total + 5, 40),
      classTeacher: lookupClassTeacherSeed(g.classKey, g.romanName),
      enrolledBoys: g.enrolledBoys,
      enrolledGirls: g.enrolledGirls,
      totalEnrollment: total,
      subjects: [...lookupClassSubjectsSeed(g.classKey, g.romanName)],
    };
  });
}

export function resolveClassConfigForLabel(
  classes: ClassTeacherConfig[] | undefined,
  label: string
): ClassTeacherConfig | undefined {
  if (!Array.isArray(classes) || classes.length === 0) return undefined;
  const targetNorm = normalizeClassAliasKey(label);
  const baseGrade = targetNorm.split('-')[0];

  const exact = classes.find(
    (c) =>
      normalizeClassAliasKey(c.classKey) === targetNorm ||
      normalizeClassAliasKey(c.romanName) === targetNorm ||
      (Array.isArray(c.sections) && c.sections.some((s) => normalizeClassAliasKey(s) === targetNorm))
  );
  if (exact) return exact;

  return classes.find(
    (c) =>
      normalizeClassAliasKey(c.classKey) === baseGrade ||
      normalizeClassAliasKey(c.romanName) === baseGrade
  );
}

export function resolveClassTeacherForSection(
  classes: ClassTeacherConfig[] | undefined,
  sectionLabel: string,
  fallback = 'Unassigned'
): string {
  const match = resolveClassConfigForLabel(classes, sectionLabel);
  if (!match) return normalizeTeacherDisplayName(fallback);

  const normTarget = normalizeClassAliasKey(sectionLabel);
  if (match.sectionTeachers) {
    for (const [secKey, teacherName] of Object.entries(match.sectionTeachers)) {
      if (normalizeClassAliasKey(secKey) === normTarget && teacherName.trim()) {
        return normalizeTeacherDisplayName(teacherName);
      }
    }
  }

  // If classTeacher encodes per-section advisors separated by " / " matching sections order, pick the section match
  const rawTeacher = normalizeTeacherDisplayName(match.classTeacher);
  if (
    rawTeacher.includes('/') &&
    Array.isArray(match.sections) &&
    match.sections.length > 1
  ) {
    const secIdx = match.sections.findIndex((s) => normalizeClassAliasKey(s) === normTarget);
    const parts = rawTeacher.split('/').map((p) => p.trim()).filter(Boolean);
    if (secIdx >= 0 && secIdx < parts.length) {
      return normalizeTeacherDisplayName(parts[secIdx]);
    }
  }

  return rawTeacher !== 'Unassigned' ? rawTeacher : normalizeTeacherDisplayName(fallback);
}

export function getSectionIdentifiers(classes: ClassTeacherConfig[] | undefined): string[] {
  if (!Array.isArray(classes) || classes.length === 0) return [];
  const seen = new Set<string>();
  const out: string[] = [];

  for (const cls of classes) {
    const candidates =
      Array.isArray(cls.sections) && cls.sections.length > 0
        ? cls.sections
        : [cls.romanName || cls.classKey];

    for (const raw of candidates) {
      const clean = String(raw || '').trim();
      const norm = normalizeClassAliasKey(clean);
      if (!clean || seen.has(norm)) continue;
      seen.add(norm);
      out.push(clean);
    }
  }

  return out.sort(compareClassLabels);
}

export function hydrateClassConfigMetadata(cls: ClassTeacherConfig): ClassTeacherConfig {
  const seed = DEFAULT_GRADE_STRUCTURE_META[cls.classKey] || DEFAULT_GRADE_STRUCTURE_META[normalizeClassAliasKey(cls.classKey)];
  const gradeLevel = cls.gradeLevel || cls.romanName || cls.classKey;
  const sections =
    Array.isArray(cls.sections) && cls.sections.length > 0
      ? cls.sections
      : cls.section
        ? cls.section.split(',').map((s) => s.trim()).filter(Boolean)
        : seed?.sections
          ? [...seed.sections]
          : [cls.romanName || cls.classKey];
  const sectionTeachers = cls.sectionTeachers || (seed?.sectionTeachers ? { ...seed.sectionTeachers } : undefined);
  const boys = Math.max(0, Number(cls.enrolledBoys) || 0);
  const girls = Math.max(0, Number(cls.enrolledGirls) || 0);
  const total = Math.max(Number(cls.totalEnrollment) || 0, boys + girls);

  return {
    ...cls,
    gradeLevel,
    sections,
    sectionTeachers,
    roomNumber: cls.roomNumber ?? seed?.roomNumber,
    capacity: cls.capacity ?? seed?.capacity,
    totalEnrollment: total,
  };
}

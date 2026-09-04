/**
 * teacherRoster.ts — single source of truth for subject/class ↔ teacher matching.
 *
 * Everything that answers "which teacher teaches which subject, in which
 * class/section" lives here. Previously this knowledge was split across two
 * modules with two alias tables and two matching rules:
 *   - services/timetable.ts  (timetable cells → teachers, for the Live Monitor)
 *   - services/curriculumHelpers.ts (selector dropdown narrowing, for the forms)
 * They drifted, which produced the "Feroz lock" dropdown bug and the
 * misassigned-teacher bugs. Add new subjects, aliases, or class scopes here,
 * once.
 */
import { CurriculumClass, CurriculumSubject, Teacher } from '../types';
import { findClass, findSubject } from './curriculumHelpers';

/* ── Subject normalisation ─────────────────────────────────────── */

const SUBJECT_ALIASES: Record<string, string> = {
  maths: 'Mathematics',
  math: 'Mathematics',
  sci: 'Science',
  science: 'Science',
  's.s': 'Social Studies',
  's.st': 'Social Studies',
  's.s.t': 'Social Studies',
  sst: 'Social Studies',
  'social studies': 'Social Studies',
  islam: 'Islamiat',
  islamiat: 'Islamiat',
  islamiyat: 'Islamiat',
  art: 'Art',
  'p.e': 'P.E',
  pe: 'P.E',
  'eng lib': 'Library',
  lib: 'Library',
  library: 'Library',
  urdu: 'Urdu',
  sindhi: 'Sindhi',
  english: 'English',
  physics: 'Physics',
  chemistry: 'Chemistry',
  biology: 'Biology',
  ict: 'ICT',
  pst: 'Pak Studies',
  'p.st': 'Pak Studies',
  'pak studies': 'Pak Studies',
  'pakistan studies': 'Pak Studies',
};

/** Canonical subject label: alias + trim + lowercase + collapsed whitespace/underscores. */
export function normalizeSubject(raw: string): string {
  const key = raw.trim().toLowerCase().replace(/\s+/g, ' ').replace(/_/g, ' ');
  return SUBJECT_ALIASES[key] ?? raw.trim();
}

/** True when raw is a known subject label (vs a teacher's name in a timetable cell). */
export function isKnownSubject(raw: string): boolean {
  const key = raw.trim().toLowerCase().replace(/\s+/g, ' ').replace(/_/g, ' ');
  return key in SUBJECT_ALIASES;
}

/** Strict canonical equality (timetable cells ↔ roster subjects). */
export function subjectsEqual(a: string, b: string): boolean {
  return normalizeSubject(a) === normalizeSubject(b);
}

/**
 * Fuzzy-match a teacher's subject string against a curriculum subject
 * (handles "Physics" vs "physics", "General_Science" vs "General Science").
 */
export function subjectMatches(teacherSubject: string, curriculumSubject: CurriculumSubject): boolean {
  const ts = normalizeSubject(teacherSubject);
  const csName = normalizeSubject(curriculumSubject.name);
  const csId = normalizeSubject(curriculumSubject.id);
  return (
    ts === csName ||
    ts === csId ||
    csName.includes(ts) ||
    ts.includes(csName) ||
    ts.includes(csId)
  );
}

/* ── Section label → class id ──────────────────────────────────── */

const SECTION_TO_CLASS: Record<string, string> = {
  'IV-A': 'class4', 'IV-B': 'class4',
  V: 'class5',
  'VI-A': 'class6', 'VI-B': 'class6',
  VII: 'class7',
  VIII: 'class8',
  IX: 'class9',
  'X-A': 'class10', 'X-B': 'class10',
  XI: 'class11',
  XII: 'class12',
};

export function sectionToClassId(section: string): string | undefined {
  return SECTION_TO_CLASS[section];
}

/* ── Timetable resolution (Live Monitor) ───────────────────────── */

/** Match a timetable subject to a teacher from teachers.json. */
export function resolveTeacher(subject: string, section: string, teachers: Teacher[]): Teacher | null {
  const norm = normalizeSubject(subject);
  if (norm === 'Library') return null;
  const candidates = teachers.filter(t =>
    (t.subjects || []).some(s => subjectsEqual(s, norm)),
  );
  if (candidates.length === 0) return null;
  const classId = SECTION_TO_CLASS[section];
  const inSection = candidates.filter(t =>
    classId && (t.sectionLabels?.[classId] ?? []).includes(section),
  );
  const inClass = candidates.filter(t => classId && (t.classIds ?? []).includes(classId));
  // Strict by roster: only assign a teacher that teaches this class/section.
  // If teachers.json has no matching teacher, the slot shows as unassigned
  // rather than guessing a wrong teacher.
  return inSection[0] ?? inClass[0] ?? null;
}

function nameKey(raw: string): string {
  return raw.replace(/^(sir|miss|ma'am|mrs|mr)\s+/i, '').trim().toLowerCase();
}

/** Canonical roster name for a timetable/roster name (e.g. "MISS Aneela" → "Miss Aneela"). */
export function canonicalName(raw: string, teachers: Teacher[]): string {
  const key = nameKey(raw);
  const match = teachers.find(t => {
    const tn = nameKey(t.name);
    return tn === key || tn.startsWith(key + ' ');
  });
  return match?.name ?? raw.trim();
}

/** Some cells contain a teacher's name instead of a subject (e.g. "Feroz"). */
export function resolveByName(raw: string, teachers: Teacher[]): Teacher | null {
  const key = nameKey(raw);
  if (!key) return null;
  return (
    teachers.find(t => {
      const tn = nameKey(t.name);
      return tn === key || tn.startsWith(key + ' ') || tn.startsWith(key);
    }) ?? null
  );
}

/* ── Selector helpers (dropdown narrowing) ─────────────────────── */

/**
 * Teachers who teach the selected class AND subject (intersection).
 * Used to filter the teacher dropdown as the user narrows down class/subject.
 */
export function filterTeachersBySelection(
  teachers: Teacher[],
  classId: string,
  subjectId: string,
  classes: CurriculumClass[],
): Teacher[] {
  let list = teachers;
  if (classId) list = list.filter(t => t.classIds?.includes(classId));
  if (subjectId) {
    const subject = findSubject(classes, classId, subjectId);
    list = list.filter(t =>
      t.subjects.some(ts =>
        subject ? subjectMatches(ts, subject) : ts.toLowerCase() === subjectId.toLowerCase(),
      ),
    );
  }
  return list;
}

/**
 * Teacher dropdown options: the FULL roster with teachers matching the
 * selected class/subject listed first (so narrowing never locks the list
 * to a single teacher and the user can always switch).
 */
export function teacherOptions(
  teachers: Teacher[],
  classId: string,
  subjectId: string,
  classes: CurriculumClass[],
): Teacher[] {
  const matches = filterTeachersBySelection(teachers, classId, subjectId, classes);
  if (matches.length === teachers.length) return teachers;
  const matchedIds = new Set(matches.map(t => t.id));
  return [...matches, ...teachers.filter(t => !matchedIds.has(t.id))];
}

/** Classes a teacher teaches (or all classes when the teacher has no classIds). */
export function classesForTeacher(classes: CurriculumClass[], teacher: Teacher | null): CurriculumClass[] {
  if (teacher?.classIds?.length) {
    return classes.filter(c => teacher.classIds!.includes(c.id));
  }
  return classes;
}

/** Subjects available for a class, optionally narrowed to those the teacher teaches. */
export function subjectsForTeacher(
  classes: CurriculumClass[],
  classId: string,
  teacher: Teacher | null,
): CurriculumSubject[] {
  const classSubjects = findClass(classes, classId)?.subjects || [];
  if (!teacher) return classSubjects;
  return classSubjects.filter(s => teacher.subjects.some(ts => subjectMatches(ts, s)));
}

export interface AutoSelectResult {
  classId: string;
  subjectId: string;
}

/**
 * When a teacher is chosen, pick sensible default class + subject:
 * - the teacher's single class if they teach exactly one
 * - their single subject (matched to the curriculum) if they teach exactly one
 * Returns empty strings when no confident default exists.
 */
export function autoSelectForTeacher(
  teacher: Teacher,
  classes: CurriculumClass[],
  currentClassId: string,
): AutoSelectResult {
  const teacherClasses = teacher.classIds || [];

  let subjectId = '';
  if (teacher.subjects.length === 1) {
    const classIds = teacherClasses.length > 0 ? teacherClasses : currentClassId ? [currentClassId] : [];
    for (const cid of classIds) {
      const cls = findClass(classes, cid);
      const match = cls?.subjects.find(s => subjectMatches(teacher.subjects[0], s));
      if (match) {
        subjectId = match.id;
        break;
      }
    }
  }

  let classId = '';
  if (subjectId) {
    const classForSubject = teacherClasses.find(cid =>
      findClass(classes, cid)?.subjects.some(s => s.id === subjectId),
    );
    classId = classForSubject || (teacherClasses.length === 1 ? teacherClasses[0] : '');
  } else if (teacherClasses.length === 1) {
    classId = teacherClasses[0];
  }

  return { classId, subjectId };
}
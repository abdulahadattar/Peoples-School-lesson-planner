import { CurriculumClass, CurriculumSubject, Teacher } from '../types';

/** Extract the numeric grade from a class id like "class9" → 9. */
export function getGradeNumber(classId: string): number {
  return parseInt(classId.replace('class', ''), 10);
}

/** "class9" → "Grade 9". */
export function getGradeName(classId: string): string {
  return `Grade ${getGradeNumber(classId)}`;
}

/** Sort classes numerically (class1, class2, ..., class12). */
export function sortClassesByGrade(classes: CurriculumClass[]): CurriculumClass[] {
  return [...classes].sort((a, b) => getGradeNumber(a.id) - getGradeNumber(b.id));
}

export function findClass(classes: CurriculumClass[], classId: string): CurriculumClass | undefined {
  return classes.find(c => c.id === classId);
}

export function findSubject(
  classes: CurriculumClass[],
  classId: string,
  subjectId: string
): CurriculumSubject | undefined {
  return findClass(classes, classId)?.subjects.find(s => s.id === subjectId);
}

/**
 * Fuzzy-match a teacher's subject string against a curriculum subject
 * (handles "Physics" vs "physics", "General_Science" vs "General Science").
 */
export function subjectMatchesTeacher(
  teacherSubject: string,
  curriculumSubject: { id: string; name: string }
): boolean {
  const ts = teacherSubject.toLowerCase();
  const csName = curriculumSubject.name.toLowerCase();
  const csId = curriculumSubject.id.toLowerCase();
  return (
    ts === csName ||
    ts === csId ||
    csName.includes(ts) ||
    ts.includes(csName) ||
    ts.includes(csId.replace('_', ' '))
  );
}

/**
 * Teachers who teach the selected class AND subject (intersection).
 * Used to filter the teacher dropdown as the user narrows down class/subject.
 */
export function filterTeachersBySelection(
  teachers: Teacher[],
  classId: string,
  subjectId: string,
  classes: CurriculumClass[]
): Teacher[] {
  let list = teachers;
  if (classId) list = list.filter(t => t.classIds?.includes(classId));
  if (subjectId) {
    const subject = findSubject(classes, classId, subjectId);
    list = list.filter(t =>
      t.subjects.some(ts =>
        subject ? subjectMatchesTeacher(ts, subject) : ts.toLowerCase() === subjectId.toLowerCase()
      )
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
  classes: CurriculumClass[]
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

/**
 * Subjects available for a class, optionally narrowed to those the teacher teaches.
 */
export function subjectsForTeacher(
  classes: CurriculumClass[],
  classId: string,
  teacher: Teacher | null
): CurriculumSubject[] {
  const classSubjects = findClass(classes, classId)?.subjects || [];
  if (!teacher) return classSubjects;
  return classSubjects.filter(s => teacher.subjects.some(ts => subjectMatchesTeacher(ts, s)));
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
  currentClassId: string
): AutoSelectResult {
  const teacherClasses = teacher.classIds || [];

  let subjectId = '';
  if (teacher.subjects.length === 1) {
    const classIds = teacherClasses.length > 0 ? teacherClasses : currentClassId ? [currentClassId] : [];
    for (const cid of classIds) {
      const cls = findClass(classes, cid);
      const match = cls?.subjects.find(s => subjectMatchesTeacher(teacher.subjects[0], s));
      if (match) {
        subjectId = match.id;
        break;
      }
    }
  }

  let classId = '';
  if (subjectId) {
    const classForSubject = teacherClasses.find(cid =>
      findClass(classes, cid)?.subjects.some(s => s.id === subjectId)
    );
    classId = classForSubject || (teacherClasses.length === 1 ? teacherClasses[0] : '');
  } else if (teacherClasses.length === 1) {
    classId = teacherClasses[0];
  }

  return { classId, subjectId };
}
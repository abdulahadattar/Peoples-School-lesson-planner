import { CurriculumClass, CurriculumSubject } from '../types';

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

/**
 * Find a class by its ID in the curriculum array.
 */
export function findClass(classes: CurriculumClass[], classId: string): CurriculumClass | undefined {
  return classes.find(c => c.id === classId);
}

/**
 * Find a subject by class and subject IDs.
 */
export function findSubject(
  classes: CurriculumClass[],
  classId: string,
  subjectId: string
): CurriculumSubject | undefined {
  return findClass(classes, classId)?.subjects.find(s => s.id === subjectId);
}

/**
 * Format assigned class IDs such as "class9", "class10-A", or roman numerals into concise display labels.
 */
export function formatAssignedClassLabel(rawClassId: string): string {
  const cleaned = rawClassId.trim();
  const match = cleaned.match(/^class(\d+)(?:-([a-zA-Z0-9]+))?$/i);
  if (match) {
    const gradeNum = match[1];
    const section = match[2] ? `-${match[2].toUpperCase()}` : '';
    return `Class ${gradeNum}${section}`;
  }
  return cleaned.startsWith('Class ') ? cleaned : `Class ${cleaned}`;
}
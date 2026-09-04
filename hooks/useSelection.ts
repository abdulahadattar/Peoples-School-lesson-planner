/**
 * useSelection.ts — single owner for the class/subject/chapter/teacher selection.
 *
 * Both forms (PaperPanel for exam papers, SubjectSelector for lesson plans)
 * previously kept their own copies of this triad plus duplicated change
 * handlers — a change to "what happens when the teacher/class/subject
 * changes" had to be made twice, and the two copies drifted (the "Feroz lock"
 * bug lived exactly there). This hook owns the selection, the derived option
 * lists, and the re-alignment rules, and returns one API both forms use.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { CurriculumChapter, CurriculumClass, CurriculumSubject, Teacher } from '../types';
import { curriculumData } from '../curriculum';
import { sortClassesByGrade } from '../services/curriculumHelpers';
import {
  autoSelectForTeacher,
  classesForTeacher,
  subjectsForTeacher,
  teacherOptions,
} from '../services/teacherRoster';

export interface SelectionApi {
  // state
  classId: string;
  subjectId: string;
  chapterId: string;
  teacherId: string;
  teacherName: string;
  schoolName: string;
  // derived
  teacher: Teacher | null;
  /** Full sorted class list (for dropdowns when no teacher is selected). */
  classes: CurriculumClass[];
  teacherChoices: Teacher[];
  availableClasses: CurriculumClass[];
  availableSubjects: CurriculumSubject[];
  selectedClass: CurriculumClass | null;
  selectedSubject: CurriculumSubject | null;
  selectedChapter: CurriculumChapter | null;
  chapters: CurriculumChapter[];
  // actions
  handleClassChange: (id: string) => void;
  handleSubjectChange: (id: string) => void;
  handleChapterChange: (id: string) => void;
  handleTeacherChange: (id: string) => void;
  setSchoolName: (name: string) => void;
  /** Clear the class/subject/chapter triad (keeps the teacher). */
  reset: () => void;
}

interface UseSelectionOptions {
  teachers: Teacher[];
  /** Fired after the chapter changes (used to clear stale SLO selections). */
  onChapterChange?: (chapterId: string) => void;
}

const DEFAULT_TEACHER_NAME = 'Abdul Ahad';
const DEFAULT_SCHOOL_NAME = 'Peoples Higher Secondary School Jamshoro';

export function useSelection({ teachers, onChapterChange }: UseSelectionOptions): SelectionApi {
  const [classId, setClassId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [chapterId, setChapterId] = useState('');
  const [teacherId, setTeacherId] = useState('');
  const [teacherName, setTeacherName] = useState(DEFAULT_TEACHER_NAME);
  const [schoolName, setSchoolName] = useState(DEFAULT_SCHOOL_NAME);

  const classes = useMemo(() => sortClassesByGrade(curriculumData.classes), []);
  const teacher = useMemo(() => teachers.find(t => t.id === teacherId) || null, [teachers, teacherId]);

  // Full roster (matching class/subject listed first) so the teacher can
  // always be switched without clearing the class and subject first.
  const teacherChoices = useMemo(
    () => teacherOptions(teachers, classId, subjectId, classes),
    [teachers, classId, subjectId, classes],
  );
  const availableClasses = useMemo(() => classesForTeacher(classes, teacher), [classes, teacher]);
  const availableSubjects = useMemo(
    () => subjectsForTeacher(classes, classId, teacher),
    [classes, classId, teacher],
  );

  const selectedClass = useMemo(() => classes.find(c => c.id === classId) || null, [classes, classId]);
  const selectedSubject = useMemo(
    () => availableSubjects.find(s => s.id === subjectId) || null,
    [availableSubjects, subjectId],
  );
  const chapters = useMemo(() => selectedSubject?.chapters || [], [selectedSubject]);
  const selectedChapter = useMemo(
    () => chapters.find(c => c.id === chapterId) || null,
    [chapters, chapterId],
  );

  // Auto-select the first teacher once the roster loads (matches the old
  // App-level behavior), but never re-select after a deliberate deselect.
  const rosterInitialized = useRef(false);
  useEffect(() => {
    if (rosterInitialized.current || teachers.length === 0) return;
    rosterInitialized.current = true;
    const first = teachers[0];
    setTeacherId(first.id);
    setTeacherName(first.name);
    setSchoolName(first.schoolName);
  }, [teachers]);

  const deselectTeacher = () => {
    setTeacherId('');
    setTeacherName('');
    setSchoolName('');
  };

  const handleClassChange = (newClassId: string) => {
    setClassId(newClassId);
    setSubjectId('');
    setChapterId('');
    // Unrestricted teachers (no classIds) teach everywhere — keep them selected.
    if (
      teacher &&
      newClassId &&
      teacher.classIds &&
      teacher.classIds.length > 0 &&
      !teacher.classIds.includes(newClassId)
    ) {
      deselectTeacher();
    }
  };

  const handleSubjectChange = (newSubjectId: string) => {
    setSubjectId(newSubjectId);
    setChapterId('');
    // The subject dropdown is teacher-narrowed when a teacher is selected;
    // only deselect if the new subject genuinely isn't teachable by them
    // (teachers with no subject list are unrestricted — keep them selected).
    if (
      teacher &&
      newSubjectId &&
      teacher.subjects &&
      teacher.subjects.length > 0 &&
      !subjectsForTeacher(classes, classId, teacher).some(s => s.id === newSubjectId)
    ) {
      deselectTeacher();
    }
  };

  const handleChapterChange = (newChapterId: string) => {
    setChapterId(newChapterId);
    onChapterChange?.(newChapterId);
  };

  const handleTeacherChange = (newTeacherId: string) => {
    setTeacherId(newTeacherId);
    const nextTeacher = teachers.find(t => t.id === newTeacherId);
    if (!nextTeacher) {
      setTeacherName('');
      setSchoolName('');
      setChapterId('');
      setSubjectId('');
      onChapterChange?.('');
      return;
    }

    setTeacherName(nextTeacher.name);
    setSchoolName(nextTeacher.schoolName);

    setChapterId('');
    const auto = autoSelectForTeacher(nextTeacher, classes, classId);

    // Unrestricted teachers (no classIds) keep the current class; otherwise
    // keep the current class when they teach it, else move to their auto/first.
    const nextClassId =
      !nextTeacher.classIds || nextTeacher.classIds.length === 0
        ? classId
        : classId && (nextTeacher.classIds ?? []).includes(classId)
          ? classId
          : auto.classId || nextTeacher.classIds?.[0] || '';
    setClassId(nextClassId);

    // Keep the current subject only if this teacher teaches it in that class;
    // otherwise prefer the teacher's auto subject (single-subject teachers),
    // else clear it so the teacher-narrowed subject list drives the choice.
    // Teachers with no subject list are unrestricted — keep the subject.
    const teachable = subjectsForTeacher(classes, nextClassId, nextTeacher);
    const nextSubjectId =
      !nextTeacher.subjects || nextTeacher.subjects.length === 0
        ? subjectId
        : teachable.some(s => s.id === subjectId) && subjectId
          ? subjectId
          : auto.subjectId && teachable.some(s => s.id === auto.subjectId)
            ? auto.subjectId
            : '';
    setSubjectId(nextSubjectId);
  };

  const reset = () => {
    setClassId('');
    setSubjectId('');
    setChapterId('');
  };

  return {
    classId,
    subjectId,
    chapterId,
    teacherId,
    teacherName,
    schoolName,
    teacher,
    classes,
    teacherChoices,
    availableClasses,
    availableSubjects,
    selectedClass,
    selectedSubject,
    selectedChapter,
    chapters,
    handleClassChange,
    handleSubjectChange,
    handleChapterChange,
    handleTeacherChange,
    setSchoolName,
    reset,
  };
}
import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import { isHsscGrade } from '../../services/marksheet/calculations';
import {
  makePendingEditDocId,
  type MarksheetPendingEdit,
  mergePendingEditDelta,
} from '../../services/marksheet/pendingEditsRepository';
import { makeMarkEntryKey, saveMarksheetEntries } from '../../services/marksheet/storage';
import type {
  MarksheetExamType,
  MarksheetGradeLevel,
  OptionalElective,
  OptionalLanguage,
  StudentMarkEntry,
  SubjectKey,
} from '../../services/marksheet/types';

export interface StudentMutationMeta {
  grNo: string;
  studentName: string;
  fatherName?: string;
  gradeLevel: MarksheetGradeLevel;
  section?: string;
}

export function useMarksheetEditing(params: {
  examType: MarksheetExamType;
  setEntriesMap: Dispatch<SetStateAction<Record<string, StudentMarkEntry>>>;
  pendingEdits: MarksheetPendingEdit[];
  currentUser: { uid: string; displayName?: string | null; email?: string | null } | null;
  getBaseEntry: (grNo: string, examType: MarksheetExamType) => StudentMarkEntry | undefined;
  persistPendingEdit: (edit: MarksheetPendingEdit, syncToFirestore?: boolean) => Promise<void>;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}) {
  const {
    examType,
    setEntriesMap,
    pendingEdits,
    currentUser,
    getBaseEntry,
    persistPendingEdit,
    showToast,
  } = params;

  const saveTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const pendingDraftsRef = useRef<Record<string, MarksheetPendingEdit>>({});

  useEffect(() => {
    const timers = saveTimersRef.current;
    return () => {
      Object.keys(timers).forEach((k) => clearTimeout(timers[k]));
    };
  }, []);

  const recordStudentEditDelta = useCallback(
    (
      studentMeta: { grNo: string; studentName: string; gradeLevel: MarksheetGradeLevel },
      patch: {
        changedScores?: Partial<Record<SubjectKey, number | 'A' | null>>;
        optionalLanguage?: OptionalLanguage;
        optionalElective?: OptionalElective;
      }
    ) => {
      const docId = makePendingEditDocId(examType, studentMeta.grNo);
      const existing =
        pendingDraftsRef.current[docId] || pendingEdits.find((e) => e.docId === docId);
      const baseEntry = getBaseEntry(studentMeta.grNo, examType);

      const nextPending = mergePendingEditDelta(existing, {
        grNo: studentMeta.grNo,
        studentName: studentMeta.studentName,
        gradeLevel: studentMeta.gradeLevel,
        examType,
        changedScores: patch.changedScores,
        baseScores: baseEntry?.scores,
        optionalLanguage: patch.optionalLanguage,
        optionalElective: patch.optionalElective,
        author: {
          uid: currentUser?.uid || 'local',
          name: currentUser?.displayName || null,
          email: currentUser?.email || null,
        },
      });
      pendingDraftsRef.current[docId] = nextPending;

      void persistPendingEdit(nextPending, false);
      if (saveTimersRef.current[docId]) {
        clearTimeout(saveTimersRef.current[docId]);
      }
      saveTimersRef.current[docId] = setTimeout(() => {
        delete saveTimersRef.current[docId];
        const latest = pendingDraftsRef.current[docId] || nextPending;
        void persistPendingEdit(latest, true).catch((err) => {
          console.warn('[marksheets] Failed syncing pending edit to Firestore:', err);
          showToast(
            'Saved locally on this device, but could not upload to school storage.',
            'error'
          );
        });
      }, 400);
    },
    [currentUser, examType, getBaseEntry, pendingEdits, persistPendingEdit, showToast]
  );

  const applyStudentMutation = useCallback(
    (
      studentMeta: StudentMutationMeta,
      updater: (prev: StudentMarkEntry) => {
        nextEntry: StudentMarkEntry;
        changedScores?: Partial<Record<SubjectKey, number | 'A' | null>>;
        optionalLanguage?: OptionalLanguage;
        optionalElective?: OptionalElective;
      }
    ) => {
      const key = makeMarkEntryKey(studentMeta.grNo, examType);
      setEntriesMap((prev) => {
        const current: StudentMarkEntry = prev[key] || {
          grNo: studentMeta.grNo,
          studentName: studentMeta.studentName,
          fatherName: studentMeta.fatherName,
          currentClass: studentMeta.gradeLevel,
          section: studentMeta.section,
          scores: {},
          examType,
        };
        const { nextEntry, changedScores, optionalLanguage, optionalElective } = updater(current);
        const stamped = { ...nextEntry, updatedAt: Date.now() };
        const nextMap = { ...prev, [key]: stamped };
        saveMarksheetEntries(nextMap);
        recordStudentEditDelta(studentMeta, {
          changedScores,
          optionalLanguage,
          optionalElective,
        });
        return nextMap;
      });
    },
    [examType, recordStudentEditDelta, setEntriesMap]
  );

  const updateStudentSubjectScore = useCallback(
    (studentMeta: StudentMutationMeta, subject: SubjectKey, rawValue: string) => {
      applyStudentMutation(studentMeta, (prev) => {
        const trimmed = rawValue.trim();
        let nextVal: number | 'A' | null = null;
        if (trimmed.toUpperCase() === 'A') nextVal = 'A';
        else if (trimmed !== '') {
          const parsed = Number(trimmed);
          if (Number.isFinite(parsed) && parsed >= 0) nextVal = parsed;
        }

        let optionalLanguage: OptionalLanguage | undefined;
        let optionalElective: OptionalElective | undefined;
        const hasVal = nextVal === 'A' || (typeof nextVal === 'number' && nextVal >= 0);

        if (hasVal) {
          if (subject === 'sindhi' && !prev.scores?.urdu) optionalLanguage = 'Sindhi';
          if (subject === 'urdu' && !prev.scores?.sindhi) optionalLanguage = 'Urdu';
          if (subject === 'ict' && !isHsscGrade(studentMeta.gradeLevel) && !prev.scores?.biology) {
            optionalElective = 'ICT';
          }
          if (
            subject === 'mathematics' &&
            isHsscGrade(studentMeta.gradeLevel) &&
            !prev.scores?.biology
          ) {
            optionalElective = 'Mathematics';
          }
          if (subject === 'biology') {
            const siblingVal = isHsscGrade(studentMeta.gradeLevel)
              ? prev.scores?.mathematics
              : prev.scores?.ict;
            if (!siblingVal) optionalElective = 'Biology';
          }
        }

        return {
          nextEntry: {
            ...prev,
            ...(optionalLanguage ? { optionalLanguage } : {}),
            ...(optionalElective ? { optionalElective } : {}),
            scores: { ...prev.scores, [subject]: nextVal },
          },
          changedScores: { [subject]: nextVal },
          optionalLanguage,
          optionalElective,
        };
      });
    },
    [applyStudentMutation]
  );

  const updateStudentOptionals = useCallback(
    (
      studentMeta: StudentMutationMeta,
      patch: { optionalLanguage?: OptionalLanguage; optionalElective?: OptionalElective }
    ) => {
      applyStudentMutation(studentMeta, (prev) => ({
        nextEntry: { ...prev, ...patch },
        optionalLanguage: patch.optionalLanguage,
        optionalElective: patch.optionalElective,
      }));
    },
    [applyStudentMutation]
  );

  return {
    updateStudentSubjectScore,
    updateStudentOptionals,
  };
}

import React, { useState, useMemo } from 'react';
import { Teacher } from '../../../types';
import {
  TimetableClassEntry,
  DayKey,
} from '../../../services/timetable';
import {
  parseTimetableCell,
  formatTimetableCell,
  getQualifiedTeachersForSubject,
  checkTeacherAvailability,
  suggestBestTeacherForSlot,
} from '../../../services/timetableConflictEngine';

export interface EditingCellState {
  classLabel: string;
  dayKey: DayKey;
  periodIndex: number;
  periodNo: number;
  currentValue: string;
}

export function useTimetableCellModal(
  timetableMap: Record<string, TimetableClassEntry>,
  setTimetableMap: React.Dispatch<React.SetStateAction<Record<string, TimetableClassEntry>>>,
  teachers: Teacher[],
  selectedClassLabel: string,
  setHasUnsavedChanges: (val: boolean) => void
) {
  const [editingCell, setEditingCell] = useState<EditingCellState | null>(null);
  const [cellSubject, setCellSubject] = useState('');
  const [cellTeacher, setCellTeacher] = useState('');
  const [isParallel, setIsParallel] = useState(false);
  const [parallelSubject, setParallelSubject] = useState('');
  const [parallelTeacher, setParallelTeacher] = useState('');

  const qualifiedFaculty = useMemo(() => {
    if (!editingCell || !cellSubject.trim()) {
      return { primaryTeacher: null, qualifiedTeachers: [], allTeachers: teachers };
    }
    return getQualifiedTeachersForSubject(cellSubject, editingCell.classLabel, teachers);
  }, [editingCell, cellSubject, teachers]);

  const selectedTeacherAvailability = useMemo(() => {
    if (!editingCell || !cellTeacher) return null;
    const teacherObj = teachers.find((t) => t.name === cellTeacher);
    if (!teacherObj) return null;
    return checkTeacherAvailability(teacherObj.id, editingCell.dayKey, editingCell.periodIndex, timetableMap, editingCell.classLabel, teachers);
  }, [editingCell, cellTeacher, timetableMap, teachers]);

  const parallelTeacherAvailability = useMemo(() => {
    if (!editingCell || !isParallel || !parallelTeacher) return null;
    const teacherObj = teachers.find((t) => t.name === parallelTeacher);
    if (!teacherObj) return null;
    return checkTeacherAvailability(teacherObj.id, editingCell.dayKey, editingCell.periodIndex, timetableMap, editingCell.classLabel, teachers);
  }, [editingCell, isParallel, parallelTeacher, timetableMap, teachers]);

  const handleOpenCellEditor = (dayKey: DayKey, periodIndex: number, targetClassLabel?: string) => {
    const classLabelToEdit = targetClassLabel || selectedClassLabel;
    const entry = timetableMap[classLabelToEdit];
    if (!entry) return;
    const period = entry.periods[periodIndex];
    if (!period) return;
    const rawVal = period[dayKey] || '';
    const parsed = parseTimetableCell(rawVal, classLabelToEdit, teachers);

    let sub1 = '', teacher1 = '', sub2 = '', teacher2 = '';
    if (parsed.empty) {
      setIsParallel(false);
    } else if (parsed.isParallel && parsed.parts.length > 1) {
      setIsParallel(true);
      sub1 = parsed.parts[0].subject;
      teacher1 = parsed.parts[0].teacher?.name || '';
      sub2 = parsed.parts[1].subject;
      teacher2 = parsed.parts[1].teacher?.name || '';
    } else {
      setIsParallel(false);
      sub1 = parsed.parts[0]?.subject || parsed.label;
      teacher1 = parsed.parts[0]?.teacher?.name || '';
    }

    setCellSubject(sub1 === '—' ? '' : sub1);
    setCellTeacher(teacher1);
    setParallelSubject(sub2);
    setParallelTeacher(teacher2);

    setEditingCell({
      classLabel: classLabelToEdit,
      dayKey,
      periodIndex,
      periodNo: period.no,
      currentValue: rawVal,
    });
  };

  const handleSelectSubject = (subjectName: string) => {
    setCellSubject(subjectName);
    if (!editingCell) return;
    const qual = getQualifiedTeachersForSubject(subjectName, editingCell.classLabel, teachers);
    if (qual.primaryTeacher) setCellTeacher(qual.primaryTeacher.name);
    else if (qual.qualifiedTeachers.length > 0) setCellTeacher(qual.qualifiedTeachers[0].name);
  };

  const handleSuggestConflictFree = () => {
    if (!editingCell || !cellSubject) return;
    const suggestion = suggestBestTeacherForSlot(cellSubject, editingCell.classLabel, editingCell.dayKey, editingCell.periodIndex, timetableMap, teachers);
    if (suggestion) setCellTeacher(suggestion.teacher.name);
  };

  const handleSaveCell = () => {
    if (!editingCell) return;
    const { classLabel, dayKey, periodIndex } = editingCell;
    const finalValue = formatTimetableCell(
      cellSubject,
      cellTeacher,
      isParallel ? parallelSubject : null,
      isParallel ? parallelTeacher : null
    );

    setTimetableMap((prev) => {
      const copy = { ...prev };
      const entry = { ...copy[classLabel] };
      const periods = [...entry.periods];
      periods[periodIndex] = { ...periods[periodIndex], [dayKey]: finalValue };
      entry.periods = periods;
      copy[classLabel] = entry;
      return copy;
    });

    setHasUnsavedChanges(true);
    setEditingCell(null);
  };

  return {
    editingCell,
    setEditingCell,
    cellSubject,
    setCellSubject,
    cellTeacher,
    setCellTeacher,
    isParallel,
    setIsParallel,
    parallelSubject,
    setParallelSubject,
    parallelTeacher,
    setParallelTeacher,
    qualifiedFaculty,
    selectedTeacherAvailability,
    parallelTeacherAvailability,
    handleOpenCellEditor,
    handleSelectSubject,
    handleSuggestConflictFree,
    handleSaveCell,
  };
}

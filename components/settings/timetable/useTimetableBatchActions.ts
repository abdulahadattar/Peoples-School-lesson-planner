import React from 'react';
import { Teacher } from '../../../types';
import {
  TimetableClassEntry,
  DayKey,
  DAY_KEYS,
  DAY_LABELS,
} from '../../../services/timetable';
import rawTimetableData from '../../../data/timetable.json';
import {
  getQualifiedTeachersForSubject,
  checkTeacherAvailability,
} from '../../../services/timetableConflictEngine';

export interface ConfirmDialogState {
  isOpen: boolean;
  title: string;
  message: string;
  variant?: 'danger' | 'warning' | 'info';
  confirmLabel?: string;
  onConfirm: () => void;
}

export function useTimetableBatchActions(
  selectedClassLabel: string,
  selectedClassInfo: { subjects?: string[] } | undefined,
  teachers: Teacher[],
  setTimetableMap: React.Dispatch<React.SetStateAction<Record<string, TimetableClassEntry>>>,
  setHasUnsavedChanges: (val: boolean) => void,
  showNotice: (msg: string) => void,
  setConfirmDialog: (dialog: ConfirmDialogState | null) => void
) {
  const handleCopyDayToWeekdays = (sourceDay: DayKey) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Copy Day Schedule?',
      message: `Copy ${DAY_LABELS[sourceDay]}'s schedule to Tuesday, Wednesday, and Thursday for Class ${selectedClassLabel}?`,
      variant: 'info',
      confirmLabel: 'Copy Schedule',
      onConfirm: () => {
        setConfirmDialog(null);
        setTimetableMap((prev) => {
          const copy = { ...prev };
          const entry = { ...copy[selectedClassLabel] };
          entry.periods = entry.periods.map((p) => ({
            ...p,
            tue: p[sourceDay],
            wed: p[sourceDay],
            thu: p[sourceDay],
          }));
          copy[selectedClassLabel] = entry;
          return copy;
        });
        setHasUnsavedChanges(true);
        showNotice(`Copied ${DAY_LABELS[sourceDay]}'s schedule across Tue–Thu for Class ${selectedClassLabel}`);
      },
    });
  };

  const handleAutoFillEmptySlots = () => {
    const subjects = selectedClassInfo?.subjects || [];
    if (subjects.length === 0) {
      showNotice('No curriculum subjects defined for this class.');
      return;
    }
    let assignedCount = 0;
    setTimetableMap((prev) => {
      const copy = { ...prev };
      const entry = { ...copy[selectedClassLabel] };
      const periods = entry.periods.map((p, pIdx) => {
        const updated = { ...p };
        DAY_KEYS.forEach((dayKey) => {
          if (dayKey === 'fri' && pIdx >= 5) return;
          const currentVal = updated[dayKey];
          if (!currentVal || currentVal === '—') {
            for (let i = 0; i < subjects.length; i++) {
              const candidate = subjects[(pIdx + i) % subjects.length];
              const qual = getQualifiedTeachersForSubject(candidate, selectedClassLabel, teachers);
              if (qual.primaryTeacher) {
                const avail = checkTeacherAvailability(qual.primaryTeacher.id, dayKey, pIdx, copy, selectedClassLabel, teachers);
                if (!avail.isBusy) {
                  updated[dayKey] = candidate;
                  assignedCount++;
                  break;
                }
              } else {
                updated[dayKey] = candidate;
                assignedCount++;
                break;
              }
            }
          }
        });
        return updated;
      });
      entry.periods = periods;
      copy[selectedClassLabel] = entry;
      return copy;
    });
    setHasUnsavedChanges(true);
    showNotice(`Successfully scheduled ${assignedCount} empty slots with conflict-free curriculum subjects!`);
  };

  const handleResetClass = () => {
    setConfirmDialog({
      isOpen: true,
      title: 'Reset Timetable to Defaults?',
      message: `Reset timetable for Class ${selectedClassLabel} back to base institutional defaults?`,
      variant: 'warning',
      confirmLabel: 'Reset to Defaults',
      onConfirm: () => {
        setConfirmDialog(null);
        const defaultClasses = (rawTimetableData as { classes: TimetableClassEntry[] }).classes || [];
        const found = defaultClasses.find((c) => c.label === selectedClassLabel);
        if (found) {
          setTimetableMap((prev) => ({ ...prev, [selectedClassLabel]: JSON.parse(JSON.stringify(found)) }));
        }
        setHasUnsavedChanges(true);
        showNotice(`Class ${selectedClassLabel} timetable reset to institutional defaults.`);
      },
    });
  };

  return {
    handleCopyDayToWeekdays,
    handleAutoFillEmptySlots,
    handleResetClass,
  };
}

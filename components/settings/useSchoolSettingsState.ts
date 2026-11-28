import { useState, useMemo, useEffect, useRef } from 'react';
import {
  SchoolConfig,
  ClassTeacherConfig,
  PeriodTiming,
  buildMasterTimetableClasses,
  getSectionIdentifiers,
} from '../../services/schoolConfigService';
import {
  DEFAULT_GRADE_ENROLLMENTS,
  saveClassEnrollments,
} from '../../services/attendanceService';
import { enrollmentsFromSchoolConfig } from '../../services/schoolConfig/propagation';
import { auditFullTimetable } from '../../services/timetableConflictEngine';
import type { DayKey } from '../../services/timetable';
import { Teacher } from '../../types';
import { toUserErrorMessage } from '../../utils/userMessage';
import {
  SettingsTab,
  getPillarForTab,
  getTabMeta,
  hasUnsavedConfigChanges,
  serializeEditableConfig,
} from './adminNavigation';
import { toClassMap } from './timetable/timetableEditorHelpers';

export interface ConfirmDialogState {
  isOpen: boolean;
  title: string;
  message: string;
  variant?: 'danger' | 'warning' | 'primary';
  confirmLabel?: string;
  onConfirm: () => void;
}

export interface TimetableJumpTarget {
  dayKey: DayKey;
  periodIndex: number;
  classLabel: string;
  token: number;
}

export function useSchoolSettingsState(
  config: SchoolConfig,
  saveConfig: (cfg: SchoolConfig) => Promise<void>,
  resetToDefaults: () => Promise<void>,
  showToast: (msg: string, type: 'success' | 'error') => void
) {
  const [workingConfig, setWorkingConfig] = useState<SchoolConfig>(config);
  const lastSyncedSignatureRef = useRef<string>(serializeEditableConfig(config));
  const [activeTab, setActiveTab] = useState<SettingsTab>('identity');
  const [searchQuery, setSearchQuery] = useState('');

  const [editingClass, setEditingClass] = useState<ClassTeacherConfig | null>(null);
  const [isClassModalOpen, setIsClassModalOpen] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState<Teacher | null>(null);
  const [isTeacherModalOpen, setIsTeacherModalOpen] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const [timetableJumpTarget, setTimetableJumpTarget] = useState<TimetableJumpTarget | null>(null);

  useEffect(() => {
    const nextSig = serializeEditableConfig(config);
    const workingSig = serializeEditableConfig(workingConfig);
    const hasLocalEdits = workingSig !== lastSyncedSignatureRef.current;

    if (!hasLocalEdits || config.updatedBy?.includes('(Reset)')) {
      setWorkingConfig(config);
    }
    lastSyncedSignatureRef.current = nextSig;
  }, [config]);

  const hasUnsavedChanges = useMemo(
    () => hasUnsavedConfigChanges(workingConfig, config),
    [workingConfig, config]
  );

  const activePillar = useMemo(() => getPillarForTab(activeTab), [activeTab]);
  const activeTabMeta = useMemo(() => getTabMeta(activeTab), [activeTab]);

  const classTotals = useMemo(() => {
    let boys = 0;
    let girls = 0;
    let total = 0;
    workingConfig.classes.forEach((c) => {
      const b = c.enrolledBoys || 0;
      const g = c.enrolledGirls || 0;
      boys += b;
      girls += g;
      total += c.totalEnrollment && c.totalEnrollment > 0 ? c.totalEnrollment : b + g;
    });
    return {
      classesCount: workingConfig.classes.length,
      boys,
      girls,
      total,
    };
  }, [workingConfig.classes]);

  const availableClassKeys = useMemo(() => {
    return getSectionIdentifiers(workingConfig.classes);
  }, [workingConfig.classes]);

  const filteredClasses = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return workingConfig.classes;
    return workingConfig.classes.filter(
      (c) =>
        c.displayName.toLowerCase().includes(q) ||
        c.romanName.toLowerCase().includes(q) ||
        c.classTeacher.toLowerCase().includes(q) ||
        c.classKey.toLowerCase().includes(q) ||
        (c.roomNumber || '').toLowerCase().includes(q)
    );
  }, [workingConfig.classes, searchQuery]);

  const filteredTeachers = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return workingConfig.teachers;
    return workingConfig.teachers.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        (t.designation || '').toLowerCase().includes(q) ||
        t.subjects.some((s) => s.name.toLowerCase().includes(q))
    );
  }, [workingConfig.teachers, searchQuery]);

  const auditReport = useMemo(() => {
    const masterClasses = buildMasterTimetableClasses(workingConfig);
    return auditFullTimetable(toClassMap(masterClasses), workingConfig.teachers);
  }, [workingConfig]);

  const handleSaveClass = (updatedClass: ClassTeacherConfig) => {
    setWorkingConfig((prev) => {
      const idx = prev.classes.findIndex((c) => c.classKey === updatedClass.classKey);
      const updatedClasses = [...prev.classes];
      if (idx >= 0) {
        updatedClasses[idx] = updatedClass;
      } else {
        updatedClasses.push(updatedClass);
      }
      return { ...prev, classes: updatedClasses };
    });
  };

  const handleDeleteClass = (classKey: string) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Remove Class Section',
      message: `Are you sure you want to remove Class Section "${classKey}"?`,
      variant: 'danger',
      confirmLabel: 'Remove Section',
      onConfirm: () => {
        setWorkingConfig((prev) => ({
          ...prev,
          classes: prev.classes.filter((c) => c.classKey !== classKey),
        }));
        setConfirmDialog(null);
      },
    });
  };

  const handleSaveTeacher = (updatedTeacher: Teacher) => {
    setWorkingConfig((prev) => {
      const idx = prev.teachers.findIndex((t) => t.id === updatedTeacher.id);
      const updatedTeachers = [...prev.teachers];
      if (idx >= 0) {
        updatedTeachers[idx] = updatedTeacher;
      } else {
        updatedTeachers.push(updatedTeacher);
      }
      return { ...prev, teachers: updatedTeachers };
    });
  };

  const handleDeleteTeacher = (teacherId: string) => {
    const teacher = workingConfig.teachers.find((t) => t.id === teacherId);
    setConfirmDialog({
      isOpen: true,
      title: 'Remove Faculty Member',
      message: `Are you sure you want to remove "${teacher?.name || 'this faculty member'}" from the roster?`,
      variant: 'danger',
      confirmLabel: 'Remove Member',
      onConfirm: () => {
        setWorkingConfig((prev) => ({
          ...prev,
          teachers: prev.teachers.filter((t) => t.id !== teacherId),
        }));
        setConfirmDialog(null);
      },
    });
  };

  const handlePeriodChange = (index: number, field: keyof PeriodTiming, value: string | number | boolean) => {
    setWorkingConfig((prev) => {
      const copy = [...prev.periods];
      copy[index] = { ...copy[index], [field]: value };
      return { ...prev, periods: copy };
    });
  };

  const handleAddPeriod = () => {
    setWorkingConfig((prev) => {
      const teachingCount = prev.periods.filter((p) => !p.isBreak && p.no > 0).length;
      const nextNo = teachingCount + 1;
      const newPeriod: PeriodTiming = {
        no: nextNo,
        name: `Period ${nextNo}`,
        start: '01:20 PM',
        end: '02:00 PM',
        durationMinutes: 40,
      };
      return { ...prev, periods: [...prev.periods, newPeriod] };
    });
  };

  const handleRemovePeriod = (index: number) => {
    setWorkingConfig((prev) => ({
      ...prev,
      periods: prev.periods.filter((_, i) => i !== index),
    }));
  };

  const handleDiscardEdits = () => {
    setWorkingConfig(config);
    showToast('Unsaved edits discarded.', 'success');
  };

  const handleResolveAuditorClash = (dayKey: DayKey, periodIndex: number, classLabel: string) => {
    setTimetableJumpTarget({
      dayKey,
      periodIndex,
      classLabel,
      token: Date.now(),
    });
    setActiveTab('timetable');
  };

  const handleSaveAll = async () => {
    try {
      await saveConfig(workingConfig);
      await saveClassEnrollments(
        enrollmentsFromSchoolConfig(workingConfig.classes, DEFAULT_GRADE_ENROLLMENTS),
        workingConfig.updatedBy || 'Admin'
      );
      showToast('School settings saved.', 'success');
    } catch (err: unknown) {
      showToast(toUserErrorMessage(err, 'Failed to save settings.'), 'error');
    }
  };

  const handleExecuteReset = async () => {
    setShowResetConfirm(false);
    try {
      await resetToDefaults();
      await saveClassEnrollments(DEFAULT_GRADE_ENROLLMENTS, 'System Baseline');
      showToast('Default settings restored.', 'success');
    } catch (err: unknown) {
      showToast(toUserErrorMessage(err, 'Failed to restore defaults.'), 'error');
    }
  };

  return {
    workingConfig,
    setWorkingConfig,
    activeTab,
    setActiveTab,
    activePillar,
    activeTabMeta,
    hasUnsavedChanges,
    searchQuery,
    setSearchQuery,
    editingClass,
    setEditingClass,
    isClassModalOpen,
    setIsClassModalOpen,
    editingTeacher,
    setEditingTeacher,
    isTeacherModalOpen,
    setIsTeacherModalOpen,
    showResetConfirm,
    setShowResetConfirm,
    confirmDialog,
    setConfirmDialog,
    timetableJumpTarget,
    clearTimetableJumpTarget: () => setTimetableJumpTarget(null),
    classTotals,
    availableClassKeys,
    filteredClasses,
    filteredTeachers,
    auditReport,
    handleSaveClass,
    handleDeleteClass,
    handleSaveTeacher,
    handleDeleteTeacher,
    handlePeriodChange,
    handleAddPeriod,
    handleRemovePeriod,
    handleDiscardEdits,
    handleResolveAuditorClash,
    handleSaveAll,
    handleExecuteReset,
  };
}

import { useState, useMemo, useEffect } from 'react';
import {
  SchoolConfig,
  ClassTeacherConfig,
  PeriodTiming,
} from '../../services/schoolConfigService';
import { Teacher } from '../../types';
import { SettingsTab } from './SettingsTabsNav';

export interface ConfirmDialogState {
  isOpen: boolean;
  title: string;
  message: string;
  variant?: 'danger' | 'warning' | 'primary';
  confirmLabel?: string;
  onConfirm: () => void;
}

export function useSchoolSettingsState(
  config: SchoolConfig,
  saveConfig: (cfg: SchoolConfig) => Promise<void>,
  resetToDefaults: () => Promise<void>,
  showToast: (msg: string, type: 'success' | 'error') => void
) {
  const [workingConfig, setWorkingConfig] = useState<SchoolConfig>(config);
  const [activeTab, setActiveTab] = useState<SettingsTab>('classes');
  const [searchQuery, setSearchQuery] = useState('');

  const [editingClass, setEditingClass] = useState<ClassTeacherConfig | null>(null);
  const [isClassModalOpen, setIsClassModalOpen] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState<Teacher | null>(null);
  const [isTeacherModalOpen, setIsTeacherModalOpen] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);

  useEffect(() => {
    setWorkingConfig(config);
  }, [config]);

  const classTotals = useMemo(() => {
    let boys = 0;
    let girls = 0;
    workingConfig.classes.forEach((c) => {
      boys += c.enrolledBoys || 0;
      girls += c.enrolledGirls || 0;
    });
    return {
      classesCount: workingConfig.classes.length,
      boys,
      girls,
      total: boys + girls,
    };
  }, [workingConfig.classes]);

  const availableClassKeys = useMemo(() => {
    return workingConfig.classes.map((c) => c.romanName || c.classKey);
  }, [workingConfig.classes]);

  const filteredClasses = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return workingConfig.classes;
    return workingConfig.classes.filter(
      (c) =>
        c.displayName.toLowerCase().includes(q) ||
        c.romanName.toLowerCase().includes(q) ||
        c.classTeacher.toLowerCase().includes(q) ||
        c.classKey.toLowerCase().includes(q)
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

  const handlePeriodChange = (index: number, field: keyof PeriodTiming, value: any) => {
    setWorkingConfig((prev) => {
      const copy = [...prev.periods];
      copy[index] = { ...copy[index], [field]: value };
      return { ...prev, periods: copy };
    });
  };

  const handleAddPeriod = () => {
    setWorkingConfig((prev) => {
      const nextNo = prev.periods.length + 1;
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

  const handleSaveAll = async () => {
    try {
      await saveConfig(workingConfig);
      showToast('School configuration saved successfully.', 'success');
    } catch (err: any) {
      showToast(err?.message || 'Failed to save configuration.', 'error');
    }
  };

  const handleExecuteReset = async () => {
    setShowResetConfirm(false);
    try {
      await resetToDefaults();
      showToast('Institutional defaults restored successfully.', 'success');
    } catch (err: any) {
      showToast(err?.message || 'Failed to reset.', 'error');
    }
  };

  return {
    workingConfig,
    setWorkingConfig,
    activeTab,
    setActiveTab,
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
    classTotals,
    availableClassKeys,
    filteredClasses,
    filteredTeachers,
    handleSaveClass,
    handleDeleteClass,
    handleSaveTeacher,
    handleDeleteTeacher,
    handlePeriodChange,
    handleAddPeriod,
    handleRemovePeriod,
    handleSaveAll,
    handleExecuteReset,
  };
}

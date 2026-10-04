import React, { useState, useMemo, useEffect } from 'react';
import {
  Settings,
  ShieldCheck,
  ShieldAlert,
  Save,
  RotateCcw,
  Users,
  GraduationCap,
  Clock,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  LogIn,
  Calendar,
  Building2,
} from 'lucide-react';
import {
  SchoolConfig,
  ClassTeacherConfig,
  PeriodTiming,
} from '../../services/schoolConfigService';
import { Teacher } from '../../types';
import { useSchoolConfig } from '../../hooks/useSchoolConfig';
import { ClassEditorModal } from './ClassEditorModal';
import { TeacherEditorModal } from './TeacherEditorModal';
import { TimetableEditorTab } from './TimetableEditorTab';
import { ClassesSettingsTab } from './ClassesSettingsTab';
import { TeachersSettingsTab } from './TeachersSettingsTab';
import { SafeguardsSettingsTab } from './SafeguardsSettingsTab';
import { PeriodsSettingsTab } from './PeriodsSettingsTab';
import { IdentitySettingsTab } from './IdentitySettingsTab';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { useToast } from '../../hooks/useToast';
import { googleSignIn } from '../../services/googleAuth';

type SettingsTab = 'classes' | 'teachers' | 'timetable' | 'safeguards' | 'periods' | 'identity';

interface SchoolSettingsViewProps {
  onOpenLoginGate?: () => void;
}

export const SchoolSettingsView: React.FC<SchoolSettingsViewProps> = ({ onOpenLoginGate }) => {
  const {
    config,
    isAdmin,
    currentUser,
    isSaving,
    saveSuccess,
    error,
    saveConfig,
    resetToDefaults,
  } = useSchoolConfig();

  // Working copy state for local modifications before saving
  const [workingConfig, setWorkingConfig] = useState<SchoolConfig>(config);
  const [activeTab, setActiveTab] = useState<SettingsTab>('classes');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals state
  const [editingClass, setEditingClass] = useState<ClassTeacherConfig | null>(null);
  const [isClassModalOpen, setIsClassModalOpen] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState<Teacher | null>(null);
  const [isTeacherModalOpen, setIsTeacherModalOpen] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    variant?: 'danger' | 'warning' | 'primary';
    confirmLabel?: string;
    onConfirm: () => void;
  } | null>(null);
  const { showToast, ToastComponent } = useToast(4500);

  // Sync working copy when base config changes
  useEffect(() => {
    setWorkingConfig(config);
  }, [config]);

  // Calculations
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

  // Filtered classes
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

  // Filtered teachers
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

  // Handlers for Classes
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

  // Handlers for Teachers
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

  // Handlers for Period Timings
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

  // Commit changes to Firestore
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

  return (
    <div className="w-full max-w-[1600px] mx-auto px-4 sm:px-6 md:px-8 py-6 space-y-6">
      {/* Reset Confirmation Modal */}
      <ConfirmDialog
        isOpen={showResetConfirm}
        title="Reset to Institutional Defaults?"
        message="This will restore all 18 classes, class teachers, period timings, and baseline enrollments (868 students) to the official handwritten school register. Custom modifications will be replaced."
        variant="warning"
        confirmLabel="Yes, Restore Defaults"
        onConfirm={handleExecuteReset}
        onCancel={() => setShowResetConfirm(false)}
      />

      {/* Dynamic Action Confirm Modal */}
      {confirmDialog && (
        <ConfirmDialog
          isOpen={confirmDialog.isOpen}
          title={confirmDialog.title}
          message={confirmDialog.message}
          variant={confirmDialog.variant || 'danger'}
          confirmLabel={confirmDialog.confirmLabel || 'Confirm'}
          onConfirm={confirmDialog.onConfirm}
          onCancel={() => setConfirmDialog(null)}
        />
      )}

      {/* Modals */}
      <ClassEditorModal
        isOpen={isClassModalOpen}
        onClose={() => {
          setIsClassModalOpen(false);
          setEditingClass(null);
        }}
        onSave={handleSaveClass}
        initialData={editingClass}
        teachers={workingConfig.teachers}
      />

      <TeacherEditorModal
        isOpen={isTeacherModalOpen}
        onClose={() => {
          setIsTeacherModalOpen(false);
          setEditingTeacher(null);
        }}
        onSave={handleSaveTeacher}
        initialData={editingTeacher}
        availableClasses={availableClassKeys}
      />

      {/* Top Banner Card */}
      <div className="rounded-2xl glass-card p-5 sm:p-6 border border-brand-border shadow-card flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-2.5 py-1 rounded-lg bg-brand-primary/10 text-brand-primary text-xs font-bold border border-brand-primary/20 flex items-center gap-1.5">
              <Settings className="w-3.5 h-3.5" />
              <span>School Administration Portal</span>
            </span>

            {isAdmin ? (
              <span className="px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 text-xs font-bold border border-emerald-200 dark:border-emerald-800 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Admin Access: {currentUser?.email}</span>
              </span>
            ) : (
              <span className="px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 text-xs font-bold border border-amber-200 dark:border-amber-800 flex items-center gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5" />
                <span>Read-Only Mode • Admin Sign-In Required to Save</span>
              </span>
            )}

            {saveSuccess && (
              <span className="px-2.5 py-1 rounded-lg bg-emerald-500 text-white text-xs font-bold flex items-center gap-1 animate-fadeIn">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Saved & Synchronized!</span>
              </span>
            )}
          </div>

          <h1 className="text-xl sm:text-2xl font-extrabold text-brand-text-primary tracking-tight">
            Institutional Settings & Configuration
          </h1>
          <p className="text-xs text-brand-text-secondary max-w-3xl leading-relaxed">
            Configure school classes, class teacher in-charge allocations, attendance enrollment modes
            (Manual vs Google Sheet sync), Google Sheet editing permissions lock, and academic period timings.
          </p>
        </div>

        {/* Top Actions */}
        <div className="flex flex-wrap items-center gap-2.5">
          {!isAdmin && (
            <button
              type="button"
              onClick={() => {
                if (onOpenLoginGate) onOpenLoginGate();
                else googleSignIn();
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-soft active:scale-95 transition-all cursor-pointer"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Sign In as Admin</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowResetConfirm(true)}
            disabled={!isAdmin || isSaving}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-white dark:bg-brand-surface border border-brand-border text-brand-text-secondary hover:text-rose-600 hover:border-rose-200 shadow-soft active:scale-95 transition-all disabled:opacity-40 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Baseline</span>
          </button>

          <button
            type="button"
            onClick={handleSaveAll}
            disabled={!isAdmin || isSaving}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-brand-primary hover:bg-brand-primary/90 shadow-soft active:scale-95 transition-all disabled:opacity-40 cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{isSaving ? 'Saving...' : 'Save Changes'}</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex items-center gap-1.5 border-b border-brand-border/80 overflow-x-auto custom-scrollbar pb-px">
        {[
          { id: 'classes' as const, label: 'Classes & Enrollments', icon: GraduationCap, badge: classTotals.classesCount },
          { id: 'teachers' as const, label: 'Faculty & Subject In-Charge', icon: Users, badge: workingConfig.teachers.length },
          { id: 'timetable' as const, label: 'Timetable & Schedules', icon: Calendar, badge: workingConfig.customTimetable?.length || classTotals.classesCount },
          { id: 'safeguards' as const, label: 'Sheet & Attendance Safeguards', icon: FileSpreadsheet },
          { id: 'periods' as const, label: 'Bell Schedule & Timings', icon: Clock, badge: workingConfig.periods.length },
          { id: 'identity' as const, label: 'School Identity', icon: Building2 },
        ].map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`relative px-4 py-2.5 rounded-t-xl text-xs font-semibold whitespace-nowrap flex items-center gap-2 transition-all cursor-pointer ${
                isActive
                  ? 'text-brand-primary bg-white dark:bg-brand-surface border-t-2 border-brand-primary shadow-xs'
                  : 'text-brand-text-secondary hover:text-brand-text-primary hover:bg-brand-bg/50'
              }`}
            >
              <tab.icon className={`w-4 h-4 ${isActive ? 'text-brand-primary' : 'text-brand-text-secondary'}`} />
              <span>{tab.label}</span>
              {typeof tab.badge === 'number' && (
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold ${
                    isActive
                      ? 'bg-brand-primary/10 text-brand-primary'
                      : 'bg-slate-100 dark:bg-slate-800 text-brand-text-secondary'
                  }`}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* TAB 1: CLASSES & ENROLLMENTS */}
      {activeTab === 'classes' && (
        <ClassesSettingsTab
          workingConfig={workingConfig}
          setWorkingConfig={setWorkingConfig}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          filteredClasses={filteredClasses}
          classTotals={classTotals}
          onAddClass={() => {
            setEditingClass(null);
            setIsClassModalOpen(true);
          }}
          onEditClass={(cls) => {
            setEditingClass(cls);
            setIsClassModalOpen(true);
          }}
          onDeleteClass={handleDeleteClass}
        />
      )}

      {/* TAB 2: FACULTY & SUBJECT IN-CHARGE */}
      {activeTab === 'teachers' && (
        <TeachersSettingsTab
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          filteredTeachers={filteredTeachers}
          onAddTeacher={() => {
            setEditingTeacher(null);
            setIsTeacherModalOpen(true);
          }}
          onEditTeacher={(teacher) => {
            setEditingTeacher(teacher);
            setIsTeacherModalOpen(true);
          }}
          onDeleteTeacher={handleDeleteTeacher}
        />
      )}

      {/* TAB 3: SHEET & ATTENDANCE SAFEGUARDS */}
      {activeTab === 'safeguards' && (
        <SafeguardsSettingsTab
          workingConfig={workingConfig}
          setWorkingConfig={setWorkingConfig}
        />
      )}

      {/* TAB 4: BELL SCHEDULE & PERIOD TIMINGS */}
      {activeTab === 'periods' && (
        <PeriodsSettingsTab
          workingConfig={workingConfig}
          onAddPeriod={handleAddPeriod}
          onPeriodChange={handlePeriodChange}
          onRemovePeriod={handleRemovePeriod}
        />
      )}

      {/* TAB 5: SCHOOL IDENTITY */}
      {activeTab === 'identity' && (
        <IdentitySettingsTab
          workingConfig={workingConfig}
          setWorkingConfig={setWorkingConfig}
        />
      )}

      {/* TAB 6: TIMETABLE & PERIOD SCHEDULES */}
      {activeTab === 'timetable' && (
        <div className="animate-fadeIn">
          <TimetableEditorTab
            config={workingConfig}
            teachers={workingConfig.teachers}
            isSaving={isSaving}
            onUpdateCustomTimetable={(updated) => {
              const newConfig: SchoolConfig = {
                ...workingConfig,
                customTimetable: updated,
              };
              setWorkingConfig(newConfig);
              saveConfig(newConfig);
            }}
          />
        </div>
      )}

      {ToastComponent}
    </div>
  );
};

export default SchoolSettingsView;

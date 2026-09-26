import React, { useState, useMemo } from 'react';
import {
  Settings,
  ShieldCheck,
  ShieldAlert,
  Save,
  RotateCcw,
  Plus,
  Edit2,
  Trash2,
  Users,
  GraduationCap,
  Clock,
  FileSpreadsheet,
  Lock,
  Unlock,
  CheckCircle2,
  AlertCircle,
  LogIn,
  Search,
  BookOpen,
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
import { googleSignIn } from '../../services/googleAuth';
import { motion, AnimatePresence } from 'motion/react';

type SettingsTab = 'classes' | 'teachers' | 'timetable' | 'safeguards' | 'periods' | 'identity';

interface SchoolSettingsViewProps {
  onOpenLoginGate?: () => void;
}

export const SchoolSettingsView: React.FC<SchoolSettingsViewProps> = ({ onOpenLoginGate }) => {
  const {
    config,
    isAdmin,
    currentUser,
    isLoading,
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

  // Sync working copy when base config changes
  React.useEffect(() => {
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
      let updatedClasses = [...prev.classes];
      if (idx >= 0) {
        updatedClasses[idx] = updatedClass;
      } else {
        updatedClasses.push(updatedClass);
      }
      return { ...prev, classes: updatedClasses };
    });
  };

  const handleDeleteClass = (classKey: string) => {
    if (!window.confirm(`Are you sure you want to remove Class Section ${classKey}?`)) return;
    setWorkingConfig((prev) => ({
      ...prev,
      classes: prev.classes.filter((c) => c.classKey !== classKey),
    }));
  };

  // Handlers for Teachers
  const handleSaveTeacher = (updatedTeacher: Teacher) => {
    setWorkingConfig((prev) => {
      const idx = prev.teachers.findIndex((t) => t.id === updatedTeacher.id);
      let updatedTeachers = [...prev.teachers];
      if (idx >= 0) {
        updatedTeachers[idx] = updatedTeacher;
      } else {
        updatedTeachers.push(updatedTeacher);
      }
      return { ...prev, teachers: updatedTeachers };
    });
  };

  const handleDeleteTeacher = (teacherId: string) => {
    if (!window.confirm('Are you sure you want to remove this faculty member?')) return;
    setWorkingConfig((prev) => ({
      ...prev,
      teachers: prev.teachers.filter((t) => t.id !== teacherId),
    }));
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
    } catch (err: any) {
      alert(err?.message || 'Failed to save configuration.');
    }
  };

  const handleExecuteReset = async () => {
    setShowResetConfirm(false);
    try {
      await resetToDefaults();
    } catch (err: any) {
      alert(err?.message || 'Failed to reset.');
    }
  };

  return (
    <div className="w-full max-w-[1600px] mx-auto px-4 sm:px-6 md:px-8 py-6 space-y-6">
      {/* Reset Confirmation Modal */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white dark:bg-brand-surface rounded-2xl border border-brand-border p-6 max-w-md shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-amber-500">
              <AlertCircle className="w-6 h-6 flex-shrink-0" />
              <h3 className="text-base font-bold text-brand-text-primary">
                Reset to Institutional Defaults?
              </h3>
            </div>
            <p className="text-xs text-brand-text-secondary leading-relaxed">
              This will restore all 18 classes, class teachers, period timings, and baseline enrollments
              (868 students) to the official handwritten school register. Custom modifications will be replaced.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowResetConfirm(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-brand-text-secondary hover:bg-brand-bg transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteReset}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 shadow-soft transition-colors"
              >
                Yes, Restore Defaults
              </button>
            </div>
          </div>
        </div>
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
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-soft active:scale-95 transition-all"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Sign In as Admin</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowResetConfirm(true)}
            disabled={!isAdmin || isSaving}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-white dark:bg-brand-surface border border-brand-border text-brand-text-secondary hover:text-rose-600 hover:border-rose-200 shadow-soft active:scale-95 transition-all disabled:opacity-40"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Baseline</span>
          </button>

          <button
            type="button"
            onClick={handleSaveAll}
            disabled={!isAdmin || isSaving}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-brand-primary hover:bg-brand-primary/90 shadow-soft active:scale-95 transition-all disabled:opacity-40"
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
              className={`relative px-4 py-2.5 rounded-t-xl text-xs font-semibold whitespace-nowrap flex items-center gap-2 transition-all ${
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
        <div className="space-y-5 animate-fadeIn">
          {/* Quick Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-4 rounded-xl bg-white dark:bg-brand-surface border border-brand-border shadow-soft">
              <span className="text-[10px] uppercase font-bold text-brand-text-secondary">Class Sections</span>
              <span className="text-xl font-extrabold text-brand-text-primary font-mono block mt-0.5">
                {classTotals.classesCount}
              </span>
            </div>
            <div className="p-4 rounded-xl bg-white dark:bg-brand-surface border border-brand-border shadow-soft">
              <span className="text-[10px] uppercase font-bold text-blue-600 dark:text-blue-400">Total Enrolled Boys</span>
              <span className="text-xl font-extrabold text-blue-700 dark:text-blue-300 font-mono block mt-0.5">
                {classTotals.boys.toLocaleString()}
              </span>
            </div>
            <div className="p-4 rounded-xl bg-white dark:bg-brand-surface border border-brand-border shadow-soft">
              <span className="text-[10px] uppercase font-bold text-rose-600 dark:text-rose-400">Total Enrolled Girls</span>
              <span className="text-xl font-extrabold text-rose-700 dark:text-rose-300 font-mono block mt-0.5">
                {classTotals.girls.toLocaleString()}
              </span>
            </div>
            <div className="p-4 rounded-xl bg-white dark:bg-brand-surface border border-brand-border shadow-soft">
              <span className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400">Total School Strength</span>
              <span className="text-xl font-extrabold text-emerald-700 dark:text-emerald-300 font-mono block mt-0.5">
                {classTotals.total.toLocaleString()}
              </span>
            </div>
          </div>

          {/* Enrollment Source Setting Card */}
          <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-brand-surface border border-brand-border shadow-soft flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <span className="text-xs font-bold text-brand-text-primary">
                Daily Attendance Enrollment Source
              </span>
              <p className="text-xs text-brand-text-secondary leading-relaxed max-w-2xl">
                Where the attendance register gets its student counts from.
              </p>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={() => setWorkingConfig((prev) => ({ ...prev, enrollmentMode: 'manual' }))}
                className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
                  workingConfig.enrollmentMode === 'manual'
                    ? 'bg-brand-primary text-white shadow-soft'
                    : 'bg-slate-100 dark:bg-slate-800 text-brand-text-secondary hover:text-brand-text-primary'
                }`}
              >
                Manual Values
              </button>
              <button
                type="button"
                onClick={() => setWorkingConfig((prev) => ({ ...prev, enrollmentMode: 'google_sheet' }))}
                className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
                  workingConfig.enrollmentMode === 'google_sheet'
                    ? 'bg-brand-primary text-white shadow-soft'
                    : 'bg-slate-100 dark:bg-slate-800 text-brand-text-secondary hover:text-brand-text-primary'
                }`}
              >
                Google Sheet Sync
              </button>
            </div>
          </div>

          {/* Search and Add Class Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-brand-text-secondary" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search class by code or teacher..."
                className="w-full pl-9 pr-3 py-2 rounded-xl text-xs font-medium bg-white dark:bg-brand-surface border border-brand-border text-brand-text-primary focus:outline-none focus:border-brand-primary"
              />
            </div>

            <button
              type="button"
              onClick={() => {
                setEditingClass(null);
                setIsClassModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-brand-primary hover:bg-brand-primary/90 shadow-soft active:scale-95 transition-all self-start sm:self-auto"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add New Class Section</span>
            </button>
          </div>

          {/* Classes Table */}
          <div className="rounded-2xl border border-brand-border bg-white dark:bg-brand-surface shadow-soft overflow-hidden">
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50/75 dark:bg-slate-900/40 border-b border-brand-border font-bold text-brand-text-secondary">
                    <th className="py-3 px-4">Class Code</th>
                    <th className="py-3 px-4">Display Name</th>
                    <th className="py-3 px-4">Class Teacher In-Charge</th>
                    <th className="py-3 px-3 text-center">Boys</th>
                    <th className="py-3 px-3 text-center">Girls</th>
                    <th className="py-3 px-3 text-center">Total Enrolled</th>
                    <th className="py-3 px-4">Subjects</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-border/60">
                  {filteredClasses.map((cls) => (
                    <tr
                      key={cls.classKey}
                      className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors"
                    >
                      <td className="py-3 px-4 font-mono font-bold text-brand-text-primary">
                        {cls.romanName}
                      </td>
                      <td className="py-3 px-4 font-semibold text-brand-text-primary">
                        {cls.displayName}
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-brand-text-primary font-medium">
                          {cls.classTeacher || '—'}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center font-mono font-semibold text-blue-600 dark:text-blue-400">
                        {cls.enrolledBoys}
                      </td>
                      <td className="py-3 px-3 text-center font-mono font-semibold text-rose-600 dark:text-rose-400">
                        {cls.enrolledGirls}
                      </td>
                      <td className="py-3 px-3 text-center font-mono font-extrabold text-brand-primary">
                        {cls.enrolledBoys + cls.enrolledGirls}
                      </td>
                      <td className="py-3 px-4 text-brand-text-secondary text-[11px] max-w-xs truncate">
                        {cls.subjects?.join(', ') || 'Standard Curriculum'}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingClass(cls);
                              setIsClassModalOpen(true);
                            }}
                            className="p-1.5 rounded-lg text-brand-text-secondary hover:text-brand-primary hover:bg-brand-bg transition-colors"
                            title="Edit class"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteClass(cls.classKey)}
                            className="p-1.5 rounded-lg text-brand-text-secondary hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                            title="Delete class"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredClasses.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-xs text-brand-text-secondary">
                        No matching class sections found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: FACULTY & SUBJECT IN-CHARGE */}
      {activeTab === 'teachers' && (
        <div className="space-y-5 animate-fadeIn">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-brand-text-secondary" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search faculty by name or subject..."
                className="w-full pl-9 pr-3 py-2 rounded-xl text-xs font-medium bg-white dark:bg-brand-surface border border-brand-border text-brand-text-primary focus:outline-none focus:border-brand-primary"
              />
            </div>

            <button
              type="button"
              onClick={() => {
                setEditingTeacher(null);
                setIsTeacherModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-brand-primary hover:bg-brand-primary/90 shadow-soft active:scale-95 transition-all self-start sm:self-auto"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Faculty Member</span>
            </button>
          </div>

          {/* Teachers Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredTeachers.map((teacher) => (
              <div
                key={teacher.id}
                className="p-4 rounded-2xl bg-white dark:bg-brand-surface border border-brand-border shadow-soft flex flex-col justify-between space-y-3 hover:border-brand-primary/40 transition-colors"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-bold text-brand-text-primary">{teacher.name}</h3>
                      <span className="inline-block px-2 py-0.5 rounded-md text-[10px] font-semibold bg-brand-primary/10 text-brand-primary mt-0.5">
                        {teacher.designation || 'Subject Specialist'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingTeacher(teacher);
                          setIsTeacherModalOpen(true);
                        }}
                        className="p-1 rounded-lg text-brand-text-secondary hover:text-brand-primary hover:bg-brand-bg transition-colors"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteTeacher(teacher.id)}
                        className="p-1 rounded-lg text-brand-text-secondary hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Subjects */}
                  <div className="mt-3 space-y-2">
                    <span className="text-[10px] uppercase font-bold text-brand-text-secondary tracking-wider block">
                      Subjects & Sections:
                    </span>
                    <div className="space-y-1.5 max-h-36 overflow-y-auto custom-scrollbar pr-1">
                      {teacher.subjects.map((sub, idx) => (
                        <div
                          key={idx}
                          className="p-2 rounded-lg bg-slate-50 dark:bg-slate-900/40 border border-brand-border/60 text-xs"
                        >
                          <span className="font-bold text-brand-text-primary block">{sub.name}</span>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {sub.sections.map((sec) => (
                              <span
                                key={sec}
                                className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-white dark:bg-brand-surface border border-brand-border text-brand-text-secondary"
                              >
                                {sec}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-brand-border/60 text-[11px] text-brand-text-secondary">
                  School: Peoples Higher Secondary School Jamshoro
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: SHEET & ATTENDANCE SAFEGUARDS */}
      {activeTab === 'safeguards' && (
        <div className="space-y-5 animate-fadeIn">
          {/* Master Google Sheet Editing Permission Toggle */}
          <div className="p-6 rounded-2xl bg-white dark:bg-brand-surface border border-brand-border shadow-soft space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1 max-w-2xl">
                <div className="flex items-center gap-2">
                  {workingConfig.sheetEditingEnabled ? (
                    <span className="p-2 rounded-xl bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300">
                      <Unlock className="w-5 h-5" />
                    </span>
                  ) : (
                    <span className="p-2 rounded-xl bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300">
                      <Lock className="w-5 h-5" />
                    </span>
                  )}
                  <div>
                    <h3 className="text-sm font-bold text-brand-text-primary">
                      Google Sheet Student Records Edit Permission
                    </h3>
                    <p className="text-xs text-brand-text-secondary">
                      Toggle whether faculty members and visitors can add or edit student records in the Google Sheet.
                    </p>
                  </div>
                </div>
              </div>

              {/* Master Switch */}
              <button
                type="button"
                onClick={() =>
                  setWorkingConfig((prev) => ({
                    ...prev,
                    sheetEditingEnabled: !prev.sheetEditingEnabled,
                  }))
                }
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  workingConfig.sheetEditingEnabled ? 'bg-emerald-600' : 'bg-slate-300 dark:bg-slate-700'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    workingConfig.sheetEditingEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-brand-border/80 space-y-2">
              <label className="block text-xs font-semibold text-brand-text-primary">
                Lockout Banner Message (displayed when editing is locked):
              </label>
              <textarea
                rows={2}
                value={workingConfig.sheetEditingLockedMessage || ''}
                onChange={(e) =>
                  setWorkingConfig((prev) => ({
                    ...prev,
                    sheetEditingLockedMessage: e.target.value,
                  }))
                }
                placeholder="Message shown to teachers and visitors when sheet editing is disabled..."
                className="w-full px-3 py-2 rounded-xl text-xs bg-white dark:bg-brand-surface border border-brand-border text-brand-text-primary focus:outline-none focus:border-brand-primary resize-none"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-brand-text-secondary pt-2">
              <div className="p-3 rounded-xl bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200/60 dark:border-blue-900/40">
                <span className="font-bold text-blue-700 dark:text-blue-300 block mb-0.5">
                  When Enabled (Open Editing):
                </span>
                Faculty members can click "Add Student", edit contact numbers, addresses, and status with immediate cloud synchronization.
              </div>
              <div className="p-3 rounded-xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-900/40">
                <span className="font-bold text-amber-700 dark:text-amber-300 block mb-0.5">
                  When Disabled (View-Only Safeguard):
                </span>
                The spreadsheet is locked into safe read-only mode for non-admin users. Only verified school administrators can submit mutations.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: BELL SCHEDULE & PERIOD TIMINGS */}
      {activeTab === 'periods' && (
        <div className="space-y-5 animate-fadeIn">
          <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-brand-surface border border-brand-border shadow-soft flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-brand-text-primary flex items-center gap-2">
                <Clock className="w-4 h-4 text-brand-primary" />
                <span>School Bell Timetable & Period Duration</span>
              </h3>
              <p className="text-xs text-brand-text-secondary">
                Adjust morning assembly, class period start/end timings, and Friday timings.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleAddPeriod}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-brand-primary hover:bg-brand-primary/90 shadow-soft active:scale-95 transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Period</span>
              </button>
            </div>
          </div>

          {/* Periods Table */}
          <div className="rounded-2xl border border-brand-border bg-white dark:bg-brand-surface shadow-soft overflow-hidden">
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50/75 dark:bg-slate-900/40 border-b border-brand-border font-bold text-brand-text-secondary">
                    <th className="py-3 px-4">Period Name</th>
                    <th className="py-3 px-4">Mon–Thu Start</th>
                    <th className="py-3 px-4">Mon–Thu End</th>
                    <th className="py-3 px-4">Friday Start</th>
                    <th className="py-3 px-4">Friday End</th>
                    <th className="py-3 px-3 text-center">Duration</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-border/60">
                  {workingConfig.periods.map((period, idx) => (
                    <tr
                      key={idx}
                      className={
                        period.isBreak
                          ? 'bg-amber-50/40 dark:bg-amber-950/20 font-semibold'
                          : 'hover:bg-slate-50/50 dark:hover:bg-slate-800/30'
                      }
                    >
                      <td className="py-3 px-4">
                        <input
                          type="text"
                          value={period.name}
                          onChange={(e) => handlePeriodChange(idx, 'name', e.target.value)}
                          className="w-full max-w-[180px] px-2 py-1 rounded-lg text-xs font-bold bg-white dark:bg-brand-panel border border-brand-border text-brand-text-primary focus:outline-none focus:border-brand-primary"
                        />
                      </td>
                      <td className="py-3 px-4">
                        <input
                          type="text"
                          value={period.start}
                          onChange={(e) => handlePeriodChange(idx, 'start', e.target.value)}
                          className="w-24 px-2 py-1 rounded-lg text-xs font-mono bg-white dark:bg-brand-panel border border-brand-border text-brand-text-primary focus:outline-none focus:border-brand-primary"
                        />
                      </td>
                      <td className="py-3 px-4">
                        <input
                          type="text"
                          value={period.end}
                          onChange={(e) => handlePeriodChange(idx, 'end', e.target.value)}
                          className="w-24 px-2 py-1 rounded-lg text-xs font-mono bg-white dark:bg-brand-panel border border-brand-border text-brand-text-primary focus:outline-none focus:border-brand-primary"
                        />
                      </td>
                      <td className="py-3 px-4">
                        <input
                          type="text"
                          value={period.friStart || ''}
                          onChange={(e) => handlePeriodChange(idx, 'friStart', e.target.value)}
                          placeholder="e.g. 8:15 AM"
                          className="w-24 px-2 py-1 rounded-lg text-xs font-mono bg-white dark:bg-brand-panel border border-brand-border text-brand-text-primary focus:outline-none focus:border-brand-primary"
                        />
                      </td>
                      <td className="py-3 px-4">
                        <input
                          type="text"
                          value={period.friEnd || ''}
                          onChange={(e) => handlePeriodChange(idx, 'friEnd', e.target.value)}
                          placeholder="e.g. 8:50 AM"
                          className="w-24 px-2 py-1 rounded-lg text-xs font-mono bg-white dark:bg-brand-panel border border-brand-border text-brand-text-primary focus:outline-none focus:border-brand-primary"
                        />
                      </td>
                      <td className="py-3 px-3 text-center font-mono font-bold text-brand-primary">
                        {period.durationMinutes || 40}m
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => handleRemovePeriod(idx)}
                          className="p-1 rounded-lg text-brand-text-secondary hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: SCHOOL IDENTITY */}
      {activeTab === 'identity' && (
        <div className="p-6 rounded-2xl bg-white dark:bg-brand-surface border border-brand-border shadow-soft space-y-4 max-w-3xl animate-fadeIn">
          <h3 className="text-sm font-bold text-brand-text-primary flex items-center gap-2">
            <Building2 className="w-4 h-4 text-brand-primary" />
            <span>School Institutional Details</span>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-brand-text-secondary mb-1">
                Official School Name
              </label>
              <input
                type="text"
                value={workingConfig.schoolName}
                onChange={(e) => setWorkingConfig((prev) => ({ ...prev, schoolName: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl text-xs font-medium bg-white dark:bg-brand-panel border border-brand-border text-brand-text-primary focus:outline-none focus:border-brand-primary"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-brand-text-secondary mb-1">
                Academic Session
              </label>
              <input
                type="text"
                value={workingConfig.academicSession}
                onChange={(e) => setWorkingConfig((prev) => ({ ...prev, academicSession: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl text-xs font-medium bg-white dark:bg-brand-panel border border-brand-border text-brand-text-primary focus:outline-none focus:border-brand-primary"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-brand-text-secondary mb-1">
                Examination Board Affiliation
              </label>
              <input
                type="text"
                value={workingConfig.affiliation}
                onChange={(e) => setWorkingConfig((prev) => ({ ...prev, affiliation: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl text-xs font-medium bg-white dark:bg-brand-panel border border-brand-border text-brand-text-primary focus:outline-none focus:border-brand-primary"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-brand-text-secondary mb-1">
                Principal / Head Name
              </label>
              <input
                type="text"
                value={workingConfig.principalName}
                onChange={(e) => setWorkingConfig((prev) => ({ ...prev, principalName: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl text-xs font-medium bg-white dark:bg-brand-panel border border-brand-border text-brand-text-primary focus:outline-none focus:border-brand-primary"
              />
            </div>
          </div>
        </div>
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
    </div>
  );
};

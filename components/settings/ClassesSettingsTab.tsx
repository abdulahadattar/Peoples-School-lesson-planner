import React from 'react';
import { Search, Plus, Edit2, Trash2 } from 'lucide-react';
import { ClassTeacherConfig, SchoolConfig } from '../../services/schoolConfigService';

export interface ClassesSettingsTabProps {
  workingConfig: SchoolConfig;
  setWorkingConfig: React.Dispatch<React.SetStateAction<SchoolConfig>>;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  filteredClasses: ClassTeacherConfig[];
  classTotals: {
    classesCount: number;
    boys: number;
    girls: number;
    total: number;
  };
  onAddClass: () => void;
  onEditClass: (cls: ClassTeacherConfig) => void;
  onDeleteClass: (classKey: string) => void;
}

export const ClassesSettingsTab: React.FC<ClassesSettingsTabProps> = ({
  workingConfig,
  setWorkingConfig,
  searchQuery,
  setSearchQuery,
  filteredClasses,
  classTotals,
  onAddClass,
  onEditClass,
  onDeleteClass,
}) => {
  return (
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
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
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
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
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
          onClick={onAddClass}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-brand-primary hover:bg-brand-primary/90 shadow-soft active:scale-95 transition-all self-start sm:self-auto cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add New Class Section</span>
        </button>
      </div>

      {/* Classes Table */}
      <div className="rounded-2xl border border-brand-border bg-white dark:bg-brand-surface shadow-soft overflow-hidden">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left text-xs border-collapse min-w-[720px]">
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
                        onClick={() => onEditClass(cls)}
                        className="p-1.5 rounded-lg min-w-[36px] min-h-[36px] flex items-center justify-center text-brand-text-secondary hover:text-brand-primary hover:bg-brand-bg transition-colors active:bg-brand-bg cursor-pointer"
                        title="Edit class"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteClass(cls.classKey)}
                        className="p-1.5 rounded-lg min-w-[36px] min-h-[36px] flex items-center justify-center text-brand-text-secondary hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors active:bg-rose-50 cursor-pointer"
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
  );
};

import React from 'react';
import { Plus, Edit2, Trash2 } from 'lucide-react';
import { ClassTeacherConfig, SchoolConfig } from '../../services/schoolConfigService';
import { SearchInput } from '../ui/SearchInput';
import { SegmentedControl } from '../ui/SegmentedControl';
import { ClassesMobileCards } from './ClassesMobileCards';

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
    <div className="space-y-6 animate-fadeIn">
      {/* Tabular Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="p-4 rounded-2xl bg-brand-surface border border-brand-border">
          <span className="text-xs font-medium text-brand-text-secondary block">Class Levels</span>
          <span className="text-2xl font-bold text-brand-text-primary font-mono tabular-nums mt-1 block">
            {classTotals.classesCount}
          </span>
        </div>

        <div className="p-4 rounded-2xl bg-brand-surface border border-brand-border">
          <span className="text-xs font-medium text-brand-text-secondary block">Enrolled Boys</span>
          <span className="text-2xl font-bold text-blue-700 dark:text-blue-300 font-mono tabular-nums mt-1 block">
            {classTotals.boys.toLocaleString()}
          </span>
        </div>

        <div className="p-4 rounded-2xl bg-brand-surface border border-brand-border">
          <span className="text-xs font-medium text-brand-text-secondary block">Enrolled Girls</span>
          <span className="text-2xl font-bold text-rose-700 dark:text-rose-300 font-mono tabular-nums mt-1 block">
            {classTotals.girls.toLocaleString()}
          </span>
        </div>

        <div className="p-4 rounded-2xl bg-brand-surface border border-brand-border">
          <span className="text-xs font-medium text-brand-text-secondary block">Total School Strength</span>
          <span className="text-2xl font-bold text-emerald-700 dark:text-emerald-300 font-mono tabular-nums mt-1 block">
            {classTotals.total.toLocaleString()}
          </span>
        </div>
      </div>

      {/* Attendance Student Count Source */}
      <div className="p-4 sm:p-5 rounded-2xl bg-brand-surface border border-brand-border flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-xs font-bold text-brand-text-primary">
            Daily Attendance Enrollment Source
          </h2>
          <p className="text-xs text-brand-text-secondary max-w-2xl">
            Where the attendance register reads student strength for each grade.
          </p>
        </div>

        <div className="w-full md:w-72 shrink-0">
          <SegmentedControl
            size="sm"
            value={workingConfig.enrollmentMode}
            onChange={(mode) =>
              setWorkingConfig((prev) => ({
                ...prev,
                enrollmentMode: mode as 'manual' | 'google_sheet',
              }))
            }
            options={[
              { value: 'manual', label: 'Manual Values' },
              { value: 'google_sheet', label: 'Google Sheet Sync' },
            ]}
          />
        </div>
      </div>

      {/* Search and Add Class Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <SearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Search grade, room, or advisor..."
          resultCount={filteredClasses.length}
          className="flex-1 max-w-sm"
        />

        <button
          type="button"
          onClick={onAddClass}
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2 min-h-[44px] sm:min-h-[40px] w-full sm:w-auto rounded-xl text-xs font-semibold text-white bg-brand-primary hover:bg-brand-primary-hover shadow-soft active:scale-[0.98] transition-[background-color,transform] cursor-pointer whitespace-nowrap shrink-0"
        >
          <Plus className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Add Class Section</span>
        </button>
      </div>

      {/* Mobile Cards View */}
      <ClassesMobileCards
        classes={filteredClasses}
        onEditClass={onEditClass}
        onDeleteClass={onDeleteClass}
      />

      {/* Desktop Classes Table */}
      <div className="hidden md:block rounded-2xl border border-brand-border bg-brand-surface overflow-hidden">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left text-xs border-collapse min-w-[780px]">
            <thead>
              <tr className="bg-brand-panel/60 border-b border-brand-border font-semibold text-brand-text-secondary">
                <th className="py-3 px-4">Class & Sections</th>
                <th className="py-3 px-4">Room & Capacity</th>
                <th className="py-3 px-4">Class Advisor</th>
                <th className="py-3 px-3 text-right">Boys</th>
                <th className="py-3 px-3 text-right">Girls</th>
                <th className="py-3 px-3 text-right">Total</th>
                <th className="py-3 px-4">Subjects</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-border/70">
              {filteredClasses.map((cls) => {
                const splitSum = cls.enrolledBoys + cls.enrolledGirls;
                const rowTotal = cls.totalEnrollment && cls.totalEnrollment > 0 ? cls.totalEnrollment : splitSum;
                const unsplit = rowTotal - splitSum;
                const overCapacity = typeof cls.capacity === 'number' && cls.capacity > 0 && rowTotal > cls.capacity;

                return (
                  <tr
                    key={cls.classKey}
                    className="hover:bg-brand-panel/40 transition-colors"
                  >
                    <td className="py-3 px-4">
                      <div className="font-mono font-bold text-brand-text-primary">{cls.romanName}</div>
                      <div className="text-[11px] text-brand-text-secondary">
                        {cls.sections && cls.sections.length > 1
                          ? `${cls.displayName} · ${cls.sections.join(', ')}`
                          : cls.displayName}
                      </div>
                    </td>

                    <td className="py-3 px-4">
                      <div className="font-medium text-brand-text-primary">
                        {cls.roomNumber || 'Room TBD'}
                      </div>
                      <div
                        className={`text-[11px] font-mono tabular-nums ${
                          overCapacity
                            ? 'text-amber-700 dark:text-amber-300 font-semibold'
                            : 'text-brand-text-secondary'
                        }`}
                      >
                        {cls.capacity
                          ? overCapacity
                            ? `${rowTotal}/${cls.capacity} · Over capacity`
                            : `Cap ${cls.capacity}`
                          : 'Capacity unset'}
                      </div>
                    </td>

                    <td className="py-3 px-4 font-medium text-brand-text-primary">
                      {cls.classTeacher || 'Unassigned'}
                    </td>

                    <td className="py-3 px-3 text-right font-mono tabular-nums font-semibold text-blue-700 dark:text-blue-300">
                      {cls.enrolledBoys}
                    </td>

                    <td className="py-3 px-3 text-right font-mono tabular-nums font-semibold text-rose-700 dark:text-rose-300">
                      {cls.enrolledGirls}
                    </td>

                    <td className="py-3 px-3 text-right font-mono tabular-nums font-bold text-brand-text-primary">
                      <div>{rowTotal}</div>
                      {unsplit > 0 && (
                        <div className="text-[10px] font-normal text-brand-text-secondary">
                          +{unsplit} unsplit
                        </div>
                      )}
                    </td>

                    <td className="py-3 px-4 text-brand-text-secondary text-[11px] max-w-[220px] truncate">
                      {cls.subjects?.join(', ') || 'Standard Curriculum'}
                    </td>

                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => onEditClass(cls)}
                          aria-label={`Edit ${cls.displayName}`}
                          className="p-2 rounded-lg min-w-[36px] min-h-[36px] inline-flex items-center justify-center text-brand-text-secondary hover:text-brand-primary hover:bg-brand-panel transition-colors cursor-pointer"
                        >
                          <Edit2 className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteClass(cls.classKey)}
                          aria-label={`Remove ${cls.displayName}`}
                          className="p-2 rounded-lg min-w-[36px] min-h-[36px] inline-flex items-center justify-center text-brand-text-secondary hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredClasses.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-xs text-brand-text-secondary">
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

import React from 'react';
import { Plus, Edit2, Trash2, UserPlus } from 'lucide-react';
import { Teacher } from '../../types';
import { getCachedSchoolConfig } from '../../services/schoolConfigService';
import { SearchInput } from '../ui/SearchInput';
import { EmptyState } from '../ui/EmptyState';

export interface TeachersSettingsTabProps {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  filteredTeachers: Teacher[];
  schoolName?: string;
  onAddTeacher: () => void;
  onEditTeacher: (teacher: Teacher) => void;
  onDeleteTeacher: (teacherId: string) => void;
}

export const TeachersSettingsTab: React.FC<TeachersSettingsTabProps> = ({
  searchQuery,
  setSearchQuery,
  filteredTeachers,
  schoolName,
  onAddTeacher,
  onEditTeacher,
  onDeleteTeacher,
}) => {
  const resolvedSchoolName = schoolName || getCachedSchoolConfig().schoolName;

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Search & Action Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <SearchInput
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search faculty by name, role, or subject..."
            resultCount={filteredTeachers.length}
            className="flex-1 max-w-sm"
          />
          <span className="hidden md:inline text-xs font-mono tabular-nums text-brand-text-secondary whitespace-nowrap">
            {filteredTeachers.length} active
          </span>
        </div>

        <button
          type="button"
          onClick={onAddTeacher}
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2 min-h-[44px] sm:min-h-[40px] w-full sm:w-auto rounded-xl text-xs font-semibold text-white bg-brand-primary hover:bg-brand-primary-hover shadow-soft active:scale-[0.98] transition-[background-color,transform] cursor-pointer whitespace-nowrap shrink-0"
        >
          <Plus className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Add Faculty Member</span>
        </button>
      </div>

      {/* Uncluttered Extended Faculty Profiles Placeholder */}
      <section className="p-4 sm:p-5 rounded-2xl bg-brand-panel/60 dark:bg-brand-panel/40 border border-brand-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-brand-surface border border-brand-border flex items-center justify-center text-brand-primary shrink-0">
            <UserPlus className="w-4 h-4" aria-hidden="true" />
          </div>
          <div className="space-y-0.5">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xs font-bold text-brand-text-primary">
                Extended Faculty Profiles
              </h2>
              <span className="text-[11px] font-medium text-brand-text-tertiary">
                · Coming Soon
              </span>
            </div>
            <p className="text-xs text-brand-text-secondary">
              Contact numbers, academic qualifications, and leave allowances will be managed alongside roster assignments here.
            </p>
          </div>
        </div>
      </section>

      {/* Teachers Grid */}
      {filteredTeachers.length === 0 ? (
        <div className="rounded-2xl bg-brand-surface border border-brand-border">
          <EmptyState
            title="No faculty members matched"
            description="Adjust your search filter or add a new teacher to the faculty roster."
            action={{
              label: 'Add Faculty Member',
              onClick: onAddTeacher,
              icon: Plus,
            }}
            compact
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredTeachers.map((teacher) => {
            const totalSections = teacher.subjects.reduce(
              (acc, sub) => acc + (sub.sections?.length || 0),
              0
            );

            return (
              <article
                key={teacher.id}
                className="p-5 rounded-2xl bg-brand-surface border border-brand-border flex flex-col justify-between space-y-4 hover:border-brand-primary/40 transition-colors"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold text-brand-text-primary truncate">
                        {teacher.name}
                      </h3>
                      <div className="text-xs text-brand-text-secondary mt-0.5 flex items-center gap-1.5 flex-wrap">
                        <span>{teacher.designation || 'Subject Specialist'}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">
                          {teacher.subjects.length} subject{teacher.subjects.length === 1 ? '' : 's'}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">
                          {totalSections} slot{totalSections === 1 ? '' : 's'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => onEditTeacher(teacher)}
                        aria-label={`Edit ${teacher.name}`}
                        className="p-2 rounded-xl min-w-[40px] min-h-[40px] inline-flex items-center justify-center text-brand-text-secondary hover:text-brand-primary hover:bg-brand-panel transition-colors cursor-pointer"
                      >
                        <Edit2 className="w-4 h-4 sm:w-3.5 sm:h-3.5" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteTeacher(teacher.id)}
                        aria-label={`Remove ${teacher.name}`}
                        className="p-2 rounded-xl min-w-[40px] min-h-[40px] inline-flex items-center justify-center text-brand-text-secondary hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4 sm:w-3.5 sm:h-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </div>

                  {/* Clean Subjects & Sections list */}
                  <div className="divide-y divide-brand-border/60 border-t border-brand-border/60 pt-2">
                    {teacher.subjects.map((sub, idx) => (
                      <div key={idx} className="py-2 first:pt-1 last:pb-0 flex items-baseline justify-between gap-3 text-xs">
                        <span className="font-semibold text-brand-text-primary shrink-0">
                          {sub.name}
                        </span>
                        <span className="font-mono text-[11px] text-brand-text-secondary text-right truncate">
                          {sub.sections.length > 0 ? sub.sections.join(', ') : 'Unassigned'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-2.5 border-t border-brand-border/60 text-[11px] text-brand-text-tertiary truncate">
                  {resolvedSchoolName}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};

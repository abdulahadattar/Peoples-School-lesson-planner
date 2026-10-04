import React from 'react';
import { Search, Plus, Edit2, Trash2 } from 'lucide-react';
import { Teacher } from '../../types';

export interface TeachersSettingsTabProps {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  filteredTeachers: Teacher[];
  onAddTeacher: () => void;
  onEditTeacher: (teacher: Teacher) => void;
  onDeleteTeacher: (teacherId: string) => void;
}

export const TeachersSettingsTab: React.FC<TeachersSettingsTabProps> = ({
  searchQuery,
  setSearchQuery,
  filteredTeachers,
  onAddTeacher,
  onEditTeacher,
  onDeleteTeacher,
}) => {
  return (
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
          onClick={onAddTeacher}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-brand-primary hover:bg-brand-primary/90 shadow-soft active:scale-95 transition-all self-start sm:self-auto cursor-pointer"
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
                    onClick={() => onEditTeacher(teacher)}
                    className="p-1 rounded-lg min-w-[36px] min-h-[36px] flex items-center justify-center text-brand-text-secondary hover:text-brand-primary hover:bg-brand-bg transition-colors active:bg-brand-bg cursor-pointer"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteTeacher(teacher.id)}
                    className="p-1 rounded-lg min-w-[36px] min-h-[36px] flex items-center justify-center text-brand-text-secondary hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors active:bg-rose-50 cursor-pointer"
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
  );
};

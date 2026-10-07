import React from 'react';
import { Filter } from 'lucide-react';

export interface ClassChartsKpiCardsProps {
  largestClass: { className: string; total: number };
  totalStudents: number;
  classCount: number;
  maleCount: number;
  femaleCount: number;
  selectedClass: string;
  onSelectClass: (className: string) => void;
}

export const ClassChartsKpiCards: React.FC<ClassChartsKpiCardsProps> = ({
  largestClass,
  totalStudents,
  classCount,
  maleCount,
  femaleCount,
  selectedClass,
  onSelectClass,
}) => {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3 rounded-xl bg-slate-50/70 dark:bg-slate-900/40 border border-brand-border/80">
          <span className="text-[10px] font-bold uppercase tracking-wider text-brand-text-secondary block">
            Largest Class Strength
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-lg font-extrabold text-brand-primary font-mono">
              Class {largestClass.className}
            </span>
            <span className="text-xs text-brand-text-secondary font-semibold">
              ({largestClass.total} students)
            </span>
          </div>
        </div>

        <div className="p-3 rounded-xl bg-slate-50/70 dark:bg-slate-900/40 border border-brand-border/80">
          <span className="text-[10px] font-bold uppercase tracking-wider text-brand-text-secondary block">
            Average Class Strength
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-lg font-extrabold text-brand-text-primary font-mono">
              {classCount > 0 ? Math.round(totalStudents / classCount) : 0}
            </span>
            <span className="text-xs text-brand-text-secondary">students / grade</span>
          </div>
        </div>

        <div className="p-3 rounded-xl bg-slate-50/70 dark:bg-slate-900/40 border border-brand-border/80">
          <span className="text-[10px] font-bold uppercase tracking-wider text-sky-600 dark:text-sky-400 block">
            Boys Enrolled
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-lg font-extrabold text-sky-700 dark:text-sky-300 font-mono">
              {maleCount.toLocaleString()}
            </span>
            <span className="text-xs text-brand-text-secondary">
              ({totalStudents > 0 ? ((maleCount / totalStudents) * 100).toFixed(0) : 0}%)
            </span>
          </div>
        </div>

        <div className="p-3 rounded-xl bg-slate-50/70 dark:bg-slate-900/40 border border-brand-border/80">
          <span className="text-[10px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400 block">
            Girls Enrolled
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-lg font-extrabold text-rose-700 dark:text-rose-300 font-mono">
              {femaleCount.toLocaleString()}
            </span>
            <span className="text-xs text-brand-text-secondary">
              ({totalStudents > 0 ? ((femaleCount / totalStudents) * 100).toFixed(0) : 0}%)
            </span>
          </div>
        </div>
      </div>

      {selectedClass !== 'all' && (
        <div className="flex items-center justify-between px-3.5 py-2 rounded-xl bg-brand-primary/10 border border-brand-primary/20 text-xs">
          <span className="font-semibold text-brand-primary flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5" />
            Filtering student records by: <strong>Class {selectedClass}</strong>
          </span>
          <button
            type="button"
            onClick={() => onSelectClass('all')}
            className="text-xs font-bold text-brand-primary hover:underline cursor-pointer"
          >
            Reset to All Classes
          </button>
        </div>
      )}
    </div>
  );
};

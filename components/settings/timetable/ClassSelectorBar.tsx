import React from 'react';
import { TimetableAuditReport } from '../../../services/timetableConflictEngine';
import { ClassTabItem } from './TimetableClassGridView';

export interface ClassSelectorBarProps {
  filteredClasses: ClassTabItem[];
  totalClassCount: number;
  classFilter: string;
  setClassFilter: (val: string) => void;
  selectedClassLabel: string;
  setSelectedClassLabel: (label: string) => void;
  auditReport: TimetableAuditReport;
}

export const ClassSelectorBar: React.FC<ClassSelectorBarProps> = ({
  filteredClasses,
  totalClassCount,
  classFilter,
  setClassFilter,
  selectedClassLabel,
  setSelectedClassLabel,
  auditReport,
}) => {
  return (
    <div className="bg-brand-surface p-3.5 rounded-2xl border border-brand-border space-y-2.5 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="text-[11px] font-bold text-brand-text-secondary uppercase tracking-wider flex items-center gap-2">
          <span>Select Class Section:</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-brand-bg text-brand-text-secondary font-medium">
            {filteredClasses.length} of {totalClassCount} sections
          </span>
        </div>

        <div className="relative w-full sm:w-60">
          <input
            type="text"
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
            placeholder="Filter by class or teacher..."
            className="w-full px-3 py-1.5 pl-8 text-xs rounded-xl bg-brand-bg border border-brand-border focus:border-brand-primary text-brand-text-primary outline-hidden"
          />
          <svg
            className="w-3.5 h-3.5 text-brand-text-secondary absolute left-2.5 top-2.5 pointer-events-none"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          {classFilter && (
            <button
              type="button"
              onClick={() => setClassFilter('')}
              className="absolute right-2.5 top-2 text-xs text-brand-text-secondary hover:text-brand-text-primary cursor-pointer"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 max-h-36 overflow-y-auto p-1 bg-brand-bg/60 rounded-xl border border-brand-border/60">
        {filteredClasses.map((cls) => {
          const isSelected = cls.label === selectedClassLabel;
          const hasClashInClass = auditReport.clashes.some((c) => c.classes.includes(cls.label));

          return (
            <button
              key={cls.key}
              type="button"
              onClick={() => setSelectedClassLabel(cls.label)}
              className={`relative px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                isSelected
                  ? 'bg-brand-primary text-white shadow-sm ring-2 ring-brand-primary/20 font-bold'
                  : 'bg-brand-surface text-brand-text-secondary hover:text-brand-text-primary hover:bg-brand-surface/90 border border-brand-border/60'
              }`}
            >
              <span>{cls.label}</span>
              {hasClashInClass && (
                <span
                  className="ml-1.5 inline-block w-2 h-2 rounded-full bg-rose-500 animate-pulse"
                  title="Scheduling clash in this class"
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

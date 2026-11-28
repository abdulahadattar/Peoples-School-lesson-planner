import React from 'react';
import { Edit2, Trash2 } from 'lucide-react';
import { ClassTeacherConfig } from '../../services/schoolConfigService';

export interface ClassesMobileCardsProps {
  classes: ClassTeacherConfig[];
  onEditClass: (cls: ClassTeacherConfig) => void;
  onDeleteClass: (classKey: string) => void;
}

export const ClassesMobileCards: React.FC<ClassesMobileCardsProps> = ({
  classes,
  onEditClass,
  onDeleteClass,
}) => {
  if (classes.length === 0) {
    return (
      <div className="md:hidden rounded-2xl border border-brand-border bg-brand-surface py-10 px-4 text-center text-xs text-brand-text-secondary">
        No matching class sections found.
      </div>
    );
  }

  return (
    <div className="md:hidden space-y-3">
      {classes.map((cls) => {
        const splitSum = cls.enrolledBoys + cls.enrolledGirls;
        const rowTotal =
          cls.totalEnrollment && cls.totalEnrollment > 0 ? cls.totalEnrollment : splitSum;
        const unsplit = rowTotal - splitSum;
        const overCapacity =
          typeof cls.capacity === 'number' && cls.capacity > 0 && rowTotal > cls.capacity;

        return (
          <article
            key={cls.classKey}
            className="p-4 rounded-2xl bg-brand-surface border border-brand-border space-y-3"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-sm font-bold text-brand-primary">
                    {cls.romanName}
                  </span>
                  <h3 className="text-sm font-bold text-brand-text-primary truncate">
                    {cls.displayName}
                  </h3>
                </div>
                {cls.sections && cls.sections.length > 1 && (
                  <p className="text-[11px] text-brand-text-secondary mt-0.5">
                    Sections: {cls.sections.join(', ')}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-1 shrink-0 -mr-1 -mt-1">
                <button
                  type="button"
                  onClick={() => onEditClass(cls)}
                  aria-label={`Edit ${cls.displayName}`}
                  className="min-w-[44px] min-h-[44px] rounded-xl inline-flex items-center justify-center text-brand-text-secondary hover:text-brand-primary hover:bg-brand-panel transition-colors cursor-pointer"
                >
                  <Edit2 className="w-4 h-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteClass(cls.classKey)}
                  aria-label={`Remove ${cls.displayName}`}
                  className="min-w-[44px] min-h-[44px] rounded-xl inline-flex items-center justify-center text-brand-text-secondary hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs pt-1 border-t border-brand-border/60">
              <div className="min-w-0">
                <span className="text-[11px] text-brand-text-tertiary block">Room & Capacity</span>
                <span className="font-medium text-brand-text-primary block truncate">
                  {cls.roomNumber || 'Room TBD'}
                </span>
                <span
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
                </span>
              </div>

              <div className="min-w-0">
                <span className="text-[11px] text-brand-text-tertiary block">Class Advisor</span>
                <span className="font-medium text-brand-text-primary block truncate">
                  {cls.classTeacher || 'Unassigned'}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 pt-2.5 border-t border-brand-border/60 text-center">
              <div className="py-1.5 rounded-xl bg-brand-panel/60">
                <span className="text-[10px] text-brand-text-tertiary block">Boys</span>
                <span className="text-sm font-bold font-mono tabular-nums text-blue-700 dark:text-blue-300">
                  {cls.enrolledBoys}
                </span>
              </div>
              <div className="py-1.5 rounded-xl bg-brand-panel/60">
                <span className="text-[10px] text-brand-text-tertiary block">Girls</span>
                <span className="text-sm font-bold font-mono tabular-nums text-rose-700 dark:text-rose-300">
                  {cls.enrolledGirls}
                </span>
              </div>
              <div className="py-1.5 rounded-xl bg-brand-panel/60">
                <span className="text-[10px] text-brand-text-tertiary block">Total</span>
                <span className="text-sm font-bold font-mono tabular-nums text-brand-text-primary">
                  {rowTotal}
                </span>
                {unsplit > 0 && (
                  <span className="text-[10px] text-brand-text-secondary block">
                    +{unsplit} unsplit
                  </span>
                )}
              </div>
            </div>

            {cls.subjects && cls.subjects.length > 0 && (
              <p className="text-[11px] text-brand-text-secondary leading-relaxed pt-1 border-t border-brand-border/50">
                {cls.subjects.join(', ')}
              </p>
            )}
          </article>
        );
      })}
    </div>
  );
};

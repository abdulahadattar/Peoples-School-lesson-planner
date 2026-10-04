import React from 'react';
import { SavedLessonPlanItem } from '../../services/storageService';
import { LessonPlan } from '../../types';

export interface SavedPlanCardProps {
  item: SavedLessonPlanItem;
  exportingId: string | null;
  onOpenLessonPlan: (plan: LessonPlan) => void;
  onDeletePlan: (id: string, e: React.MouseEvent) => void;
  onExportDocx: (item: SavedLessonPlanItem, e: React.MouseEvent) => void;
}

export const SavedPlanCard: React.FC<SavedPlanCardProps> = ({
  item,
  exportingId,
  onOpenLessonPlan,
  onDeletePlan,
  onExportDocx,
}) => {
  return (
    <div
      onClick={() => onOpenLessonPlan(item.plan)}
      className="group bg-brand-surface p-4 rounded-xl border border-brand-border hover:border-emerald-500/40 hover:shadow-card-hover transition-all cursor-pointer flex flex-col justify-between"
    >
      <div>
        <div className="flex items-start justify-between gap-2">
          <span className="px-2 py-0.5 text-[11px] font-semibold rounded bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
            {item.plan.subject} • {item.plan.gradeLevel}
          </span>
          <span className="text-[11px] text-brand-text-secondary">
            {new Date(item.createdAt).toLocaleDateString()}
          </span>
        </div>

        <h3 className="text-base font-bold text-brand-text-primary mt-2 group-hover:text-emerald-600 transition-colors line-clamp-1">
          {item.plan.title}
        </h3>

        {item.sloId && (
          <p className="text-xs font-mono text-brand-text-secondary mt-1">
            SLO ID: {item.sloId}
          </p>
        )}

        <p className="text-xs text-brand-text-secondary mt-2 line-clamp-2">
          {item.plan.learningObjectives?.join(', ') || 'No objectives listed'}
        </p>
      </div>

      <div className="mt-4 pt-3 border-t border-brand-border flex items-center justify-between">
        <button
          type="button"
          onClick={(e) => onDeletePlan(item.id, e)}
          className="text-xs text-red-500 hover:text-red-700 hover:underline cursor-pointer"
        >
          Delete
        </button>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={exportingId === item.id}
            onClick={(e) => onExportDocx(item, e)}
            className="px-2.5 py-1 text-xs font-medium rounded bg-brand-bg hover:bg-brand-border text-brand-text-primary border border-brand-border cursor-pointer disabled:opacity-40"
          >
            DOCX
          </button>
          <span className="text-xs font-medium text-emerald-600 group-hover:underline pl-1">
            Open →
          </span>
        </div>
      </div>
    </div>
  );
};

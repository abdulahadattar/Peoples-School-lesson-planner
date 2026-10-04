import React from 'react';
import { SavedExamPaperItem } from '../../services/storageService';
import { GeneratedPaper } from '../../types';

export interface SavedPaperCardProps {
  item: SavedExamPaperItem;
  exportingId: string | null;
  onOpenPaper: (paper: GeneratedPaper) => void;
  onDeletePaper: (id: string, e: React.MouseEvent) => void;
  onExportDocx: (item: SavedExamPaperItem, e: React.MouseEvent) => void;
  onExportPdf: (item: SavedExamPaperItem, e: React.MouseEvent) => void;
}

export const SavedPaperCard: React.FC<SavedPaperCardProps> = ({
  item,
  exportingId,
  onOpenPaper,
  onDeletePaper,
  onExportDocx,
  onExportPdf,
}) => {
  return (
    <div className="group bg-brand-surface p-4 rounded-xl border border-brand-border hover:border-brand-primary/40 hover:shadow-card-hover transition-all flex flex-col justify-between">
      <button
        type="button"
        onClick={() => onOpenPaper({ ...item.paper, savedPaperId: item.id })}
        aria-label={`Open paper: ${item.paper.title}`}
        className="text-left w-full rounded-lg active:opacity-70 transition-opacity cursor-pointer"
      >
        <div>
          <div className="flex items-start justify-between gap-2">
            <span className="px-2 py-0.5 text-[11px] font-semibold rounded bg-brand-primary/10 text-brand-primary">
              {item.paper.subject} • {item.paper.gradeLevel}
            </span>
            <span className="text-[11px] text-brand-text-secondary">
              {new Date(item.createdAt).toLocaleDateString()}
            </span>
          </div>

          <h3 className="text-base font-bold text-brand-text-primary mt-2 group-hover:text-brand-primary transition-colors line-clamp-1">
            {item.paper.title}
          </h3>

          <p className="text-xs text-brand-text-secondary mt-1">
            Chapter: {item.paper.chapterName || 'General Syllabus'}
          </p>

          <div className="flex items-center gap-3 mt-3 text-xs text-brand-text-secondary">
            <span>{item.paper.totalMarks} Marks</span>
            <span>•</span>
            <span>{item.paper.durationMinutes} Mins</span>
            <span>•</span>
            <span>{item.paper.sections.length} Sections</span>
          </div>
        </div>
      </button>

      <div className="mt-4 pt-3 border-t border-brand-border flex items-center justify-between">
        <button
          type="button"
          onClick={(e) => onDeletePaper(item.id, e)}
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
          <button
            type="button"
            disabled={exportingId === item.id}
            onClick={(e) => onExportPdf(item, e)}
            className="px-2.5 py-1 text-xs font-medium rounded bg-brand-bg hover:bg-brand-border text-brand-text-primary border border-brand-border cursor-pointer disabled:opacity-40"
          >
            PDF
          </button>
          <span className="text-xs font-medium text-brand-primary group-hover:underline pl-1">
            Open →
          </span>
        </div>
      </div>
    </div>
  );
};

import React from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

export interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  pageSizeOptions?: number[];
  itemLabel?: string;
  className?: string;
}

export const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50, 100],
  itemLabel = 'records',
  className = '',
}) => {
  if (totalItems <= 0 || totalPages <= 1) return null;

  const startItem = (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalItems);

  const pages = Array.from({ length: Math.min(5, totalPages) }, (_, idx) => {
    let pageNum = idx + 1;
    if (totalPages > 5 && currentPage > 3) {
      pageNum = currentPage - 3 + idx;
      if (pageNum > totalPages) pageNum = totalPages - (4 - idx);
    }
    return pageNum;
  });

  return (
    <div
      className={`py-3.5 px-4 border-t border-brand-border bg-slate-50/50 dark:bg-slate-900/40 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs ${className}`}
    >
      <div className="flex items-center gap-3">
        <span className="text-brand-text-secondary">
          Page <strong className="text-brand-text-primary">{currentPage}</strong> of{' '}
          <strong className="text-brand-text-primary">{totalPages}</strong> ({startItem} - {endItem} of{' '}
          {totalItems} {itemLabel})
        </span>

        {onPageSizeChange && (
          <div className="flex items-center gap-1.5 ml-2">
            <span className="text-slate-400">|</span>
            <span className="text-brand-text-secondary">Per page:</span>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="bg-white dark:bg-brand-surface border border-brand-border rounded px-2 py-0.5 text-xs text-brand-text-primary focus:ring-1 focus:ring-primary focus:outline-hidden cursor-pointer"
            >
              {pageSizeOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onPageChange(1)}
          disabled={currentPage <= 1}
          className="p-1.5 rounded-lg border border-brand-border bg-white dark:bg-brand-surface text-brand-text-primary hover:bg-brand-bg transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          title="First page"
          aria-label="First page"
        >
          <ChevronsLeft className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage <= 1}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-brand-border bg-white dark:bg-brand-surface text-brand-text-primary font-semibold hover:bg-brand-bg transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          aria-label="Previous page"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          <span>Previous</span>
        </button>

        <div className="flex items-center gap-1">
          {pages.map((pageNum) => (
            <button
              key={pageNum}
              type="button"
              onClick={() => onPageChange(pageNum)}
              className={`w-7 h-7 rounded-lg font-mono font-semibold transition-colors cursor-pointer ${
                currentPage === pageNum
                  ? 'bg-brand-primary text-white'
                  : 'text-brand-text-secondary hover:bg-brand-bg'
              }`}
            >
              {pageNum}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage >= totalPages}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-brand-border bg-white dark:bg-brand-surface text-brand-text-primary font-semibold hover:bg-brand-bg transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          aria-label="Next page"
        >
          <span>Next</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={() => onPageChange(totalPages)}
          disabled={currentPage >= totalPages}
          className="p-1.5 rounded-lg border border-brand-border bg-white dark:bg-brand-surface text-brand-text-primary hover:bg-brand-bg transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          title="Last page"
          aria-label="Last page"
        >
          <ChevronsRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};

export const PaginationControl = Pagination;
export type PaginationControlProps = PaginationProps;


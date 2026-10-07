import React from 'react';
import { Search, RotateCw, Link as LinkIcon, Download } from 'lucide-react';
import { CLASS_OPTIONS } from '../../../types/documentArchive';

export interface ArchiveFilterBarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  selectedClass: string;
  onClassChange: (cls: string) => void;
  statusFilter: 'all' | 'flagged' | 'clean' | 'missing';
  onStatusFilterChange: (status: 'all' | 'flagged' | 'clean' | 'missing') => void;
  isAutoLinking: boolean;
  onAutoLink: () => void;
  isRescanningAll: boolean;
  onRescanAll: () => void;
  onDownloadReport: () => void;
}

export const ArchiveFilterBar: React.FC<ArchiveFilterBarProps> = ({
  searchQuery,
  onSearchChange,
  selectedClass,
  onClassChange,
  statusFilter,
  onStatusFilterChange,
  isAutoLinking,
  onAutoLink,
  isRescanningAll,
  onRescanAll,
  onDownloadReport,
}) => {
  return (
    <div className="flex flex-col md:flex-row items-center justify-between gap-3 bg-white dark:bg-brand-surface p-3.5 rounded-2xl border border-brand-border shadow-soft">
      <div className="flex items-center gap-2.5 w-full md:w-auto flex-1 max-w-lg">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-brand-text-tertiary" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search by student name, father name, GR # or B-Form..."
            className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-brand-bg border border-brand-border text-brand-text-primary placeholder:text-brand-text-tertiary focus:outline-hidden focus:border-brand-primary"
          />
        </div>

        <select
          value={selectedClass}
          onChange={(e) => onClassChange(e.target.value)}
          aria-label="Filter documents by class"
          className="px-3 py-2 text-xs rounded-xl bg-brand-bg border border-brand-border text-brand-text-primary focus:outline-hidden focus:border-brand-primary"
        >
          <option value="ALL">All Classes</option>
          {CLASS_OPTIONS.map((c) => (
            <option key={c} value={c}>
              Class {c}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2 w-full md:w-auto justify-end flex-wrap">
        <div className="flex items-center bg-brand-bg rounded-xl p-0.5 border border-brand-border text-xs">
          {(['all', 'flagged', 'clean', 'missing'] as const).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => onStatusFilterChange(st)}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer ${
                statusFilter === st
                  ? 'bg-white dark:bg-slate-800 text-brand-primary shadow-xs'
                  : 'text-brand-text-secondary hover:text-brand-text-primary'
              }`}
            >
              {st.charAt(0).toUpperCase() + st.slice(1)}
            </button>
          ))}
        </div>

        <button
          type="button"
          disabled={isAutoLinking}
          onClick={onAutoLink}
          title="Auto-Link Unassigned Documents to Google Sheet"
          className="p-2 rounded-xl border border-brand-border text-brand-text-secondary hover:text-brand-primary hover:bg-brand-bg transition-colors cursor-pointer disabled:opacity-50"
        >
          <LinkIcon className={`w-4 h-4 ${isAutoLinking ? 'animate-spin' : ''}`} />
        </button>

        <button
          type="button"
          disabled={isRescanningAll}
          onClick={onRescanAll}
          title="Re-scan all documents with AI"
          className="p-2 rounded-xl border border-brand-border text-brand-text-secondary hover:text-brand-primary hover:bg-brand-bg transition-colors cursor-pointer disabled:opacity-50"
        >
          <RotateCw className={`w-4 h-4 ${isRescanningAll ? 'animate-spin' : ''}`} />
        </button>

        <button
          type="button"
          onClick={onDownloadReport}
          title="Download Audit Report & Clean ZIP"
          className="p-2 rounded-xl border border-brand-border text-brand-text-secondary hover:text-brand-primary hover:bg-brand-bg transition-colors cursor-pointer"
        >
          <Download className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

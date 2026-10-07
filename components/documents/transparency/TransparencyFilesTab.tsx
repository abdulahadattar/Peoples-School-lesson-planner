import React from 'react';
import { ChevronDown, ChevronUp, FileText, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { JobFileItem } from '../../../types/documentArchive';

export interface TransparencyFilesTabProps {
  files: JobFileItem[];
  fileFilter: 'ALL' | 'SUCCESS' | 'FAILED' | 'FLAGGED';
  setFileFilter: (filter: 'ALL' | 'SUCCESS' | 'FAILED' | 'FLAGGED') => void;
  expandedFileId: string | null;
  setExpandedFileId: (id: string | null) => void;
}

export const TransparencyFilesTab: React.FC<TransparencyFilesTabProps> = ({
  files,
  fileFilter,
  setFileFilter,
  expandedFileId,
  setExpandedFileId,
}) => {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-1.5">
          {(['ALL', 'SUCCESS', 'FAILED', 'FLAGGED'] as const).map((filter) => (
            <button
              key={filter}
              type="button"
              onClick={() => setFileFilter(filter)}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                fileFilter === filter
                  ? 'bg-brand-primary text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
              }`}
            >
              {filter.charAt(0) + filter.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
        <span className="text-xs text-brand-text-tertiary">
          Showing {files.length} file{files.length === 1 ? '' : 's'}
        </span>
      </div>

      {files.length === 0 ? (
        <div className="p-10 text-center text-xs text-brand-text-tertiary bg-slate-50 dark:bg-slate-900/40 rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
          No files matching selected filter.
        </div>
      ) : (
        <div className="space-y-2 max-h-[420px] overflow-y-auto custom-scrollbar pr-1">
          {files.map((file) => {
            const isExpanded = expandedFileId === file.id;
            return (
              <div
                key={file.id}
                className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl p-3 shadow-2xs hover:border-slate-300 dark:hover:border-slate-700 transition-all text-xs"
              >
                <div
                  onClick={() => setExpandedFileId(isExpanded ? null : file.id)}
                  className="flex items-center justify-between gap-3 cursor-pointer select-none"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                      <FileText className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-brand-text-primary truncate">
                        {file.originalFilename}
                      </div>
                      <div className="text-[10px] text-brand-text-tertiary flex items-center gap-2">
                        <span>GR #{file.grNo || 'Unassigned'}</span>
                        <span>•</span>
                        <span>{file.classification || 'Unclassified'}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {file.status === 'success' && (
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Done
                      </span>
                    )}
                    {file.status === 'failed' && (
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" /> Error
                      </span>
                    )}
                    {file.status === 'in_progress' && (
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300 flex items-center gap-1">
                        <RefreshCw className="w-3 h-3 animate-spin" /> Processing
                      </span>
                    )}
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-slate-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-slate-400" />
                    )}
                  </div>
                </div>

                {isExpanded && (
                  <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2 text-[11px] animate-fadeIn">
                    <div className="grid grid-cols-2 gap-2 bg-slate-50 dark:bg-slate-950 p-2.5 rounded-lg border border-slate-200/60 dark:border-slate-800">
                      <div>
                        <span className="text-slate-400">Model Used:</span>{' '}
                        <span className="font-mono font-semibold">{file.aiModelUsed || 'None'}</span>
                      </div>
                      <div>
                        <span className="text-slate-400">Execution Time:</span>{' '}
                        <span className="font-mono font-semibold">{file.executionTimeMs ? `${file.executionTimeMs}ms` : '—'}</span>
                      </div>
                      <div>
                        <span className="text-slate-400">Rotation:</span>{' '}
                        <span className="font-mono font-semibold">{file.rotationApplied ?? 0}°</span>
                      </div>
                      <div>
                        <span className="text-slate-400">Extracted Fields:</span>{' '}
                        <span className="font-mono font-semibold">{file.extractedFieldsCount ?? 0}</span>
                      </div>
                    </div>
                    {file.error && (
                      <div className="p-2 rounded-lg bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300">
                        {file.error}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

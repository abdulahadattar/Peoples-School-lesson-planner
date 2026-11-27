import React from 'react';
import { UploadCloud, FileArchive, Activity, RefreshCw, AlertTriangle } from 'lucide-react';
import { BatchProcessingJob } from '../../../types/documentArchive';

export interface ArchiveHeaderBannerProps {
  activeJob: BatchProcessingJob | null;
  aiConfigured?: boolean;
  manualReviewCount?: number;
  dossiersCount: number;
  documentsCount: number;
  flaggedCount: number;
  isUploading: boolean;
  uploadProgress: { percent: number; statusText: string } | null;
  onOpenTransparency: () => void;
  onUploadZipClick: () => void;
  onUploadFilesClick: () => void;
}

export const ArchiveHeaderBanner: React.FC<ArchiveHeaderBannerProps> = ({
  activeJob,
  aiConfigured = true,
  manualReviewCount = 0,
  dossiersCount,
  documentsCount,
  flaggedCount,
  isUploading,
  uploadProgress,
  onOpenTransparency,
  onUploadZipClick,
  onUploadFilesClick,
}) => {
  const unclassifiedCount = Math.max(activeJob?.unclassifiedCount || 0, manualReviewCount);
  const showManualReviewNotice =
    !aiConfigured ||
    manualReviewCount > 0 ||
    (activeJob?.status === 'completed' && (activeJob.unclassifiedCount || 0) > 0);

  return (
    <div className="bg-white dark:bg-brand-surface rounded-2xl border border-brand-border p-5 shadow-soft space-y-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-brand-primary/10 text-brand-primary">
              <FileArchive className="w-5 h-5" />
            </span>
            <h2 className="text-lg font-bold text-brand-text-primary">
              Student Document Database
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {activeJob && (
            <button
              type="button"
              onClick={onOpenTransparency}
              className="px-3 py-2 rounded-xl text-xs font-semibold bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <Activity className="w-3.5 h-3.5 animate-pulse text-indigo-600" />
              <span>Import Activity</span>
            </button>
          )}

          <button
            type="button"
            disabled={isUploading}
            onClick={onUploadFilesClick}
            className="px-3.5 py-2 rounded-xl text-xs font-bold text-brand-text-primary bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <UploadCloud className="w-4 h-4 text-slate-600 dark:text-slate-400" />
            <span>Upload Files</span>
          </button>

          <button
            type="button"
            disabled={isUploading}
            onClick={onUploadZipClick}
            className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-brand-primary hover:bg-brand-primary-hover shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50 active:scale-95"
          >
            <FileArchive className="w-4 h-4" />
            <span>Upload ZIP</span>
          </button>
        </div>
      </div>

      {isUploading && uploadProgress && (
        <div className="bg-brand-bg rounded-xl p-3.5 border border-brand-border space-y-2 animate-fadeIn">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-brand-text-primary flex items-center gap-2">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-brand-primary" />
              {uploadProgress.statusText}
            </span>
            <span className="font-mono font-bold text-brand-primary tabular-nums">
              {uploadProgress.percent}%
            </span>
          </div>
          <div className="h-1.5 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full w-full bg-brand-primary rounded-full transition-transform duration-300 ease-out will-change-transform"
              style={{ transform: `scaleX(${uploadProgress.percent / 100})`, transformOrigin: 'left' }}
            />
          </div>
        </div>
      )}

      {!isUploading && activeJob && activeJob.status === 'processing' && (
        <div className="bg-brand-bg rounded-xl p-3.5 border border-brand-border space-y-2 animate-fadeIn">
          <div className="flex items-center justify-between text-xs gap-2">
            <span className="font-semibold text-brand-text-primary flex items-center gap-2 min-w-0">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-brand-primary flex-shrink-0" />
              <span className="truncate">
                {activeJob.currentStageDescription || 'Processing files'}
                {activeJob.currentFile ? ` · ${activeJob.currentFile}` : ''}
              </span>
            </span>
            <span className="font-mono font-bold text-brand-primary flex-shrink-0 tabular-nums">
              {activeJob.processedFiles}/{activeJob.totalFiles}
            </span>
          </div>
          <div className="h-1.5 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full w-full bg-brand-primary rounded-full transition-transform duration-500 ease-out will-change-transform"
              style={{
                transform: `scaleX(${activeJob.totalFiles > 0 ? Math.min(100, Math.round((activeJob.processedFiles / activeJob.totalFiles) * 100)) / 100 : 0})`,
                transformOrigin: 'left',
              }}
            />
          </div>
          <div className="flex items-center gap-3 text-[10px] text-brand-text-secondary flex-wrap tabular-nums">
            <span className="text-emerald-600 font-semibold">{activeJob.successCount} saved</span>
            {unclassifiedCount > 0 && (
              <span className="text-amber-600 font-semibold">{unclassifiedCount} manual review</span>
            )}
            {activeJob.duplicateCount > 0 && <span>{activeJob.duplicateCount} duplicates</span>}
            {activeJob.failedCount ? <span className="text-rose-600 font-semibold">{activeJob.failedCount} failed</span> : null}
            <button
              type="button"
              onClick={onOpenTransparency}
              className="ml-auto underline hover:no-underline text-brand-primary cursor-pointer"
            >
              Open details
            </button>
          </div>
        </div>
      )}

      {showManualReviewNotice && (
        <div className="flex items-start gap-2.5 px-3.5 py-2.5 rounded-xl border border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200 text-xs">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="flex-1">
            {!aiConfigured ? (
              <span>
                Automatic document reading is temporarily unavailable — uploaded files are saved for manual review.
              </span>
            ) : (
              <span>
                {unclassifiedCount} document{unclassifiedCount === 1 ? '' : 's'} need{unclassifiedCount === 1 ? 's' : ''} manual review.
              </span>
            )}
          </div>
          {activeJob && (
            <button
              type="button"
              onClick={onOpenTransparency}
              className="font-semibold underline hover:no-underline shrink-0 cursor-pointer"
            >
              View Details
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-3 gap-3 text-center text-xs tabular-nums">
        <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-brand-border/60">
          <div className="text-[10px] uppercase font-bold text-brand-text-tertiary">Students</div>
          <div className="text-base font-extrabold text-brand-text-primary mt-0.5">{dossiersCount}</div>
        </div>
        <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-brand-border/60">
          <div className="text-[10px] uppercase font-bold text-brand-text-tertiary">Documents</div>
          <div className="text-base font-extrabold text-brand-text-primary mt-0.5">{documentsCount}</div>
        </div>
        <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-brand-border/60">
          <div className="text-[10px] uppercase font-bold text-brand-text-tertiary">Mismatches</div>
          <div className={`text-base font-extrabold mt-0.5 ${flaggedCount > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
            {flaggedCount}
          </div>
        </div>
      </div>
    </div>
  );
};

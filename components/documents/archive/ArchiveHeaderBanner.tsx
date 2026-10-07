import React from 'react';
import { UploadCloud, FileArchive, Activity, RefreshCw } from 'lucide-react';
import { BatchProcessingJob } from '../../../types/documentArchive';

export interface ArchiveHeaderBannerProps {
  activeJob: BatchProcessingJob | null;
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
  dossiersCount,
  documentsCount,
  flaggedCount,
  isUploading,
  uploadProgress,
  onOpenTransparency,
  onUploadZipClick,
  onUploadFilesClick,
}) => {
  return (
    <div className="bg-white dark:bg-brand-surface rounded-2xl border border-brand-border p-5 shadow-soft space-y-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-brand-primary/10 text-brand-primary">
              <FileArchive className="w-5 h-5" />
            </span>
            <h2 className="text-lg font-bold text-brand-text-primary">
              Student Document Archive & AI Verification
            </h2>
          </div>
          <p className="text-xs text-brand-text-secondary mt-1">
            Intelligent NADRA B-Form, CNIC & document verification linked with Google Sheet student records.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {activeJob && (
            <button
              type="button"
              onClick={onOpenTransparency}
              className="px-3 py-2 rounded-xl text-xs font-semibold bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
            >
              <Activity className="w-3.5 h-3.5 animate-pulse text-indigo-600" />
              <span>Job #{activeJob.id} Telemetry</span>
            </button>
          )}

          <button
            type="button"
            disabled={isUploading}
            onClick={onUploadFilesClick}
            className="px-3.5 py-2 rounded-xl text-xs font-bold text-brand-text-primary bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <UploadCloud className="w-4 h-4 text-slate-600 dark:text-slate-400" />
            <span>Upload Scans</span>
          </button>

          <button
            type="button"
            disabled={isUploading}
            onClick={onUploadZipClick}
            className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-brand-primary hover:bg-brand-primary-hover shadow-sm transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 active:scale-95"
          >
            <FileArchive className="w-4 h-4" />
            <span>Upload ZIP Archive</span>
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
            <span className="font-mono font-bold text-brand-primary">
              {uploadProgress.percent}%
            </span>
          </div>
          <div className="h-1.5 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-brand-primary transition-all duration-300 rounded-full"
              style={{ width: `${uploadProgress.percent}%` }}
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3 text-center text-xs">
        <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-brand-border/60">
          <div className="text-[10px] uppercase font-bold text-brand-text-tertiary">Dossiers</div>
          <div className="text-base font-extrabold text-brand-text-primary mt-0.5">{dossiersCount}</div>
        </div>
        <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-brand-border/60">
          <div className="text-[10px] uppercase font-bold text-brand-text-tertiary">Scanned Files</div>
          <div className="text-base font-extrabold text-brand-text-primary mt-0.5">{documentsCount}</div>
        </div>
        <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-brand-border/60">
          <div className="text-[10px] uppercase font-bold text-brand-text-tertiary">Flagged Issues</div>
          <div className={`text-base font-extrabold mt-0.5 ${flaggedCount > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
            {flaggedCount}
          </div>
        </div>
      </div>
    </div>
  );
};

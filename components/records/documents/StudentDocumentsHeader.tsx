import React from 'react';
import {
  FileText,
  UploadCloud,
  X,
  Activity,
  RefreshCw,
  Link as LinkIcon,
  CheckCircle2,
} from 'lucide-react';
import { StudentDossier } from '../../../types/documentArchive';

export interface StudentDocumentsHeaderProps {
  dossier: StudentDossier | null;
  studentGrNo: string;
  activeFlagsCount: number;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  isReprocessing: boolean;
  isAutoLinking: boolean;
  isUploading: boolean;
  actionSuccessMsg: string | null;
  uploadError: string | null;
  uploadStatus: string | null;
  activeJob: any;
  onReprocessDossier: () => void;
  onAutoLink: () => void;
  onClearUploadError: () => void;
  onOpenTransparencyModal: () => void;
  onFileInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export const StudentDocumentsHeader: React.FC<StudentDocumentsHeaderProps> = ({
  dossier,
  studentGrNo,
  activeFlagsCount,
  fileInputRef,
  isReprocessing,
  isAutoLinking,
  isUploading,
  actionSuccessMsg,
  uploadError,
  uploadStatus,
  activeJob,
  onReprocessDossier,
  onAutoLink,
  onClearUploadError,
  onOpenTransparencyModal,
  onFileInputChange,
}) => {
  return (
    <>
      <input
        type="file"
        ref={fileInputRef}
        onChange={onFileInputChange}
        multiple
        accept=".jpg,.jpeg,.png,.webp,.pdf"
        className="hidden"
      />

      {/* Top Action & Status Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-white dark:bg-brand-surface border border-brand-border shadow-xs">
        <div className="flex items-center gap-2 text-xs">
          <FileText className="w-4 h-4 text-brand-primary flex-shrink-0" />
          <span className="text-brand-text-primary font-semibold">
            {dossier ? dossier.documents.length : 0} Document Scan(s)
          </span>
          <span className="text-slate-400">•</span>
          <span className="text-brand-text-secondary">GR #{studentGrNo}</span>
          {activeFlagsCount > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300 ml-1">
              {activeFlagsCount} Flagged Difference(s)
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onReprocessDossier}
            disabled={isReprocessing}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 border border-indigo-200 dark:border-indigo-800 transition-all disabled:opacity-50"
            title="Re-extract and re-audit all documents for this student"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isReprocessing ? 'animate-spin text-indigo-600' : ''}`} />
            <span>{isReprocessing ? 'Rescanning...' : 'Rescan Documents'}</span>
          </button>

          <button
            type="button"
            onClick={onAutoLink}
            disabled={isAutoLinking}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-brand-text-primary bg-brand-bg hover:bg-slate-200 dark:hover:bg-slate-700 border border-brand-border transition-all disabled:opacity-50"
            title="Scan all unassigned uploads and auto-link to this student"
          >
            <LinkIcon className={`w-3.5 h-3.5 text-brand-primary ${isAutoLinking ? 'animate-spin' : ''}`} />
            <span>{isAutoLinking ? 'Matching...' : 'Auto-Link Scans'}</span>
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-brand-primary hover:bg-brand-primary/90 shadow-soft active:scale-95 transition-all disabled:opacity-50"
          >
            <UploadCloud className="w-3.5 h-3.5" />
            <span>{isUploading ? 'Uploading...' : 'Upload PDFs / Scans'}</span>
          </button>
        </div>
      </div>

      {actionSuccessMsg && (
        <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-700 dark:text-emerald-300 font-medium flex items-center gap-2 animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          <span>{actionSuccessMsg}</span>
        </div>
      )}

      {uploadError && (
        <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 flex items-center justify-between">
          <span>{uploadError}</span>
          <button onClick={onClearUploadError} className="text-rose-500 hover:text-rose-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {uploadStatus && (
        <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-700 dark:text-emerald-300 font-medium flex items-center justify-between">
          <span>{uploadStatus}</span>
          {activeJob && (
            <button
              type="button"
              onClick={onOpenTransparencyModal}
              className="text-xs font-bold text-emerald-800 dark:text-emerald-200 underline hover:no-underline flex items-center gap-1"
            >
              <Activity className="w-3.5 h-3.5" />
              <span>Live Pipeline</span>
            </button>
          )}
        </div>
      )}
    </>
  );
};

import React, { useState, useEffect } from 'react';
import {
  FolderSync,
  Play,
  Pause,
  Square,
  RotateCcw,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Link2,
  Zap,
} from 'lucide-react';
import {
  DriveImportState,
  DEFAULT_DRIVE_FOLDER_URL,
} from '../../../hooks/useDocumentArchive/driveImportState';
import {
  GOOGLE_TOKEN_EVENT,
  isGoogleTokenExpired,
} from '../../../services/googleAuth';
import { ConfirmDialog } from '../../ui/ConfirmDialog';

export interface DriveImportPanelProps {
  driveState: DriveImportState;
  incrementalSync: boolean;
  isAdmin: boolean;
  isResettingArchive: boolean;
  onToggleIncrementalSync: (val: boolean) => void;
  onFolderInputChange: (val: string) => void;
  onStartImport: () => void;
  onForceRescan: () => void;
  onResetCache: () => void;
  onPauseImport: () => void;
  onResumeImport: () => void;
  onStopImport: () => void;
  onConnectDrive: () => void;
  onResetArchiveForTesting: () => Promise<void>;
}

const STATUS_BADGES: Record<DriveImportState['status'], { label: string; className: string }> = {
  idle: { label: 'Ready', className: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
  discovering: { label: 'Scanning Drive', className: 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300' },
  running: { label: 'Importing', className: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300' },
  paused: { label: 'Paused', className: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
  stopped: { label: 'Stopped', className: 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
  completed: { label: 'Completed', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' },
  error: { label: 'Error', className: 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300' },
};

export const DriveImportPanel: React.FC<DriveImportPanelProps> = ({
  driveState,
  incrementalSync,
  isAdmin,
  isResettingArchive,
  onToggleIncrementalSync,
  onFolderInputChange,
  onStartImport,
  onForceRescan,
  onResetCache,
  onPauseImport,
  onResumeImport,
  onStopImport,
  onConnectDrive,
  onResetArchiveForTesting,
}) => {
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);
  const [driveConnected, setDriveConnected] = useState(() => !isGoogleTokenExpired());

  useEffect(() => {
    const sync = () => setDriveConnected(!isGoogleTokenExpired());
    window.addEventListener(GOOGLE_TOKEN_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(GOOGLE_TOKEN_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const isBusy = driveState.status === 'discovering' || driveState.status === 'running';
  const isPaused = driveState.status === 'paused';
  const badge = STATUS_BADGES[driveState.status];
  const progressPct =
    driveState.totalDiscovered > 0
      ? Math.min(100, Math.round((driveState.processed / driveState.totalDiscovered) * 100))
      : 0;

  return (
    <div className="bg-white dark:bg-brand-surface rounded-2xl border border-brand-border p-4 shadow-soft space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="p-2 rounded-xl bg-sky-50 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400">
            <FolderSync className="w-4 h-4" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-brand-text-primary">
                Google Drive Import
              </h3>
              <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${badge.className}`}>
                {badge.label}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-brand-text-secondary cursor-pointer px-2.5 py-1 rounded-xl bg-brand-bg border border-brand-border">
            <input
              type="checkbox"
              checked={incrementalSync}
              disabled={isBusy}
              onChange={(e) => onToggleIncrementalSync(e.target.checked)}
              className="rounded text-brand-primary focus:ring-brand-primary/30 w-3.5 h-3.5"
            />
            <span className="flex items-center gap-1">
              <Zap className="w-3 h-3 text-amber-500" />
              Skip Already Imported
            </span>
          </label>

          {!incrementalSync && (
            <button
              type="button"
              onClick={onResetCache}
              disabled={isBusy}
              className="px-2.5 py-1 rounded-xl text-[11px] font-bold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 hover:bg-amber-100 transition-colors"
              title="Reset the list of already imported files so the next import checks all files"
            >
              Reset Import List
            </button>
          )}

          {!driveConnected && (
            <button
              type="button"
              onClick={onConnectDrive}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800 hover:bg-sky-100 transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Link2 className="w-3.5 h-3.5" />
              <span>Connect Drive</span>
            </button>
          )}

          {isAdmin && (
            <button
              type="button"
              disabled={isBusy || isResettingArchive}
              onClick={() => setConfirmResetOpen(true)}
              className="px-3 py-1.5 rounded-xl text-xs font-bold text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/70 hover:bg-rose-100 dark:hover:bg-rose-900/50 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${isResettingArchive ? 'animate-spin' : ''}`} />
              <span>Reset Data</span>
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-col lg:flex-row lg:items-center gap-2.5">
        <div className="flex-1 flex flex-col sm:flex-row sm:items-center gap-2">
          <label htmlFor="drive-folder-url" className="sr-only">
            Google Drive Folder URL or ID
          </label>
          <input
            id="drive-folder-url"
            type="text"
            value={driveState.folderInput}
            disabled={isBusy || isPaused}
            onChange={(e) => onFolderInputChange(e.target.value)}
            placeholder={DEFAULT_DRIVE_FOLDER_URL}
            className="flex-1 px-3 py-2 rounded-xl text-xs font-mono bg-brand-bg border border-brand-border text-brand-text-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/30 disabled:opacity-60"
          />
          {driveState.folderId && (
            <span className="px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-[10px] font-mono text-brand-text-secondary shrink-0">
              Folder ID: {driveState.folderId.slice(0, 14)}…
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {!isBusy && !isPaused && (
            <>
              <button
                type="button"
                onClick={onStartImport}
                disabled={!driveState.folderId}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-brand-primary hover:bg-brand-primary-hover shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Play className="w-3.5 h-3.5" />
                <span>Start Import</span>
              </button>
              <button
                type="button"
                onClick={onForceRescan}
                disabled={!driveState.folderId}
                className="px-3 py-2 rounded-xl text-xs font-bold text-brand-text-secondary bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50"
                title="Import and check all files in this folder"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Re-import All</span>
              </button>
            </>
          )}

          {isPaused && (
            <button
              type="button"
              onClick={onResumeImport}
              className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Resume Import</span>
            </button>
          )}

          {isBusy && (
            <button
              type="button"
              onClick={onPauseImport}
              className="px-3.5 py-2 rounded-xl text-xs font-bold text-amber-900 dark:text-amber-200 bg-amber-100 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-700 hover:bg-amber-200 transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Pause className="w-3.5 h-3.5" />
              <span>Pause</span>
            </button>
          )}

          {(isBusy || isPaused) && (
            <button
              type="button"
              onClick={onStopImport}
              className="px-3.5 py-2 rounded-xl text-xs font-bold text-rose-700 dark:text-rose-200 bg-rose-100 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-700 hover:bg-rose-200 transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Square className="w-3.5 h-3.5" />
              <span>Stop</span>
            </button>
          )}
        </div>
      </div>

      {(driveState.status !== 'idle' || driveState.totalDiscovered > 0) && (
        <div className="bg-brand-bg rounded-xl p-3 border border-brand-border/80 space-y-2.5">
          <div className="flex items-center justify-between text-xs gap-2">
            <span className="font-semibold text-brand-text-primary flex items-center gap-2 min-w-0">
              {isBusy ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-brand-primary shrink-0" />
              ) : driveState.status === 'completed' ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              ) : null}
              <span className="truncate">
                {driveState.status === 'discovering'
                  ? `Scanning folders (${driveState.totalDiscovered} found${driveState.currentFolderName ? ` · ${driveState.currentFolderName}` : ''})…`
                  : driveState.currentFileName
                  ? `${driveState.currentFolderName ? `${driveState.currentFolderName} / ` : ''}${driveState.currentFileName}`
                  : `${driveState.packetsCount} student folder(s) ready`}
              </span>
            </span>
            <span className="font-mono font-bold text-brand-primary tabular-nums shrink-0">
              {driveState.processed}/{driveState.totalDiscovered} ({progressPct}%)
            </span>
          </div>

          <div className="h-1.5 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full w-full bg-brand-primary rounded-full transition-transform duration-300 ease-out will-change-transform"
              style={{ transform: `scaleX(${progressPct / 100})`, transformOrigin: 'left' }}
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs tabular-nums">
            <div className="p-2 rounded-lg bg-white dark:bg-brand-surface border border-brand-border/60">
              <div className="text-[10px] uppercase font-bold text-brand-text-tertiary">Processed</div>
              <div className="text-sm font-extrabold text-brand-text-primary">{driveState.processed}</div>
            </div>
            <div className="p-2 rounded-lg bg-white dark:bg-brand-surface border border-brand-border/60">
              <div className="text-[10px] uppercase font-bold text-brand-text-tertiary">Queued</div>
              <div className="text-sm font-extrabold text-sky-600">{driveState.queued}</div>
            </div>
            <div className="p-2 rounded-lg bg-white dark:bg-brand-surface border border-brand-border/60">
              <div className="text-[10px] uppercase font-bold text-brand-text-tertiary">Flagged</div>
              <div className={`text-sm font-extrabold ${driveState.flagged > 0 ? 'text-rose-600' : 'text-brand-text-primary'}`}>
                {driveState.flagged}
              </div>
            </div>
            <div className="p-2 rounded-lg bg-white dark:bg-brand-surface border border-brand-border/60">
              <div className="text-[10px] uppercase font-bold text-brand-text-tertiary">Photos Skipped</div>
              <div className="text-sm font-extrabold text-emerald-600">{driveState.skipped}</div>
            </div>
          </div>
        </div>
      )}

      {driveState.errorMessage && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{driveState.errorMessage}</span>
        </div>
      )}

      <ConfirmDialog
        isOpen={confirmResetOpen}
        variant="danger"
        title="Reset Student Documents?"
        confirmLabel="Reset Data"
        isLoading={isResettingArchive}
        message="This removes all imported student documents, mismatches, and activity logs from this portal. Master Google Sheet records are unchanged."
        onCancel={() => setConfirmResetOpen(false)}
        onConfirm={async () => {
          setConfirmResetOpen(false);
          await onResetArchiveForTesting();
        }}
      />
    </div>
  );
};

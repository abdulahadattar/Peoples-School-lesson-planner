import React from 'react';
import {
  FileSpreadsheet,
  RefreshCw,
  Plus,
  Lock,
  Download,
  ExternalLink,
  ShieldCheck,
  Unlock,
} from 'lucide-react';
import { DEFAULT_SPREADSHEET_URL, StudentRecord, exportRecordsToCSV } from '../../services/googleSheetsService';
import { SchoolConfig } from '../../types';
import { User } from 'firebase/auth';
import { GoogleSignInButton } from './GoogleSignInButton';

export interface RecordsHeaderCardProps {
  lastSynced: Date | null;
  isLoading: boolean;
  isRefreshing: boolean;
  onRefresh: () => void;
  onAddStudent: () => void;
  isSheetEditingLocked: boolean;
  schoolConfig: SchoolConfig;
  isAdmin: boolean;
  onSaveConfig: (cfg: SchoolConfig) => Promise<void>;
  showNotification: (msg: string) => void;
  filteredRecords: StudentRecord[];
  authUser?: User | null;
  onSignIn?: () => void;
  onSignOut?: () => void;
  isAuthLoading?: boolean;
}

export const RecordsHeaderCard: React.FC<RecordsHeaderCardProps> = ({
  lastSynced,
  isLoading,
  isRefreshing,
  onRefresh,
  onAddStudent,
  isSheetEditingLocked,
  schoolConfig,
  isAdmin,
  onSaveConfig,
  showNotification,
  filteredRecords,
  authUser,
  onSignIn,
  onSignOut,
  isAuthLoading = false,
}) => {
  return (
    <div className="space-y-4">
      {/* Top Header Card */}
      <div className="rounded-2xl glass-card p-5 sm:p-6 border border-brand-border shadow-card flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap text-xs text-brand-text-secondary">
            <span className="inline-flex items-center gap-1.5 font-semibold text-brand-primary">
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Student Register</span>
            </span>
            <span aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
              <span>Connected</span>
            </span>
            {isAdmin && lastSynced && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-[11px] tabular-nums">
                  Sheet Synced {lastSynced.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </>
            )}
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-brand-text-primary tracking-tight">
            Student Records
          </h1>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
          {isAdmin && onSignIn && onSignOut && (
            <GoogleSignInButton
              user={authUser ?? null}
              isLoading={isAuthLoading}
              onSignIn={onSignIn}
              onSignOut={onSignOut}
            />
          )}

          {isAdmin && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={isRefreshing || isLoading}
              title="Refresh from Google Sheet"
              className="inline-flex items-center gap-2 min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-semibold bg-white dark:bg-brand-surface border border-brand-border text-brand-text-primary hover:border-brand-primary/40 hover:text-brand-primary shadow-soft active:scale-95 transition-[color,background-color,border-color,transform] disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-brand-primary' : ''}`} />
              <span>{isRefreshing ? 'Syncing...' : 'Sync Records'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={onAddStudent}
            disabled={isSheetEditingLocked}
            title={isSheetEditingLocked ? 'Editing locked by school admin' : 'Add Student'}
            className={`inline-flex items-center gap-2 min-h-[40px] px-4 py-2 rounded-xl text-xs font-semibold shadow-soft transition-[color,background-color,border-color,transform,box-shadow] ${
              isSheetEditingLocked
                ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed'
                : 'text-white bg-brand-primary hover:bg-brand-primary/90 active:scale-95 cursor-pointer'
            }`}
          >
            {isSheetEditingLocked ? <Lock className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            <span>Add Student</span>
          </button>

          <button
            type="button"
            onClick={() => exportRecordsToCSV(filteredRecords)}
            title="Export filtered records as CSV"
            className="inline-flex items-center gap-1.5 min-h-[40px] px-3 py-2 rounded-xl text-xs font-semibold bg-white dark:bg-brand-surface border border-brand-border text-brand-text-secondary hover:text-brand-text-primary hover:border-brand-primary/30 shadow-soft transition-colors cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Export CSV</span>
          </button>

          {isAdmin && (
            <a
              href={DEFAULT_SPREADSHEET_URL}
              target="_blank"
              rel="noopener noreferrer"
              title="Open original spreadsheet in Google Sheets"
              className="inline-flex items-center justify-center min-h-[40px] min-w-[40px] p-2 rounded-xl text-xs font-semibold bg-white dark:bg-brand-surface border border-brand-border text-brand-text-secondary hover:text-brand-text-primary hover:border-brand-primary/30 shadow-soft transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          )}
        </div>
      </div>

      {/* Administrative Lockout / View-Only Status Banner */}
      {!schoolConfig.sheetEditingEnabled && (
        <div
          className={`p-4 rounded-2xl border shadow-soft flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
            isAdmin
              ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800'
              : 'bg-amber-50/80 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800'
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`p-2 rounded-xl flex-shrink-0 ${
                isAdmin
                  ? 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300'
                  : 'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300'
              }`}
            >
              {isAdmin ? <ShieldCheck className="w-5 h-5" /> : <Lock className="w-5 h-5" />}
            </div>
            <div>
              <h4
                className={`text-xs font-bold ${
                  isAdmin ? 'text-emerald-900 dark:text-emerald-200' : 'text-amber-900 dark:text-amber-200'
                }`}
              >
                {isAdmin ? 'Admin Edit Override Active' : 'View-Only Mode'}
              </h4>
              <p
                className={`text-xs mt-0.5 leading-relaxed ${
                  isAdmin ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-800 dark:text-amber-300'
                }`}
              >
                {isAdmin
                  ? 'Editing is locked for standard users. You can still edit as Administrator.'
                  : schoolConfig.sheetEditingLockedMessage ||
                    'Editing is locked by School Administration. You can view, search, and export.'}
              </p>
            </div>
          </div>

          {isAdmin && (
            <button
              type="button"
              onClick={async () => {
                await onSaveConfig({ ...schoolConfig, sheetEditingEnabled: true });
                showNotification('Student record editing enabled for all school users.');
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold text-emerald-800 dark:text-emerald-200 bg-emerald-100 hover:bg-emerald-200 dark:bg-emerald-900/60 dark:hover:bg-emerald-900 transition-colors self-start sm:self-auto flex-shrink-0"
            >
              <Unlock className="w-3.5 h-3.5" />
              <span>Unlock for Everyone</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};

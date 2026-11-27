import React from 'react';
import {
  ShieldCheck,
  RotateCcw,
  Printer,
  Download,
  FileSpreadsheet,
  RefreshCw,
} from 'lucide-react';
import type { AttendanceSyncStatus } from './useDailyAttendance';

export interface AttendanceActionToolbarProps {
  isAdmin: boolean;
  syncStatus: AttendanceSyncStatus;
  lastSavedTime: string | null;
  isOffline: boolean;
  onOpenEnrollments: () => void;
  onClearForm: () => void;
  onPrint: () => void;
  onExportExcel: () => void;
  onExportCSV: () => void;
}

export const AttendanceActionToolbar: React.FC<AttendanceActionToolbarProps> = ({
  isAdmin,
  syncStatus,
  lastSavedTime,
  isOffline,
  onOpenEnrollments,
  onClearForm,
  onPrint,
  onExportExcel,
  onExportCSV,
}) => {
  const renderSyncIndicator = () => {
    if (isOffline || syncStatus === 'offline') {
      return (
        <span
          role="status"
          aria-live="polite"
          className="inline-flex items-center gap-1.5 text-[11px] font-semibold mr-1 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700"
          title="No internet connection. Inputs are locked until you are back online."
        >
          <span className="w-2 h-2 rounded-full bg-slate-400 dark:bg-slate-500" />
          Offline · Inputs Locked
        </span>
      );
    }

    if (syncStatus === 'syncing' || syncStatus === 'checking') {
      return (
        <span
          role="status"
          aria-live="polite"
          className="inline-flex items-center gap-1.5 text-[11px] font-semibold mr-1 px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800"
        >
          <RefreshCw className="w-3 h-3 animate-spin text-blue-600 dark:text-blue-400" />
          {syncStatus === 'checking' ? 'Connecting...' : 'Saving...'}
        </span>
      );
    }

    if (syncStatus === 'auth_required') {
      return (
        <span
          role="status"
          aria-live="polite"
          className="inline-flex items-center gap-1.5 text-[11px] font-semibold mr-1 px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800"
          title="Sign in with Google to save changes"
        >
          <span className="w-2 h-2 rounded-full bg-amber-500" />
          Sign in to Save
        </span>
      );
    }

    if (syncStatus === 'error') {
      return (
        <span
          role="status"
          aria-live="polite"
          className="inline-flex items-center gap-1.5 text-[11px] font-semibold mr-1 px-2.5 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800"
          title="Temporary save delay; changes will retry automatically"
        >
          <span className="w-2 h-2 rounded-full bg-rose-500" />
          Save Delayed
        </span>
      );
    }

    return (
      <span
        role="status"
        aria-live="polite"
        className="inline-flex items-center gap-1.5 text-[11px] font-semibold mr-1 px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 tabular-nums"
        title="Automatically saved"
      >
        <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.7)]" />
        <span>Saved{lastSavedTime ? ` · ${lastSavedTime}` : ''}</span>
      </span>
    );
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 bg-brand-surface p-3.5 rounded-2xl border border-brand-border shadow-xs">
      <div className="flex flex-wrap items-center gap-2">
        {/* Class Enrollments Admin / View */}
        <button
          type="button"
          id="action-toolbar-enrollments-btn"
          onClick={onOpenEnrollments}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl border transition-[color,background-color,border-color,box-shadow] shadow-xs cursor-pointer ${
            isAdmin
              ? 'bg-blue-50 hover:bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border-blue-300 dark:border-blue-800'
              : 'bg-brand-bg hover:bg-brand-border text-brand-text-primary border-brand-border'
          }`}
          title="Configure official school enrollments"
        >
          <ShieldCheck
            className={`w-3.5 h-3.5 ${
              isAdmin ? 'text-blue-600 dark:text-blue-400' : 'text-brand-text-secondary'
            }`}
          />
          <span>Class Enrollments {isAdmin ? '(Admin)' : ''}</span>
        </button>

        {/* Clear Form */}
        <button
          type="button"
          onClick={onClearForm}
          disabled={isOffline}
          title={isOffline ? 'Reconnect to internet to edit attendance' : 'Clear attendance inputs'}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-brand-bg hover:bg-rose-50 dark:hover:bg-rose-950/30 text-brand-text-secondary hover:text-rose-600 border border-brand-border transition-colors shadow-xs cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed disabled:hover:bg-brand-bg disabled:hover:text-brand-text-secondary"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Clear</span>
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {/* Live Firestore Auto-Sync Indicator */}
        {renderSyncIndicator()}

        {/* Print Slip */}
        <button
          type="button"
          onClick={onPrint}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl bg-brand-bg hover:bg-brand-border text-brand-text-primary border border-brand-border transition-colors shadow-xs cursor-pointer"
        >
          <Printer className="w-3.5 h-3.5 text-brand-text-secondary" />
          <span>Print Slip</span>
        </button>

        {/* Export Excel (.xlsx) */}
        <button
          type="button"
          onClick={onExportExcel}
          title="Download formatted Excel workbook (.xlsx)"
          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white transition-[background-color,transform] shadow-xs active:scale-95 cursor-pointer"
        >
          <FileSpreadsheet className="w-3.5 h-3.5" />
          <span>Export Excel</span>
        </button>

        {/* Export CSV */}
        <button
          type="button"
          onClick={onExportCSV}
          title="Download CSV report (.csv)"
          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl bg-brand-bg hover:bg-brand-border text-brand-text-primary border border-brand-border transition-colors shadow-xs cursor-pointer"
        >
          <Download className="w-3.5 h-3.5 text-brand-text-secondary" />
          <span>Export CSV</span>
        </button>
      </div>
    </div>
  );
};

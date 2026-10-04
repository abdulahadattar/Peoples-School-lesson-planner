import React from 'react';
import {
  ShieldCheck,
  RotateCcw,
  Printer,
  Download,
  Save,
  FileSpreadsheet,
  RefreshCw,
  CheckCircle2,
  Database,
  CloudUpload,
} from 'lucide-react';

export interface AttendanceActionToolbarProps {
  isAdmin: boolean;
  hasUnsavedChanges: boolean;
  lastSavedTime: string | null;
  lastSheetSyncTime: string | null;
  isSaving: boolean;
  isSyncingToSheet: boolean;
  loadError: string | null;
  onOpenEnrollments: () => void;
  onClearForm: () => void;
  onPrint: () => void;
  onExportCSV: () => void;
  onSaveToDatabase: () => void;
  onSyncToGoogleSheet: () => void;
}

export const AttendanceActionToolbar: React.FC<AttendanceActionToolbarProps> = ({
  isAdmin,
  hasUnsavedChanges,
  lastSavedTime,
  lastSheetSyncTime,
  isSaving,
  isSyncingToSheet,
  loadError,
  onOpenEnrollments,
  onClearForm,
  onPrint,
  onExportCSV,
  onSaveToDatabase,
  onSyncToGoogleSheet,
}) => {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 bg-brand-surface p-3.5 rounded-2xl border border-brand-border shadow-xs">
      <div className="flex flex-wrap items-center gap-2">
        {/* Class Enrollments Admin / View */}
        <button
          type="button"
          id="action-toolbar-enrollments-btn"
          onClick={onOpenEnrollments}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl border transition-all shadow-xs cursor-pointer ${
            isAdmin
              ? 'bg-blue-50 hover:bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border-blue-300 dark:border-blue-800'
              : 'bg-brand-bg hover:bg-brand-border text-brand-text-primary border-brand-border'
          }`}
          title="Configure official school enrollments"
        >
          <ShieldCheck className={`w-3.5 h-3.5 ${isAdmin ? 'text-blue-600 dark:text-blue-400' : 'text-brand-text-secondary'}`} />
          <span>Class Enrollments {isAdmin ? '(Admin)' : ''}</span>
        </button>

        {/* Clear Form */}
        <button
          type="button"
          onClick={onClearForm}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-brand-bg hover:bg-rose-50 dark:hover:bg-rose-950/30 text-brand-text-secondary hover:text-rose-600 border border-brand-border transition-colors shadow-xs cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Clear</span>
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {/* Storage / Database Status Indication */}
        {hasUnsavedChanges ? (
          <span className="inline-flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400 font-semibold mr-1 bg-amber-50 dark:bg-amber-950/40 px-2 py-1 rounded-lg border border-amber-200 dark:border-amber-800">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping" />
            Unsaved changes
          </span>
        ) : lastSavedTime ? (
          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold mr-1 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-1 rounded-lg border border-emerald-200 dark:border-emerald-800" title="Saved to app database & local storage">
            <Database className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
            DB Saved ({lastSavedTime})
          </span>
        ) : null}

        {/* Print Slip */}
        <button
          type="button"
          onClick={onPrint}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl bg-brand-bg hover:bg-brand-border text-brand-text-primary border border-brand-border transition-colors shadow-xs cursor-pointer"
        >
          <Printer className="w-3.5 h-3.5 text-brand-text-secondary" />
          <span>Print Slip</span>
        </button>

        {/* Export CSV */}
        <button
          type="button"
          onClick={onExportCSV}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl bg-brand-bg hover:bg-brand-border text-brand-text-primary border border-brand-border transition-colors shadow-xs cursor-pointer"
        >
          <Download className="w-3.5 h-3.5 text-brand-text-secondary" />
          <span>Export CSV</span>
        </button>

        {/* Sync to Google Sheet Button (User on-demand sync) */}
        <button
          type="button"
          onClick={onSyncToGoogleSheet}
          disabled={isSyncingToSheet || isSaving}
          title="Push this date's attendance to the official Google Sheet on demand"
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50 transition-all shadow-xs active:scale-95 cursor-pointer"
        >
          {isSyncingToSheet ? (
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <FileSpreadsheet className="w-3.5 h-3.5" />
          )}
          <span>
            {isSyncingToSheet
              ? 'Syncing to Sheet...'
              : lastSheetSyncTime
              ? `Synced Sheet (${lastSheetSyncTime})`
              : 'Sync to Sheet'}
          </span>
        </button>

        {/* Save to Server / Database Storage Button */}
        <button
          type="button"
          onClick={onSaveToDatabase}
          disabled={isSaving}
          title={loadError ? 'The register below is blank because loading failed - saving will overwrite this date' : 'Save attendance to application database & storage'}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl brand-gradient text-white hover:opacity-90 disabled:opacity-50 transition-all shadow-md active:scale-95 cursor-pointer"
        >
          {isSaving ? (
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Save className="w-3.5 h-3.5" />
          )}
          <span>{isSaving ? 'Saving...' : 'Save Attendance'}</span>
        </button>
      </div>
    </div>
  );
};

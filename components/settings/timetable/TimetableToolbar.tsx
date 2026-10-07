import React, { RefObject } from 'react';
import { TimetableAuditReport } from '../../../services/timetableConflictEngine';
import { SpreadsheetExportMenu } from './SpreadsheetExportMenu';
import { TimetableSheetSyncStrip } from './TimetableSheetSyncStrip';

export type ViewMode = 'class' | 'faculty' | 'auditor';

export interface PushPreviewData {
  cellCount: number;
  tabLabels: string[];
  skipped: string[];
}

export interface TimetableToolbarProps {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  auditReport: TimetableAuditReport;
  exportMenuOpen: boolean;
  setExportMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  exportMenuRef: RefObject<HTMLDivElement | null>;
  selectedClassLabel: string;
  isSaving?: boolean;
  onSaveToCloud: () => void;
  onExportAllClassesExcel: () => void;
  onExportAllTeachersExcel: () => void;
  onExportSingleClassExcel: () => void;
  onExportSingleTeacherExcel: () => void;
  sheetSync: {
    unreachable: boolean;
    error: string | null;
    needsReconnect: boolean;
    nextRefreshLabel: string | null;
    sheetChangesCount: number;
    refreshing: boolean;
    dismissNeedsReconnect: () => void;
    startPolling: () => void;
  };
  lastSyncedLabel: string;
  syncing: boolean;
  reconnecting: boolean;
  sheetChangedUnderEdits: boolean;
  pushPreview: PushPreviewData | null;
  setPushPreview: (val: PushPreviewData | null) => void;
  onRefreshFromSheet: () => void;
  onSyncToSheet: () => void;
  onReconnectSheets: () => void;
  onConfirmPushToSheet: () => void;
}

export const TimetableToolbar: React.FC<TimetableToolbarProps> = ({
  viewMode,
  setViewMode,
  auditReport,
  exportMenuOpen,
  setExportMenuOpen,
  exportMenuRef,
  selectedClassLabel,
  isSaving,
  onSaveToCloud,
  onExportAllClassesExcel,
  onExportAllTeachersExcel,
  onExportSingleClassExcel,
  onExportSingleTeacherExcel,
  sheetSync,
  lastSyncedLabel,
  syncing,
  reconnecting,
  sheetChangedUnderEdits,
  pushPreview,
  setPushPreview,
  onRefreshFromSheet,
  onSyncToSheet,
  onReconnectSheets,
  onConfirmPushToSheet,
}) => {
  return (
    <div className="space-y-3">
      {/* Top Header & Navigation Bar */}
      <div className="bg-brand-surface p-4 sm:p-5 rounded-2xl border border-brand-border flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs">
        <div>
          <div className="flex items-center gap-2.5">
            <h3 className="text-base font-bold text-brand-text-primary">
              Master School Timetable & Faculty Scheduling
            </h3>
            {auditReport.totalClashes > 0 && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[10px] font-bold rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-800">
                ⚠️ {auditReport.totalClashes} Clash{auditReport.totalClashes > 1 ? 'es' : ''} Detected
              </span>
            )}
          </div>
          <p className="text-xs text-brand-text-secondary mt-1">
            Real-time synchronization between curriculum subjects, teacher assignments, double-booking prevention, and institutional Excel exports.
          </p>
        </div>

        {/* Action Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          {/* View Mode Switcher */}
          <div className="flex items-center p-1 bg-brand-bg rounded-xl border border-brand-border">
            <button
              type="button"
              onClick={() => setViewMode('class')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                viewMode === 'class'
                  ? 'bg-brand-surface text-brand-primary shadow-xs font-bold'
                  : 'text-brand-text-secondary hover:text-brand-text-primary'
              }`}
            >
              Class Grid
            </button>
            <button
              type="button"
              onClick={() => setViewMode('faculty')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                viewMode === 'faculty'
                  ? 'bg-brand-surface text-brand-primary shadow-xs font-bold'
                  : 'text-brand-text-secondary hover:text-brand-text-primary'
              }`}
            >
              Faculty Workload
            </button>
            <button
              type="button"
              onClick={() => setViewMode('auditor')}
              className={`relative px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                viewMode === 'auditor'
                  ? 'bg-brand-surface text-brand-primary shadow-xs font-bold'
                  : 'text-brand-text-secondary hover:text-brand-text-primary'
              }`}
            >
              <span>Conflict Auditor</span>
              {auditReport.totalClashes > 0 && (
                <span className="ml-1 px-1.5 py-0.2 text-[9px] font-bold rounded-full bg-rose-500 text-white">
                  {auditReport.totalClashes}
                </span>
              )}
            </button>
          </div>

          <SpreadsheetExportMenu
            exportMenuOpen={exportMenuOpen}
            setExportMenuOpen={setExportMenuOpen}
            exportMenuRef={exportMenuRef}
            selectedClassLabel={selectedClassLabel}
            onExportAllClassesExcel={onExportAllClassesExcel}
            onExportAllTeachersExcel={onExportAllTeachersExcel}
            onExportSingleClassExcel={onExportSingleClassExcel}
            onExportSingleTeacherExcel={onExportSingleTeacherExcel}
          />

          {/* Cloud Save Button */}
          <button
            type="button"
            onClick={onSaveToCloud}
            disabled={isSaving}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-brand-primary text-white hover:bg-brand-primary-hover disabled:opacity-50 transition-colors shadow-xs cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            {isSaving ? 'Syncing...' : 'Save to Cloud'}
          </button>
        </div>
      </div>

      <TimetableSheetSyncStrip
        sheetSync={sheetSync}
        lastSyncedLabel={lastSyncedLabel}
        syncing={syncing}
        reconnecting={reconnecting}
        sheetChangedUnderEdits={sheetChangedUnderEdits}
        pushPreview={pushPreview}
        setPushPreview={setPushPreview}
        onRefreshFromSheet={onRefreshFromSheet}
        onSyncToSheet={onSyncToSheet}
        onReconnectSheets={onReconnectSheets}
        onConfirmPushToSheet={onConfirmPushToSheet}
      />
    </div>
  );
};

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
      <div className="bg-brand-surface p-4 sm:p-5 rounded-2xl border border-brand-border flex flex-col lg:flex-row lg:items-center justify-between gap-3.5 sm:gap-4 shadow-xs">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-bold text-brand-text-primary">
            Master Timetable
          </h3>
          {auditReport.totalClashes > 0 && (
            <span className="text-xs font-semibold text-rose-600 dark:text-rose-400 font-mono tabular-nums">
              · {auditReport.totalClashes} clash{auditReport.totalClashes > 1 ? 'es' : ''}
            </span>
          )}
        </div>

        {/* Action Toolbar */}
        <div className="flex flex-col sm:flex-row sm:flex-wrap lg:flex-nowrap items-stretch sm:items-center gap-2.5 sm:gap-2">
          {/* View Mode Switcher */}
          <div className="grid grid-cols-3 sm:inline-flex items-center p-1 bg-brand-bg rounded-xl border border-brand-border w-full sm:w-auto">
            <button
              type="button"
              onClick={() => setViewMode('class')}
              className={`px-2 sm:px-3 py-2 sm:py-1.5 min-h-[40px] sm:min-h-0 rounded-lg text-xs font-semibold transition-[color,background-color,border-color,box-shadow] cursor-pointer whitespace-nowrap text-center ${
                viewMode === 'class'
                  ? 'bg-brand-surface text-brand-primary shadow-xs font-bold'
                  : 'text-brand-text-secondary hover:text-brand-text-primary'
              }`}
            >
              <span className="sm:hidden">Classes</span>
              <span className="hidden sm:inline">Class Grid</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('faculty')}
              className={`px-2 sm:px-3 py-2 sm:py-1.5 min-h-[40px] sm:min-h-0 rounded-lg text-xs font-semibold transition-[color,background-color,border-color,box-shadow] cursor-pointer whitespace-nowrap text-center ${
                viewMode === 'faculty'
                  ? 'bg-brand-surface text-brand-primary shadow-xs font-bold'
                  : 'text-brand-text-secondary hover:text-brand-text-primary'
              }`}
            >
              <span className="sm:hidden">Faculty</span>
              <span className="hidden sm:inline">Faculty Workload</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('auditor')}
              className={`px-2 sm:px-3 py-2 sm:py-1.5 min-h-[40px] sm:min-h-0 rounded-lg text-xs font-semibold transition-[color,background-color,border-color,box-shadow] cursor-pointer whitespace-nowrap text-center ${
                viewMode === 'auditor'
                  ? 'bg-brand-surface text-brand-primary shadow-xs font-bold'
                  : 'text-brand-text-secondary hover:text-brand-text-primary'
              }`}
            >
              <span className="sm:hidden">Auditor</span>
              <span className="hidden sm:inline">Conflict Auditor</span>
              {auditReport.totalClashes > 0 && (
                <span className="ml-1 font-mono tabular-nums text-[11px] font-bold text-rose-600 dark:text-rose-400">
                  {auditReport.totalClashes}
                </span>
              )}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
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
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-[40px] text-xs font-semibold rounded-xl bg-brand-primary text-white hover:bg-brand-primary-hover disabled:opacity-50 transition-colors shadow-xs cursor-pointer whitespace-nowrap"
            >
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <span>{isSaving ? 'Saving...' : 'Save Changes'}</span>
            </button>
          </div>
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

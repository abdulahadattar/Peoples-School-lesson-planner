import React from 'react';
import {
  Download,
  FileDown,
  Layers,
  Printer,
} from 'lucide-react';
import type { MarksheetPendingEdit } from '../../services/marksheet/pendingEditsRepository';
import {
  GradingSystemType,
  MarksheetConfig,
  MarksheetExamType,
  MarksheetGradeLevel,
} from '../../services/marksheet/types';
import { MarksheetAdminSheetBar } from './MarksheetAdminSheetBar';
import type { MarksheetViewTab } from './useMarksheetsState';
import { SegmentedControl } from '../ui/SegmentedControl';

const EXAM_OPTIONS = [
  { value: 'midterm', label: 'Midterm Exam' },
  { value: 'mock', label: 'Mock Test' },
  { value: 'preboard', label: 'Final Term / Pre-Board' },
] as const;

const GRADING_OPTIONS = [
  { value: 'zueb', label: 'ZUEB (A++–U)' },
  { value: 'classic', label: 'Classic (A1–Fail)' },
] as const;

export interface MarksheetToolbarProps {
  config: MarksheetConfig;
  activeTab: MarksheetViewTab;
  onActiveTabChange: (tab: MarksheetViewTab) => void;
  isAdmin: boolean;
  examType: MarksheetExamType;
  onExamTypeChange: (t: MarksheetExamType) => void;
  gradingSystem: GradingSystemType;
  onGradingSystemChange: (g: GradingSystemType) => void;
  gradeFilter: 'ALL' | MarksheetGradeLevel;
  onGradeFilterChange: (g: 'ALL' | MarksheetGradeLevel) => void;
  rosterCount: number;
  activeStudentLabel: string | null;
  activeSpreadsheetUrl: string;
  isCustomSpreadsheet: boolean;
  isSavingSheetLink: boolean;
  isSyncingLive: boolean;
  isPushingPending: boolean;
  pushingDocId: string | null;
  pendingEdits: MarksheetPendingEdit[];
  syncError: string | null;
  syncNeedsAuth: boolean;
  onCheckSheetUpdates: () => void;
  onConnectGoogleAndSync: () => void;
  onReplaceSheetLink: (urlOrId: string) => Promise<boolean>;
  onResetSheetLink: () => Promise<boolean>;
  onImportFile: (file: File) => void;
  onPushPendingToSheet: (targetDocIds?: string[]) => void;
  onDiscardPendingEdit: (docId: string) => void;
  onPrintMarksheet: () => void;
  onDownloadSinglePdf: () => void;
  onDownloadAllPdf: () => void;
  isExportingSingle: boolean;
  batchProgress: { done: number; total: number } | null;
}

export const MarksheetToolbar: React.FC<MarksheetToolbarProps> = ({
  config,
  activeTab,
  onActiveTabChange,
  isAdmin,
  examType,
  onExamTypeChange,
  gradingSystem,
  onGradingSystemChange,
  gradeFilter,
  onGradeFilterChange,
  rosterCount,
  activeStudentLabel,
  activeSpreadsheetUrl,
  isCustomSpreadsheet,
  isSavingSheetLink,
  isSyncingLive,
  isPushingPending,
  pushingDocId,
  pendingEdits,
  syncError,
  syncNeedsAuth,
  onCheckSheetUpdates,
  onConnectGoogleAndSync,
  onReplaceSheetLink,
  onResetSheetLink,
  onImportFile,
  onPushPendingToSheet,
  onDiscardPendingEdit,
  onPrintMarksheet,
  onDownloadSinglePdf,
  onDownloadAllPdf,
  isExportingSingle,
  batchProgress,
}) => {
  return (
    <div className="bg-white dark:bg-brand-surface border border-brand-border rounded-2xl p-3.5 sm:p-5 space-y-3.5 sm:space-y-4 print:hidden">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 sm:gap-4">
        <div className="min-w-0 space-y-2">
          <div>
            <h1 className="text-lg sm:text-2xl font-bold text-brand-text-primary tracking-tight leading-snug">
              Student Marksheets
            </h1>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-brand-text-secondary mt-0.5">
              <span>School Exams (Midterm &amp; Final Term)</span>
              <span aria-hidden="true">·</span>
              <span>SSC &amp; HSSC</span>
              <span aria-hidden="true">·</span>
              <span>Session {config.academicYear}</span>
            </div>
          </div>

          <div
            role="tablist"
            aria-label="Marksheets View Mode"
            className="grid grid-cols-2 sm:inline-flex items-center gap-1 p-1 w-full sm:w-auto bg-brand-bg rounded-xl border border-brand-border/80"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'marksheet'}
              onClick={() => onActiveTabChange('marksheet')}
              className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap text-center cursor-pointer transition-colors ${
                activeTab === 'marksheet'
                  ? 'bg-white dark:bg-brand-surface text-brand-text-primary shadow-xs font-semibold'
                  : 'text-brand-text-secondary hover:text-brand-text-primary'
              }`}
            >
              Marksheet
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'results-list'}
              onClick={() => onActiveTabChange('results-list')}
              className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap text-center cursor-pointer transition-colors tabular-nums ${
                activeTab === 'results-list'
                  ? 'bg-white dark:bg-brand-surface text-brand-text-primary shadow-xs font-semibold'
                  : 'text-brand-text-secondary hover:text-brand-text-primary'
              }`}
            >
              Results List{pendingEdits.length > 0 ? ` (${pendingEdits.length})` : ''}
            </button>
          </div>
        </div>

        {activeTab === 'marksheet' && (
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 w-full lg:w-auto">
            <button
              type="button"
              onClick={onPrintMarksheet}
              disabled={!activeStudentLabel}
              className="min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-semibold border border-brand-border bg-brand-bg hover:bg-slate-100 dark:hover:bg-slate-800 text-brand-text-primary flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors disabled:opacity-50"
            >
              <Printer className="w-3.5 h-3.5 shrink-0" />
              <span className="sm:hidden">Print</span>
              <span className="hidden sm:inline">Print Marksheet</span>
            </button>

            <button
              type="button"
              onClick={onDownloadSinglePdf}
              disabled={!activeStudentLabel || isExportingSingle}
              className="min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:opacity-90 flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer transition-opacity disabled:opacity-50"
            >
              <FileDown className="w-3.5 h-3.5 shrink-0" />
              <span className="sm:hidden">{isExportingSingle ? 'Building...' : 'Student PDF'}</span>
              <span className="hidden sm:inline">
                {isExportingSingle ? 'Preparing PDF...' : 'Download Student PDF'}
              </span>
            </button>

            <button
              type="button"
              onClick={onDownloadAllPdf}
              disabled={rosterCount === 0 || Boolean(batchProgress)}
              className="col-span-2 sm:col-span-1 min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-semibold bg-brand-primary text-white hover:opacity-95 flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer transition-opacity disabled:opacity-50"
            >
              {batchProgress ? (
                <>
                  <Layers className="w-3.5 h-3.5 shrink-0" />
                  <span className="tabular-nums">
                    Building {batchProgress.done}/{batchProgress.total}...
                  </span>
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5 shrink-0" />
                  <span className="sm:hidden">Download All (PDF)</span>
                  <span className="hidden sm:inline">Download All Marksheets (PDF)</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {isAdmin && (
        <MarksheetAdminSheetBar
          activeSpreadsheetUrl={activeSpreadsheetUrl}
          isCustomSpreadsheet={isCustomSpreadsheet}
          isSavingSheetLink={isSavingSheetLink}
          isSyncingLive={isSyncingLive}
          isPushingPending={isPushingPending}
          pushingDocId={pushingDocId}
          pendingEdits={pendingEdits}
          onCheckSheetUpdates={onCheckSheetUpdates}
          onReplaceSheetLink={onReplaceSheetLink}
          onResetSheetLink={onResetSheetLink}
          onImportFile={onImportFile}
          onPushPendingToSheet={onPushPendingToSheet}
          onDiscardPendingEdit={onDiscardPendingEdit}
        />
      )}

      {syncError && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-900 dark:text-amber-200">
          <span>{syncError}</span>
          {syncNeedsAuth && (
            <button
              type="button"
              onClick={onConnectGoogleAndSync}
              className="min-h-[34px] px-3 py-1 rounded-lg bg-amber-600 text-white font-semibold cursor-pointer hover:bg-amber-700"
            >
              Sign in with Google
            </button>
          )}
        </div>
      )}

      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 sm:gap-3 pt-3 border-t border-brand-border/70">
        <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-2.5 sm:gap-3 w-full lg:w-auto">
          <div className="w-full sm:w-auto sm:min-w-[270px]">
            <SegmentedControl
              size="sm"
              value={examType}
              options={EXAM_OPTIONS}
              onChange={(val) => onExamTypeChange(val as MarksheetExamType)}
            />
          </div>

          {activeTab === 'marksheet' && (
            <div className="grid grid-cols-5 sm:inline-flex items-center gap-1 p-1 w-full sm:w-auto bg-slate-200/75 dark:bg-slate-800/80 rounded-xl border border-black/[0.04] dark:border-white/[0.06]">
              {(['ALL', 'IX', 'X', 'XI', 'XII'] as const).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => onGradeFilterChange(g)}
                  className={`min-h-[34px] px-2 sm:px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap text-center cursor-pointer transition-colors ${
                    gradeFilter === g
                      ? 'bg-white dark:bg-slate-700/90 text-slate-900 dark:text-white shadow-xs font-semibold'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  <span className="sm:hidden">{g === 'ALL' ? 'All' : g}</span>
                  <span className="hidden sm:inline">{g === 'ALL' ? 'All IX–XII' : `Grade ${g}`}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {activeTab === 'marksheet' && (
          <div className="w-full sm:w-auto sm:min-w-[260px]">
            <SegmentedControl
              size="sm"
              value={gradingSystem}
              options={GRADING_OPTIONS}
              onChange={(val) => onGradingSystemChange(val as GradingSystemType)}
            />
          </div>
        )}
      </div>
    </div>
  );
};

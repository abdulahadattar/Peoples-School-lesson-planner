import React, { RefObject } from 'react';

export interface SpreadsheetExportMenuProps {
  exportMenuOpen: boolean;
  setExportMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  exportMenuRef: RefObject<HTMLDivElement | null>;
  selectedClassLabel: string;
  onExportAllClassesExcel: () => void;
  onExportAllTeachersExcel: () => void;
  onExportSingleClassExcel: () => void;
  onExportSingleTeacherExcel: () => void;
}

export const SpreadsheetExportMenu: React.FC<SpreadsheetExportMenuProps> = ({
  exportMenuOpen,
  setExportMenuOpen,
  exportMenuRef,
  selectedClassLabel,
  onExportAllClassesExcel,
  onExportAllTeachersExcel,
  onExportSingleClassExcel,
  onExportSingleTeacherExcel,
}) => {
  return (
    <div className="relative" ref={exportMenuRef}>
      <button
        type="button"
        onClick={() => setExportMenuOpen((prev) => !prev)}
        className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl bg-brand-bg hover:bg-brand-surface border border-brand-border text-brand-text-primary transition-colors cursor-pointer"
        aria-haspopup="true"
        aria-expanded={exportMenuOpen}
      >
        <svg className="w-4 h-4 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <span>Export Excel</span>
        <svg
          className={`w-3 h-3 ml-0.5 opacity-80 transition-transform duration-200 ${exportMenuOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {exportMenuOpen && (
        <div
          role="menu"
          className="absolute right-0 mt-1 w-64 p-1.5 bg-brand-surface rounded-2xl border border-brand-border shadow-2xl z-40 space-y-1 text-xs animate-scaleIn origin-top-right"
        >
          <div className="px-2.5 py-1 text-[10px] uppercase font-bold text-brand-text-secondary">
            Spreadsheet Exports (.xlsx)
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setExportMenuOpen(false);
              onExportAllClassesExcel();
            }}
            className="w-full text-left px-2.5 py-2 rounded-xl hover:bg-emerald-50 active:bg-emerald-100 dark:hover:bg-emerald-950/40 dark:active:bg-emerald-950/60 text-brand-text-primary flex items-center justify-between transition-colors cursor-pointer"
          >
            <div>
              <div className="font-bold">Class-Wise Timetable</div>
              <div className="text-[10px] text-brand-text-secondary">Master overview + all classes</div>
            </div>
            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-bold">
              .xlsx
            </span>
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setExportMenuOpen(false);
              onExportAllTeachersExcel();
            }}
            className="w-full text-left px-2.5 py-2 rounded-xl hover:bg-emerald-50 active:bg-emerald-100 dark:hover:bg-emerald-950/40 dark:active:bg-emerald-950/60 text-brand-text-primary flex items-center justify-between transition-colors cursor-pointer"
          >
            <div>
              <div className="font-bold">Teacher-Wise Timetable</div>
              <div className="text-[10px] text-brand-text-secondary">Workload summary + all faculty</div>
            </div>
            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-bold">
              .xlsx
            </span>
          </button>

          <div className="border-t border-brand-border my-1" />

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setExportMenuOpen(false);
              onExportSingleClassExcel();
            }}
            className="w-full text-left px-2.5 py-2 rounded-xl hover:bg-brand-bg active:bg-brand-primary/10 text-brand-text-secondary hover:text-brand-text-primary transition-colors text-[11px] cursor-pointer"
          >
            Export Class {selectedClassLabel} Only
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setExportMenuOpen(false);
              onExportSingleTeacherExcel();
            }}
            className="w-full text-left px-2.5 py-2 rounded-xl hover:bg-brand-bg active:bg-brand-primary/10 text-brand-text-secondary hover:text-brand-text-primary transition-colors text-[11px] cursor-pointer"
          >
            Export Selected Teacher Only
          </button>
        </div>
      )}
    </div>
  );
};

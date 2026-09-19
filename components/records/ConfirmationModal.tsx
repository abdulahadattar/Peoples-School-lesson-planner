import React from 'react';
import { AlertCircle, Check, X } from 'lucide-react';

export interface DiffItem {
  field: string;
  label: string;
  oldValue: string;
  newValue: string;
}

interface ConfirmationModalProps {
  isOpen: boolean;
  title: string;
  studentName: string;
  grNo: string;
  rowNumber: number;
  diffs: DiffItem[];
  isSubmitting: boolean;
  isAdd?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  title,
  studentName,
  grNo,
  rowNumber,
  diffs,
  isSubmitting,
  isAdd = false,
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-fadeIn">
      <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-brand-surface border border-brand-border shadow-card p-6 overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-start gap-3.5 mb-4">
          <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center flex-shrink-0 border border-amber-200/60 dark:border-amber-900/60">
            <AlertCircle className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-brand-text-primary">{title}</h3>
            <p className="text-xs text-brand-text-secondary mt-0.5">
              {isAdd
                ? `Append new student record to Google Sheet ("Jamshoro South Final SPD (2)").`
                : `Update row #${rowNumber} in connected Google Sheet for student: ${studentName} (GR# ${grNo}).`}
            </p>
          </div>
        </div>

        <div className="bg-brand-bg rounded-xl border border-brand-border p-3.5 mb-4 overflow-y-auto max-h-60 text-xs">
          <p className="font-semibold text-brand-text-primary mb-2">
            {isAdd ? 'Record to be inserted:' : 'Changes to be applied:'}
          </p>
          {diffs.length === 0 ? (
            <p className="text-brand-text-secondary italic">No field differences detected.</p>
          ) : (
            <div className="space-y-2">
              {diffs.map((diff, i) => (
                <div key={i} className="flex flex-col gap-0.5 pb-1.5 border-b border-brand-border/60 last:border-0 last:pb-0">
                  <span className="font-medium text-brand-text-secondary">{diff.label}:</span>
                  {isAdd ? (
                    <span className="font-semibold text-brand-text-primary">{diff.newValue || '<empty>'}</span>
                  ) : (
                    <div className="flex items-center gap-2 font-mono text-[11px]">
                      <span className="line-through text-rose-500/80 bg-rose-50 dark:bg-rose-950/30 px-1.5 py-0.5 rounded">
                        {diff.oldValue || '<empty>'}
                      </span>
                      <span className="text-brand-text-secondary">→</span>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 px-1.5 py-0.5 rounded">
                        {diff.newValue || '<empty>'}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="text-[11px] text-brand-text-secondary bg-slate-50 dark:bg-slate-900/40 p-2.5 rounded-lg border border-brand-border/70 mb-5">
          <span className="font-semibold text-brand-text-primary">Note:</span> Confirming will push this update directly to the Google Spreadsheet. All school metadata columns will be safely preserved.
        </div>

        <div className="flex items-center justify-end gap-2.5 mt-auto pt-2 border-t border-brand-border">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-brand-text-secondary hover:text-brand-text-primary hover:bg-brand-bg border border-brand-border transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isSubmitting}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-brand-primary hover:bg-brand-primary/90 shadow-soft active:scale-95 transition-all disabled:opacity-50"
          >
            {isSubmitting ? (
              <span>Syncing to Google Sheets...</span>
            ) : (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>Confirm & Update Sheet</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

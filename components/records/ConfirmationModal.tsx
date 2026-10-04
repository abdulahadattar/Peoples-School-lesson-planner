import React from 'react';
import { AlertCircle, Check } from 'lucide-react';
import { BaseModal } from '../ui/BaseModal';

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
  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onCancel}
      title={title}
      subtitle={
        isAdd
          ? 'Append new student record to Google Sheet ("Jamshoro South Final SPD (2)").'
          : `Update row #${rowNumber} in connected Google Sheet for student: ${studentName} (GR# ${grNo}).`
      }
      icon={
        <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center flex-shrink-0 border border-amber-200/60 dark:border-amber-900/60">
          <AlertCircle className="w-5 h-5" />
        </div>
      }
      maxWidth="lg"
      footer={
        <>
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 transition-colors disabled:opacity-50 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isSubmitting}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-primary hover:bg-primary/90 shadow-soft active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
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
        </>
      }
    >
      <div className="bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 p-3.5 mb-4 overflow-y-auto max-h-60 text-xs">
        <p className="font-semibold text-slate-800 dark:text-slate-200 mb-2">
          {isAdd ? 'Record to be inserted:' : 'Changes to be applied:'}
        </p>
        {diffs.length === 0 ? (
          <p className="text-slate-500 italic">No field differences detected.</p>
        ) : (
          <div className="space-y-2">
            {diffs.map((diff, i) => (
              <div key={i} className="flex flex-col gap-0.5 pb-1.5 border-b border-slate-200/60 dark:border-slate-800/60 last:border-0 last:pb-0">
                <span className="font-medium text-slate-500 dark:text-slate-400">{diff.label}:</span>
                {isAdd ? (
                  <span className="font-semibold text-slate-900 dark:text-white">{diff.newValue || '<empty>'}</span>
                ) : (
                  <div className="flex items-center gap-2 font-mono text-[11px]">
                    <span className="line-through text-rose-500/80 bg-rose-50 dark:bg-rose-950/30 px-1.5 py-0.5 rounded">
                      {diff.oldValue || '<empty>'}
                    </span>
                    <span className="text-slate-400">→</span>
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

      <div className="text-[11px] text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/40 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700">
        <span className="font-semibold text-slate-800 dark:text-slate-200">Note:</span> Confirming will push this update directly to the Google Spreadsheet. All school metadata columns will be safely preserved.
      </div>
    </BaseModal>
  );
};

import React, { useEffect, useRef, useState } from 'react';
import {
  Check,
  CloudUpload,
  ExternalLink,
  Link2,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Trash2,
  Upload,
} from 'lucide-react';
import { EXAM_TYPE_LABELS, SUBJECT_LABELS } from '../../services/marksheet/config';
import type { MarksheetPendingEdit } from '../../services/marksheet/pendingEditsRepository';
import type { SubjectKey } from '../../services/marksheet/types';

export interface MarksheetAdminSheetBarProps {
  activeSpreadsheetUrl: string;
  isCustomSpreadsheet: boolean;
  isSavingSheetLink: boolean;
  isSyncingLive: boolean;
  isPushingPending: boolean;
  pushingDocId: string | null;
  pendingEdits: MarksheetPendingEdit[];
  onCheckSheetUpdates: () => void;
  onReplaceSheetLink: (urlOrId: string) => Promise<boolean>;
  onResetSheetLink: () => Promise<boolean>;
  onImportFile: (file: File) => void;
  onPushPendingToSheet: (targetDocIds?: string[]) => void;
  onDiscardPendingEdit: (docId: string) => void;
}

function formatScoreDiff(edit: MarksheetPendingEdit): string {
  const parts = Object.entries(edit.scores || {}).map(([k, nextVal]) => {
    const subj = k as SubjectKey;
    const label = SUBJECT_LABELS[subj] || k;
    const prevVal = edit.previousScores?.[subj];
    const prevStr = prevVal === null || prevVal === undefined ? '—' : String(prevVal);
    const nextStr = nextVal === null || nextVal === undefined ? '—' : String(nextVal);
    return `${label}: ${prevStr} → ${nextStr}`;
  });
  if (parts.length > 0) return parts.join(', ');
  const opts: string[] = [];
  if (edit.optionalLanguage) opts.push(edit.optionalLanguage);
  if (edit.optionalElective) opts.push(edit.optionalElective);
  return opts.length ? `Optional: ${opts.join(', ')}` : 'Updated';
}

function formatAuthors(edit: MarksheetPendingEdit): string {
  const names = new Set<string>();
  Object.values(edit.fieldAuthors || {}).forEach((a) => {
    if (a?.name) names.add(a.name);
  });
  if (names.size > 0) return Array.from(names).join(', ');
  return edit.updatedByName || edit.updatedByEmail || 'Teacher';
}

export const MarksheetAdminSheetBar: React.FC<MarksheetAdminSheetBarProps> = ({
  activeSpreadsheetUrl,
  isCustomSpreadsheet,
  isSavingSheetLink,
  isSyncingLive,
  isPushingPending,
  pushingDocId,
  pendingEdits,
  onCheckSheetUpdates,
  onReplaceSheetLink,
  onResetSheetLink,
  onImportFile,
  onPushPendingToSheet,
  onDiscardPendingEdit,
}) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [linkDraft, setLinkDraft] = useState(activeSpreadsheetUrl);

  useEffect(() => {
    setLinkDraft(activeSpreadsheetUrl);
  }, [activeSpreadsheetUrl]);

  const busy = isSavingSheetLink || isSyncingLive || isPushingPending;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onReplaceSheetLink(linkDraft);
  };

  return (
    <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 dark:bg-emerald-950/20 p-3 sm:p-3.5 space-y-3">
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onImportFile(f);
          e.target.value = '';
        }}
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
          <ShieldCheck className="w-4 h-4 shrink-0" />
          <span>Google Sheet</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onCheckSheetUpdates}
            disabled={busy}
            className="min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-semibold border border-brand-border bg-white dark:bg-brand-surface hover:bg-slate-100 dark:hover:bg-slate-800 text-brand-text-primary inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncingLive ? 'animate-spin' : ''}`} />
            <span>{isSyncingLive ? 'Updating...' : 'Refresh from Sheet'}</span>
          </button>

          <a
            href={activeSpreadsheetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-semibold border border-brand-border bg-white dark:bg-brand-surface hover:bg-slate-100 dark:hover:bg-slate-800 text-brand-text-primary inline-flex items-center gap-1.5 whitespace-nowrap transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Open Google Sheet</span>
          </a>

          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-semibold border border-brand-border bg-white dark:bg-brand-surface hover:bg-slate-100 dark:hover:bg-slate-800 text-brand-text-primary inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Import File</span>
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        <div className="relative flex-1 min-w-0">
          <Link2 className="w-3.5 h-3.5 text-brand-text-secondary absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="url"
            value={linkDraft}
            onChange={(e) => setLinkDraft(e.target.value)}
            placeholder="Paste Google Sheet URL or Spreadsheet ID..."
            aria-label="Synced Google Sheet link"
            className="w-full min-h-[38px] pl-8 pr-3 py-1.5 rounded-lg border border-brand-border bg-white dark:bg-brand-surface text-xs text-brand-text-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/40"
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={busy || !linkDraft.trim()}
            className="flex-1 sm:flex-initial min-h-[38px] px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold whitespace-nowrap cursor-pointer transition-colors disabled:opacity-50"
          >
            {isSavingSheetLink || isSyncingLive ? 'Updating...' : 'Replace & Sync'}
          </button>

          {isCustomSpreadsheet && (
            <button
              type="button"
              onClick={() => void onResetSheetLink()}
              disabled={busy}
              title="Restore default Google Sheet"
              className="min-h-[38px] px-3 py-1.5 rounded-lg border border-brand-border bg-white dark:bg-brand-surface hover:bg-slate-100 dark:hover:bg-slate-800 text-brand-text-secondary text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors disabled:opacity-50"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Default</span>
            </button>
          )}
        </div>
      </form>

      {pendingEdits.length > 0 && (
        <div className="pt-2.5 border-t border-emerald-500/20 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold text-brand-text-primary">
              Pending Teacher Updates ({pendingEdits.length})
            </span>

            <button
              type="button"
              onClick={() => onPushPendingToSheet()}
              disabled={busy}
              className="min-h-[38px] px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors disabled:opacity-50"
            >
              <CloudUpload className="w-3.5 h-3.5 shrink-0" />
              <span>
                {pushingDocId === 'ALL'
                  ? 'Saving...'
                  : 'Approve & Save All'}
              </span>
            </button>
          </div>

          <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
            {pendingEdits.map((edit) => {
              const isRowPushing = pushingDocId === edit.docId || pushingDocId === 'ALL';
              return (
                <div
                  key={edit.docId}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-lg border border-brand-border/70 bg-white dark:bg-brand-surface px-3 py-2 text-[11px]"
                >
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                      <span className="font-semibold text-brand-text-primary tabular-nums">
                        GR {edit.grNo}
                        {edit.studentName ? ` · ${edit.studentName}` : ''}
                      </span>
                      <span className="text-brand-text-secondary">
                        ({edit.gradeLevel} · {EXAM_TYPE_LABELS[edit.examType]})
                      </span>
                    </div>
                    <div className="text-brand-text-primary font-medium tabular-nums">
                      {formatScoreDiff(edit)}
                    </div>
                    <div className="text-brand-text-secondary">
                      Edited by {formatAuthors(edit)}
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => onPushPendingToSheet([edit.docId])}
                      disabled={busy}
                      className="min-h-[34px] px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold inline-flex items-center gap-1 whitespace-nowrap cursor-pointer disabled:opacity-50"
                    >
                      <Check className="w-3 h-3" />
                      <span>{isRowPushing ? 'Saving...' : 'Approve'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onDiscardPendingEdit(edit.docId)}
                      disabled={busy}
                      aria-label={`Discard pending edit for GR ${edit.grNo}`}
                      className="min-h-[34px] min-w-[34px] p-1.5 rounded-lg border border-brand-border text-brand-text-secondary hover:text-red-600 hover:bg-red-500/10 flex items-center justify-center cursor-pointer shrink-0 disabled:opacity-40"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

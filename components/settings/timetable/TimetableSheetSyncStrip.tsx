import React from 'react';
import { PushPreviewData } from './TimetableToolbar';

export interface TimetableSheetSyncStripProps {
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

export const TimetableSheetSyncStrip: React.FC<TimetableSheetSyncStripProps> = ({
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
    <div className="bg-brand-surface border border-brand-border rounded-xl px-3.5 py-2.5 shadow-xs space-y-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[11px] text-brand-text-secondary">
        <span className="inline-flex items-center gap-1.5 font-bold text-brand-text-primary">
          <span
            className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
              sheetSync.unreachable
                ? 'bg-rose-500'
                : sheetSync.error || sheetSync.needsReconnect
                ? 'bg-amber-500'
                : 'bg-emerald-500'
            }`}
          />
          Timetable Sheet
        </span>

        <span title="Last successful read of the timetable sheet">{lastSyncedLabel}</span>
        <span className="text-brand-border">·</span>
        <span>
          {sheetSync.nextRefreshLabel
            ? `next refresh in ${sheetSync.nextRefreshLabel}`
            : 'automatic refresh paused'}
        </span>

        {sheetSync.sheetChangesCount > 0 && (
          <span
            className="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-800 font-bold"
            title="Cells where the app and the Google Sheet currently disagree."
          >
            {sheetSync.sheetChangesCount} difference{sheetSync.sheetChangesCount === 1 ? '' : 's'}
          </span>
        )}

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onRefreshFromSheet}
            disabled={syncing}
            className="px-3 py-1.5 rounded-xl bg-brand-bg hover:bg-brand-border text-brand-text-primary border border-brand-border text-[11px] font-semibold transition-colors disabled:opacity-50 cursor-pointer"
            title="Re-read Google Sheet now"
          >
            {sheetSync.refreshing ? 'Refreshing...' : 'Refresh from sheet'}
          </button>
          <button
            type="button"
            onClick={onSyncToSheet}
            disabled={syncing || sheetSync.needsReconnect}
            className="px-3 py-1.5 rounded-xl bg-brand-primary/10 hover:bg-brand-primary/20 text-brand-primary border border-brand-primary/30 text-[11px] font-semibold transition-colors disabled:opacity-50 cursor-pointer"
            title="Preview cells that would change in Google Sheets"
          >
            {syncing && !sheetSync.refreshing ? 'Working...' : 'Sync to Google Sheets'}
          </button>
        </div>
      </div>

      {sheetSync.needsReconnect && (
        <div className="px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-[11px] text-amber-800 dark:text-amber-200 flex flex-wrap items-center gap-2">
          <span className="font-bold">Reconnect Sheets to sync.</span>
          <span>Google Sheets access has expired. Saving to the cloud is unaffected.</span>
          <button
            type="button"
            onClick={onReconnectSheets}
            disabled={reconnecting}
            className="ml-auto px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold transition-colors disabled:opacity-50 cursor-pointer"
          >
            {reconnecting ? 'Opening Google...' : 'Reconnect Google'}
          </button>
          <button
            type="button"
            onClick={sheetSync.dismissNeedsReconnect}
            className="px-2 py-1 rounded-lg font-bold underline hover:no-underline cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {sheetChangedUnderEdits && (
        <div className="px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-[11px] text-amber-800 dark:text-amber-200">
          <span className="font-bold">The sheet changed since you loaded it</span> - refresh before syncing, or your edits will overwrite those changes.
        </div>
      )}

      {sheetSync.unreachable && (
        <div className="px-3 py-2 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 text-[11px] text-rose-800 dark:text-rose-200 flex flex-wrap items-center gap-2">
          <span className="font-bold">Could not reach the sheet.</span>
          <span>{sheetSync.error || 'Automatic refresh has been paused.'}</span>
          <button
            type="button"
            onClick={sheetSync.startPolling}
            disabled={sheetSync.refreshing}
            className="ml-auto px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold transition-colors disabled:opacity-50 cursor-pointer"
          >
            {sheetSync.refreshing ? 'Retrying...' : 'Retry'}
          </button>
        </div>
      )}

      {!sheetSync.unreachable && sheetSync.error && !sheetSync.needsReconnect && (
        <div className="px-3 py-2 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 text-[11px] text-rose-800 dark:text-rose-200">
          Last read of the sheet failed: {sheetSync.error}
        </div>
      )}

      {pushPreview && pushPreview.cellCount > 0 && (
        <div className="px-3 py-2 rounded-lg bg-brand-primary/5 border border-brand-primary/30 text-[11px] text-brand-text-primary flex flex-wrap items-center gap-2">
          <span className="font-bold">
            Write {pushPreview.cellCount} cell{pushPreview.cellCount === 1 ? '' : 's'}
          </span>
          <span className="text-brand-text-secondary">
            {pushPreview.tabLabels.length > 0
              ? `to the ${pushPreview.tabLabels.join(', ')} tab${pushPreview.tabLabels.length === 1 ? '' : 's'} in Google Sheets.`
              : 'in Google Sheets.'}{' '}
            Only timetable cells change.
            {pushPreview.skipped.length > 0 && ` ${pushPreview.skipped.length} tab${pushPreview.skipped.length === 1 ? '' : 's'} will be skipped.`}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPushPreview(null)}
              className="px-2.5 py-1 rounded-lg bg-brand-bg hover:bg-brand-border border border-brand-border text-brand-text-secondary font-semibold transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirmPushToSheet}
              className="px-2.5 py-1 rounded-lg bg-brand-primary hover:bg-brand-primary-hover text-white font-bold transition-colors cursor-pointer"
            >
              Write to sheet
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

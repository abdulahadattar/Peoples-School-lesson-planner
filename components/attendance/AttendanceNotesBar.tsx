import React from 'react';
import { Save, RefreshCw, FileSpreadsheet } from 'lucide-react';

export interface AttendanceNotesBarProps {
  notes: string;
  onNotesChange: (val: string) => void;
  isSaving: boolean;
  isSyncingToSheet: boolean;
  loadError: string | null;
  onSaveToDatabase: () => void;
  onSyncToGoogleSheet: () => void;
}

export const AttendanceNotesBar: React.FC<AttendanceNotesBarProps> = ({
  notes,
  onNotesChange,
  isSaving,
  isSyncingToSheet,
  loadError,
  onSaveToDatabase,
  onSyncToGoogleSheet,
}) => {
  return (
    <div className="p-4 bg-brand-surface rounded-2xl border border-brand-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
      <div className="flex-1 w-full sm:w-auto">
        <input
          type="text"
          value={notes}
          onChange={e => onNotesChange(e.target.value)}
          placeholder="Optional remarks or notes for today's attendance (e.g. Rainy weather, Sports day)..."
          className="w-full h-9 px-3 text-xs rounded-xl bg-brand-bg border border-brand-border text-brand-text-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onSyncToGoogleSheet}
          disabled={isSyncingToSheet || isSaving}
          title="Push to Google Sheet on demand"
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50 transition-all shadow-xs active:scale-95 cursor-pointer"
        >
          {isSyncingToSheet ? (
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <FileSpreadsheet className="w-3.5 h-3.5" />
          )}
          <span>{isSyncingToSheet ? 'Syncing...' : 'Sync to Sheet'}</span>
        </button>

        <button
          type="button"
          onClick={onSaveToDatabase}
          disabled={isSaving}
          title={loadError ? 'The register below is blank because loading failed - saving will overwrite this date' : 'Save attendance to application database & storage'}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl brand-gradient text-white hover:opacity-90 disabled:opacity-50 transition-all shadow-sm active:scale-95 cursor-pointer"
        >
          {isSaving ? (
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Save className="w-3.5 h-3.5" />
          )}
          <span>{isSaving ? 'Saving...' : 'Save Roster'}</span>
        </button>
      </div>
    </div>
  );
};

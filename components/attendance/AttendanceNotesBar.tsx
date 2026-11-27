import React from 'react';

export interface AttendanceNotesBarProps {
  notes: string;
  onNotesChange: (val: string) => void;
  disabled?: boolean;
}

export const AttendanceNotesBar: React.FC<AttendanceNotesBarProps> = ({
  notes,
  onNotesChange,
  disabled = false,
}) => {
  return (
    <div className="p-4 bg-brand-surface rounded-2xl border border-brand-border shadow-xs">
      <input
        type="text"
        value={notes}
        disabled={disabled}
        onChange={(e) => onNotesChange(e.target.value)}
        placeholder={
          disabled
            ? 'Offline — connect to internet to add or edit remarks...'
            : "Optional remarks or notes for today's attendance (auto-synced)..."
        }
        className="w-full h-9 px-3 text-xs rounded-xl bg-brand-bg border border-brand-border text-brand-text-primary focus:outline-none focus:ring-1 focus:ring-brand-primary transition-[color,background-color,border-color,opacity] disabled:bg-slate-200/75 dark:disabled:bg-slate-800/75 disabled:text-slate-400 dark:disabled:text-slate-500 disabled:border-slate-300/80 dark:disabled:border-slate-700 disabled:cursor-not-allowed disabled:opacity-75"
      />
    </div>
  );
};

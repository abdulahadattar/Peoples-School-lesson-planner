import React from 'react';
import { RotateCcw, Save, AlertCircle } from 'lucide-react';

export interface UnsavedChangesBarProps {
  visible: boolean;
  isAdmin: boolean;
  isSaving: boolean;
  onDiscard: () => void;
  onSave: () => void;
}

export const UnsavedChangesBar: React.FC<UnsavedChangesBarProps> = ({
  visible,
  isAdmin,
  isSaving,
  onDiscard,
  onSave,
}) => {
  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-xl bg-amber-50/85 dark:bg-amber-950/30 border border-amber-300/70 dark:border-amber-800/70 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 animate-fadeIn"
    >
      <div className="flex items-center gap-2 text-xs text-amber-900 dark:text-amber-200 min-w-0">
        <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" aria-hidden="true" />
        <span className="font-semibold">
          {isAdmin
            ? 'You have unsaved school setting changes.'
            : 'Unsaved preview edits — sign in as Admin to save.'}
        </span>
      </div>

      <div className="grid grid-cols-2 sm:flex items-center gap-2 w-full sm:w-auto shrink-0 sm:ml-auto">
        <button
          type="button"
          onClick={onDiscard}
          disabled={isSaving}
          className="inline-flex items-center justify-center gap-1.5 px-3 py-2 min-h-[44px] sm:min-h-[36px] rounded-lg text-xs font-semibold text-brand-text-primary bg-brand-surface hover:bg-brand-panel border border-brand-border transition-colors cursor-pointer disabled:opacity-40 whitespace-nowrap"
        >
          <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Discard</span>
        </button>

        <button
          type="button"
          onClick={onSave}
          disabled={!isAdmin || isSaving}
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2 min-h-[44px] sm:min-h-[36px] rounded-lg text-xs font-semibold text-white bg-brand-primary hover:bg-brand-primary-hover transition-colors cursor-pointer disabled:opacity-40 whitespace-nowrap"
        >
          <Save className="w-3.5 h-3.5" aria-hidden="true" />
          <span>{isSaving ? 'Saving...' : 'Save Changes'}</span>
        </button>
      </div>
    </div>
  );
};

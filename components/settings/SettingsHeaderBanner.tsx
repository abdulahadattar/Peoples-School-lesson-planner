import React from 'react';
import {
  ChevronRight,
  LogIn,
  RotateCcw,
  Save,
  CheckCircle2,
  ShieldCheck,
  ShieldAlert,
} from 'lucide-react';
import { User } from 'firebase/auth';

export interface SettingsHeaderBannerProps {
  pillarLabel: string;
  sectionLabel: string;
  sectionDescription: string;
  isAdmin: boolean;
  currentUser: User | null;
  saveSuccess: boolean;
  isSaving: boolean;
  hasUnsavedChanges: boolean;
  onOpenLoginGate?: () => void;
  onGoogleSignIn: () => void;
  onResetBaseline: () => void;
  onSaveAll: () => void;
}

export const SettingsHeaderBanner: React.FC<SettingsHeaderBannerProps> = ({
  pillarLabel,
  sectionLabel,
  sectionDescription,
  isAdmin,
  currentUser,
  saveSuccess,
  isSaving,
  hasUnsavedChanges,
  onOpenLoginGate,
  onGoogleSignIn,
  onResetBaseline,
  onSaveAll,
}) => {
  return (
    <header className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3.5 sm:gap-4 pb-4 sm:pb-5 border-b border-brand-border">
      <div className="space-y-1 sm:space-y-1.5 min-w-0">
        <nav
          aria-label="School Admin breadcrumb"
          className="flex flex-wrap items-center gap-1 sm:gap-1.5 text-[11px] sm:text-xs text-brand-text-secondary"
        >
          <span className="font-medium text-brand-text-primary">School Admin</span>
          <ChevronRight className="w-3.5 h-3.5 text-brand-text-tertiary shrink-0" aria-hidden="true" />
          <span className="truncate">{pillarLabel}</span>
          <ChevronRight className="w-3.5 h-3.5 text-brand-text-tertiary shrink-0" aria-hidden="true" />
          <span className="font-semibold text-brand-primary truncate">{sectionLabel}</span>
        </nav>

        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-brand-text-primary">
          {sectionLabel}
        </h1>

        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-brand-text-secondary">
          <span className="hidden sm:inline">{sectionDescription}</span>
          <span aria-hidden="true" className="hidden sm:inline text-brand-border">·</span>
          {isAdmin ? (
            <span className="inline-flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-300 truncate max-w-full">
              <ShieldCheck className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">Admin · {currentUser?.email}</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 font-medium text-amber-700 dark:text-amber-300">
              <ShieldAlert className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>View-only · Sign in as Admin to save</span>
            </span>
          )}
          {saveSuccess && (
            <>
              <span aria-hidden="true" className="text-brand-border">·</span>
              <span className="inline-flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400 animate-fadeIn">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>Saved</span>
              </span>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 sm:gap-2.5 w-full lg:w-auto shrink-0">
        {!isAdmin && (
          <button
            type="button"
            onClick={() => {
              if (onOpenLoginGate) onOpenLoginGate();
              else onGoogleSignIn();
            }}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2 min-h-[44px] sm:min-h-[40px] rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-soft active:scale-[0.98] transition-[background-color,transform] cursor-pointer whitespace-nowrap shrink-0"
          >
            <LogIn className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Sign In as Admin</span>
          </button>
        )}

        <button
          type="button"
          onClick={onResetBaseline}
          disabled={!isAdmin || isSaving}
          className={`${
            !isAdmin ? 'hidden sm:inline-flex' : 'flex-1 sm:flex-none inline-flex'
          } items-center justify-center gap-1.5 px-3.5 py-2 min-h-[44px] sm:min-h-[40px] rounded-xl text-xs font-semibold bg-brand-surface border border-brand-border text-brand-text-secondary hover:text-rose-600 hover:border-rose-300 dark:hover:border-rose-800 active:scale-[0.98] transition-[color,border-color,transform] disabled:opacity-40 cursor-pointer whitespace-nowrap shrink-0`}
        >
          <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Reset Baseline</span>
        </button>

        <button
          type="button"
          onClick={onSaveAll}
          disabled={!isAdmin || isSaving}
          className={`${
            !isAdmin ? 'hidden sm:inline-flex' : 'flex-1 sm:flex-none inline-flex'
          } items-center justify-center gap-2 px-4 py-2 min-h-[44px] sm:min-h-[40px] rounded-xl text-xs font-semibold text-white transition-[background-color,transform,box-shadow] active:scale-[0.98] disabled:opacity-40 cursor-pointer whitespace-nowrap shrink-0 ${
            hasUnsavedChanges && isAdmin
              ? 'bg-brand-primary hover:bg-brand-primary-hover shadow-card'
              : 'bg-brand-primary hover:bg-brand-primary-hover'
          }`}
        >
          <Save className="w-3.5 h-3.5" aria-hidden="true" />
          <span>{isSaving ? 'Saving...' : 'Save Changes'}</span>
        </button>
      </div>
    </header>
  );
};

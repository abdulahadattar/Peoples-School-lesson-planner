import React from 'react';
import {
  Settings,
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
  LogIn,
  RotateCcw,
  Save,
} from 'lucide-react';
import { User } from 'firebase/auth';

export interface SettingsHeaderBannerProps {
  isAdmin: boolean;
  currentUser: User | null;
  saveSuccess: boolean;
  isSaving: boolean;
  onOpenLoginGate?: () => void;
  onGoogleSignIn: () => void;
  onResetBaseline: () => void;
  onSaveAll: () => void;
}

export const SettingsHeaderBanner: React.FC<SettingsHeaderBannerProps> = ({
  isAdmin,
  currentUser,
  saveSuccess,
  isSaving,
  onOpenLoginGate,
  onGoogleSignIn,
  onResetBaseline,
  onSaveAll,
}) => {
  return (
    <div className="rounded-2xl glass-card p-5 sm:p-6 border border-brand-border shadow-card flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
      <div className="space-y-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="px-2.5 py-1 rounded-lg bg-brand-primary/10 text-brand-primary text-xs font-bold border border-brand-primary/20 flex items-center gap-1.5">
            <Settings className="w-3.5 h-3.5" />
            <span>School Administration Portal</span>
          </span>

          {isAdmin ? (
            <span className="px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 text-xs font-bold border border-emerald-200 dark:border-emerald-800 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Admin Access: {currentUser?.email}</span>
            </span>
          ) : (
            <span className="px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 text-xs font-bold border border-amber-200 dark:border-amber-800 flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>Read-Only Mode • Admin Sign-In Required to Save</span>
            </span>
          )}

          {saveSuccess && (
            <span className="px-2.5 py-1 rounded-lg bg-emerald-500 text-white text-xs font-bold flex items-center gap-1 animate-fadeIn">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Saved & Synchronized!</span>
            </span>
          )}
        </div>

        <h1 className="text-xl sm:text-2xl font-extrabold text-brand-text-primary tracking-tight">
          Institutional Settings & Configuration
        </h1>
        <p className="text-xs text-brand-text-secondary max-w-3xl leading-relaxed">
          Configure school classes, class teacher in-charge allocations, attendance enrollment modes
          (Manual vs Google Sheet sync), Google Sheet editing permissions lock, and academic period timings.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        {!isAdmin && (
          <button
            type="button"
            onClick={() => {
              if (onOpenLoginGate) onOpenLoginGate();
              else onGoogleSignIn();
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-soft active:scale-95 transition-all cursor-pointer"
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>Sign In as Admin</span>
          </button>
        )}

        <button
          type="button"
          onClick={onResetBaseline}
          disabled={!isAdmin || isSaving}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-white dark:bg-brand-surface border border-brand-border text-brand-text-secondary hover:text-rose-600 hover:border-rose-200 shadow-soft active:scale-95 transition-all disabled:opacity-40 cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Reset Baseline</span>
        </button>

        <button
          type="button"
          onClick={onSaveAll}
          disabled={!isAdmin || isSaving}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-brand-primary hover:bg-brand-primary/90 shadow-soft active:scale-95 transition-all disabled:opacity-40 cursor-pointer"
        >
          <Save className="w-3.5 h-3.5" />
          <span>{isSaving ? 'Saving...' : 'Save Changes'}</span>
        </button>
      </div>
    </div>
  );
};

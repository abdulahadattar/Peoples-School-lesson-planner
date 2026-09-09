import React from 'react';
import { User } from 'firebase/auth';

interface GoogleSignInButtonProps {
  user: User | null;
  isLoading: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
}

export const GoogleSignInButton: React.FC<GoogleSignInButtonProps> = ({
  user,
  isLoading,
  onSignIn,
  onSignOut,
}) => {
  if (user) {
    return (
      <div className="flex items-center gap-2.5 bg-brand-surface border border-brand-border px-3 py-1.5 rounded-xl shadow-xs">
        {user.photoURL ? (
          <img
            src={user.photoURL}
            alt={user.displayName || 'Google Account'}
            referrerPolicy="no-referrer"
            className="w-6 h-6 rounded-full border border-brand-border object-cover"
          />
        ) : (
          <div className="w-6 h-6 rounded-full bg-brand-primary text-white flex items-center justify-center text-xs font-semibold">
            {(user.displayName || user.email || 'G').charAt(0).toUpperCase()}
          </div>
        )}
        <div className="hidden sm:block text-left">
          <p className="text-xs font-semibold text-brand-text-primary leading-tight truncate max-w-[140px]">
            {user.displayName || 'Google User'}
          </p>
          <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium leading-none">
            Google Sheets Connected
          </p>
        </div>
        <button
          type="button"
          onClick={onSignOut}
          title="Sign out of Google"
          className="ml-1 text-[11px] font-medium text-brand-text-secondary hover:text-rose-600 transition-colors px-2 py-0.5 rounded-md hover:bg-rose-50 dark:hover:bg-rose-950/30"
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onSignIn}
      disabled={isLoading}
      title="Sign in with Google to sync edits directly to Google Sheets"
      className="inline-flex items-center gap-2.5 px-3.5 py-2 rounded-xl bg-white dark:bg-brand-surface border border-brand-border hover:border-brand-primary/40 text-brand-text-primary text-xs font-semibold shadow-soft hover:shadow-card active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
    >
      <svg className="w-4 h-4" viewBox="0 0 48 48">
        <path
          fill="#EA4335"
          d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
        />
        <path
          fill="#4285F4"
          d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
        />
        <path
          fill="#FBBC05"
          d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
        />
        <path
          fill="#34A853"
          d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
        />
        <path fill="none" d="M0 0h48v48H0z" />
      </svg>
      <span>{isLoading ? 'Connecting...' : 'Sign in with Google'}</span>
    </button>
  );
};

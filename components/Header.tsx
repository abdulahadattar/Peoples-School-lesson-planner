import React, { useState, useEffect } from 'react';
import { MenuIcon, MoonIcon, SunIcon } from './icons/MiscIcons';
import { PhssjLogo } from './Logo';
import { View } from '../types';
import { auth, loginWithGoogle, logoutUser } from '../services/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';

type Theme = 'light' | 'dark';

interface HeaderProps {
  theme: Theme;
  onToggleTheme: () => void;
  onOpenSidebar: () => void;
  activeView?: View;
}

const VIEW_LABELS: Record<string, string> = {
  home: 'Home',
  attendance: 'Daily Attendance',
  records: 'Student Records',
  lesson: 'Lesson Plans',
  paper: 'Exam Papers',
  live: 'Live Monitor',
  history: 'History Archive',
  results: 'Generation Results',
};

const Header: React.FC<HeaderProps> = ({ theme, onToggleTheme, onOpenSidebar, activeView }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
    });
    return () => unsubscribe();
  }, []);

  return (
    <header className="h-14 md:h-16 px-3.5 md:px-6 bg-brand-surface/85 dark:bg-brand-surface/95 backdrop-blur-xl border-b border-brand-border flex items-center justify-between sticky top-0 z-30 shadow-xs">
      <div className="flex items-center gap-2.5 sm:gap-3.5">
        <button
          onClick={onOpenSidebar}
          aria-label="Open navigation"
          className="md:hidden p-2 text-brand-text-secondary hover:text-brand-text-primary hover:bg-brand-bg rounded-xl transition-all duration-200 active:scale-90 min-w-[40px] min-h-[40px] flex items-center justify-center"
        >
          <MenuIcon className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 md:w-10 md:h-10 rounded-full bg-white dark:bg-slate-900 shadow-soft border border-brand-border flex items-center justify-center flex-shrink-0 p-0.5 ring-1 ring-black/5 dark:ring-white/10">
            <PhssjLogo className="w-full h-full rounded-full" />
          </div>
          <div className="leading-tight">
            <div className="flex items-center gap-2">
              <h1 className="text-sm md:text-base font-bold text-brand-text-primary tracking-tight truncate">
                PHSSJ
              </h1>
              {activeView && activeView !== 'home' && (
                <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-brand-primary/10 text-brand-primary border border-brand-primary/20">
                  {VIEW_LABELS[activeView] || activeView}
                </span>
              )}
            </div>
            <p className="text-[10px] text-brand-text-secondary hidden md:block">
              Peoples Higher Secondary School Jamshoro
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        {currentUser ? (
          <div className="flex items-center gap-2 bg-brand-surface border border-brand-border rounded-xl px-3 py-1.5 shadow-xs">
            {currentUser.photoURL ? (
              <img src={currentUser.photoURL} alt={currentUser.displayName || 'User'} className="w-6 h-6 rounded-full" />
            ) : (
              <div className="w-6 h-6 rounded-full bg-brand-primary text-white flex items-center justify-center text-xs font-bold">
                {(currentUser.displayName || currentUser.email || 'U')[0].toUpperCase()}
              </div>
            )}
            <span className="text-xs font-medium text-brand-text-primary hidden sm:inline max-w-[120px] truncate">
              {currentUser.displayName || currentUser.email}
            </span>
            <button
              onClick={() => logoutUser()}
              className="text-[11px] text-red-600 hover:text-red-700 font-medium px-2 py-1 rounded hover:bg-red-50 transition-colors"
              title="Sign Out"
            >
              Sign Out
            </button>
          </div>
        ) : (
          <button
            onClick={async () => {
              try {
                await loginWithGoogle();
              } catch (err: any) {
                if (err?.code !== 'auth/popup-closed-by-user' && err?.code !== 'auth/cancelled-popup-request') {
                  console.warn('Sign in issue:', err?.message || err);
                }
              }
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-brand-primary text-white text-xs font-medium hover:bg-brand-primary/90 transition-all shadow-xs"
          >
            <span>Sign In with Google</span>
          </button>
        )}

        <button
          onClick={onToggleTheme}
          aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
          title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
          className="relative p-2.5 rounded-xl text-brand-text-secondary hover:text-brand-primary hover:bg-brand-primary/10 transition-all duration-200 active:scale-90 min-w-[40px] min-h-[40px] flex items-center justify-center group"
        >
          <span className="absolute inset-0 rounded-xl group-hover:ring-1 group-hover:ring-brand-primary/20" />
          {theme === 'light' ? (
            <MoonIcon className="w-4.5 h-4.5 transition-transform group-hover:-rotate-12 duration-200" />
          ) : (
            <SunIcon className="w-4.5 h-4.5 transition-transform group-hover:rotate-45 duration-200 text-amber-400" />
          )}
        </button>
      </div>
    </header>
  );
};

export default Header;
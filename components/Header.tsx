import React, { useState, useEffect } from 'react';
import { MenuIcon, MoonIcon, SunIcon } from './icons/MiscIcons';
import { PhssjLogo } from './Logo';
import { View } from '../types';
import { auth, loginWithGoogle, logoutUser } from '../services/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { isUserAdmin } from '../services/adminService';
import { ShieldCheck, LogIn, LogOut } from 'lucide-react';
import { motion } from 'motion/react';

type Theme = 'light' | 'dark';

interface HeaderProps {
  theme: Theme;
  onToggleTheme: () => void;
  onOpenSidebar: () => void;
  activeView?: View;
  onOpenLoginGate?: () => void;
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

const Header: React.FC<HeaderProps> = ({
  theme,
  onToggleTheme,
  onOpenSidebar,
  activeView,
  onOpenLoginGate,
}) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
    });
    return () => unsubscribe();
  }, []);

  const isAdmin = isUserAdmin(currentUser?.email);

  return (
    <header className="h-14 md:h-16 px-3.5 md:px-6 bg-brand-surface/85 dark:bg-brand-surface/95 backdrop-blur-xl border-b border-brand-border flex items-center justify-between sticky top-0 z-30 shadow-xs">
      <div className="flex items-center gap-2.5 sm:gap-3.5">
        <button
          onClick={onOpenSidebar}
          aria-label="Open navigation"
          className="md:hidden p-2 text-brand-text-secondary hover:text-brand-text-primary hover:bg-brand-bg rounded-xl transition-all duration-200 active:scale-90 min-w-[44px] min-h-[44px] flex items-center justify-center"
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
          <div className="flex items-center gap-2 bg-brand-surface border border-brand-border rounded-xl px-2.5 py-1.5 shadow-xs transition-all">
            {currentUser.photoURL ? (
              <img
                src={currentUser.photoURL}
                alt={currentUser.displayName || 'User'}
                className="w-6 h-6 rounded-full ring-1 ring-black/10 dark:ring-white/10"
              />
            ) : (
              <div className="w-6 h-6 rounded-full bg-brand-primary text-white flex items-center justify-center text-xs font-bold shadow-xs">
                {(currentUser.displayName || currentUser.email || 'U')[0].toUpperCase()}
              </div>
            )}

            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium text-brand-text-primary hidden sm:inline max-w-[120px] truncate">
                {currentUser.displayName || currentUser.email}
              </span>

              {isAdmin && (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 text-[10px] font-bold border border-emerald-200 dark:border-emerald-800/80">
                  <ShieldCheck className="w-3 h-3" />
                  <span>Admin</span>
                </span>
              )}
            </div>

            <button
              onClick={async () => {
                await logoutUser();
                if (onOpenLoginGate) onOpenLoginGate();
              }}
              className="text-[11px] text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400 font-medium px-2 py-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors flex items-center gap-1"
              title="Sign Out to Login Gate"
            >
              <LogOut className="w-3 h-3" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        ) : (
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => {
              if (onOpenLoginGate) {
                onOpenLoginGate();
              } else {
                loginWithGoogle();
              }
            }}
            id="header-login-gate-btn"
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-brand-primary text-white text-xs font-medium hover:bg-brand-primary/90 transition-all shadow-xs min-h-[38px]"
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>Sign In with Google</span>
          </motion.button>
        )}

        <button
          onClick={onToggleTheme}
          aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
          title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
          className="relative p-2.5 rounded-xl text-brand-text-secondary hover:text-brand-primary hover:bg-brand-primary/10 transition-all duration-200 active:scale-90 min-w-[44px] min-h-[44px] flex items-center justify-center group"
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
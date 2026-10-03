import React, { useState, useEffect } from 'react';
import { MenuIcon, MoonIcon, SunIcon } from './icons/MiscIcons';
import { PhssjLogo } from './Logo';
import { View } from '../types';
import { auth } from '../services/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { isUserAdmin } from '../services/adminService';
import { ShieldCheck, LogIn, LogOut, AlertTriangle, Clock } from 'lucide-react';
import { isGoogleTokenExpired, googleSignIn, loginWithGoogle, logoutUser, GOOGLE_TOKEN_EVENT } from '../services/googleAuth';
import { IconButton } from './ui/Touch';
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
  settings: 'School Admin',
  archive: 'Document Archive',
};

const Header: React.FC<HeaderProps> = ({
  theme,
  onToggleTheme,
  onOpenSidebar,
  activeView,
  onOpenLoginGate,
}) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [sheetsMinutesLeft, setSheetsMinutesLeft] = useState<number | null>(null);
  const [sheetsExpired, setSheetsExpired] = useState<boolean>(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!currentUser) {
      setSheetsMinutesLeft(null);
      setSheetsExpired(true);
      return;
    }
    const read = () => {
      const expiry = localStorage.getItem('google_token_expiry');
      const has = !!localStorage.getItem('google_access_token');
      if (!has || !expiry) {
        setSheetsMinutesLeft(null);
        setSheetsExpired(true);
        return;
      }
      const ms = parseInt(expiry, 10) - Date.now();
      if (ms <= 0) {
        setSheetsMinutesLeft(0);
        setSheetsExpired(true);
      } else {
        setSheetsMinutesLeft(Math.ceil(ms / 60000));
        setSheetsExpired(false);
      }
    };
    read();
    const id = setInterval(read, 30000);
    window.addEventListener('storage', read);
    window.addEventListener(GOOGLE_TOKEN_EVENT, read);
    return () => {
      clearInterval(id);
      window.removeEventListener('storage', read);
      window.removeEventListener(GOOGLE_TOKEN_EVENT, read);
    };
  }, [currentUser]);

  const sheetsConnected = !sheetsExpired && (sheetsMinutesLeft ?? 0) > 0;
  const isAdmin = isUserAdmin(currentUser?.email);

  return (
    <header className="h-14 sm:h-16 px-4 sm:px-6 bg-white/80 dark:bg-slate-900/80 backdrop-blur-2xl border-b border-black/[0.06] dark:border-white/[0.08] flex items-center justify-between sticky top-0 z-30 transition-colors">
      {/* Zone 1: Navigation Trigger & Single Wordmark / Breadcrumb */}
      <div className="flex items-center gap-3">
        <IconButton
          onClick={onOpenSidebar}
          aria-label="Open navigation"
          className="md:hidden text-slate-700 dark:text-slate-200"
        >
          <MenuIcon className="w-5 h-5" />
        </IconButton>

        <div className="flex items-center gap-3">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white dark:bg-slate-900 border border-brand-border flex items-center justify-center p-0.5 shrink-0 shadow-sm ring-1 ring-black/5 dark:ring-white/10">
            <PhssjLogo className="w-full h-full rounded-full" />
          </div>

          <div className="leading-tight">
            <div className="flex items-center gap-2">
              <span className="text-sm sm:text-base font-bold tracking-tight text-slate-900 dark:text-white">
                PHSSJ
              </span>
              {activeView && activeView !== 'home' && (
                <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                  {VIEW_LABELS[activeView] || activeView}
                </span>
              )}
            </div>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 hidden md:block">
              Peoples Higher Secondary School Jamshoro
            </p>
          </div>
        </div>
      </div>

      {/* Zone 2: Account & Actions */}
      <div className="flex items-center gap-2 sm:gap-3">
        {currentUser ? (
          <div className="flex items-center gap-2 p-1 pl-2 sm:pl-2.5 rounded-full bg-slate-100/80 dark:bg-slate-800/80 border border-black/[0.06] dark:border-white/[0.08] text-xs">
            {currentUser.photoURL ? (
              <img
                src={currentUser.photoURL}
                alt={currentUser.displayName || 'User'}
                className="w-6 h-6 rounded-full object-cover ring-1 ring-black/10 dark:ring-white/10"
              />
            ) : (
              <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-bold">
                {(currentUser.displayName || currentUser.email || 'U')[0].toUpperCase()}
              </div>
            )}

            <span className="font-medium text-slate-700 dark:text-slate-200 hidden sm:inline max-w-[110px] truncate">
              {currentUser.displayName || currentUser.email}
            </span>

            {isAdmin && (
              <span className="hidden md:inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-500/10">
                <ShieldCheck className="w-3 h-3" />
                <span>Admin</span>
              </span>
            )}

            {/* Sheets Status Indicator */}
            {sheetsConnected ? (
              <span
                title={`Google Sheets connected for ${sheetsMinutesLeft}m`}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-mono tabular-nums font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-500/10"
              >
                <Clock className="w-3 h-3" />
                <span>{sheetsMinutesLeft}m</span>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => googleSignIn()}
                title="Reconnect Google Sheets"
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold text-amber-800 dark:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 active:scale-95 transition-all"
              >
                <AlertTriangle className="w-3 h-3 text-amber-500" />
                <span className="hidden sm:inline">Reconnect</span>
              </button>
            )}

            <button
              onClick={async () => {
                await logoutUser();
                if (onOpenLoginGate) onOpenLoginGate();
              }}
              className="p-1 sm:px-2 py-1 rounded-full text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors flex items-center gap-1 cursor-pointer"
              title="Sign Out"
              aria-label="Sign Out"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden lg:inline text-[11px] font-medium">Sign Out</span>
            </button>
          </div>
        ) : (
          <motion.button
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => {
              if (onOpenLoginGate) {
                onOpenLoginGate();
              } else {
                loginWithGoogle();
              }
            }}
            id="header-login-gate-btn"
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm transition-all cursor-pointer"
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>Sign In</span>
          </motion.button>
        )}

        {/* Apple-style subtle theme switch */}
        <button
          type="button"
          onClick={onToggleTheme}
          aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
          title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
          className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all active:scale-95 cursor-pointer border border-transparent hover:border-black/[0.04] dark:hover:border-white/[0.06]"
        >
          {theme === 'light' ? (
            <MoonIcon className="w-4 h-4" />
          ) : (
            <SunIcon className="w-4 h-4 text-amber-400" />
          )}
        </button>
      </div>
    </header>
  );
};

export default Header;

import React from 'react';
import { MenuIcon, MoonIcon, SunIcon } from './icons/MiscIcons';
import { PhssjLogo } from './Logo';
import { View } from '../types';

type Theme = 'light' | 'dark';

interface HeaderProps {
  theme: Theme;
  onToggleTheme: () => void;
  onOpenSidebar: () => void;
  activeView?: View;
}

const VIEW_LABELS: Record<string, string> = {
  home: 'Home',
  records: 'Student Records',
  lesson: 'Lesson Plans',
  paper: 'Exam Papers',
  live: 'Live Monitor',
  history: 'History Archive',
  results: 'Generation Results',
};

const Header: React.FC<HeaderProps> = ({ theme, onToggleTheme, onOpenSidebar, activeView }) => {
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
          <div className="w-9 h-9 md:w-10 md:h-10 rounded-xl bg-white shadow-soft border border-brand-border flex items-center justify-center overflow-hidden flex-shrink-0 p-0.5">
            <PhssjLogo className="w-full h-full" />
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

      <div className="flex items-center gap-1.5 sm:gap-2">
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
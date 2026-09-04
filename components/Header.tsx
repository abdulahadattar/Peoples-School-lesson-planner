import React from 'react';
import { MenuIcon, MoonIcon, SunIcon } from './icons/MiscIcons';
import { PhssjLogo } from './Logo';

type Theme = 'light' | 'dark';

interface HeaderProps {
  theme: Theme;
  onToggleTheme: () => void;
  onOpenSidebar: () => void;
}

const Header: React.FC<HeaderProps> = ({ theme, onToggleTheme, onOpenSidebar }) => {
  return (
    <header className="h-14 md:h-16 px-4 md:px-6 bg-brand-surface/80 backdrop-blur-xl border-b border-brand-border flex items-center justify-between sticky top-0 z-30">
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenSidebar}
          aria-label="Open navigation"
          className="md:hidden p-2 text-brand-text-secondary hover:text-brand-text-primary hover:bg-brand-bg rounded-xl transition-all duration-200 active:scale-90"
        >
          <MenuIcon className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 md:w-10 md:h-10 rounded-full bg-white shadow-card border border-brand-border flex items-center justify-center overflow-hidden">
            <PhssjLogo className="w-full h-full" />
          </div>
          <div className="leading-tight">
            <h1 className="text-sm md:text-base font-bold text-brand-text-primary tracking-tight">
              PHSSJ Lesson Planner
            </h1>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={onToggleTheme}
          aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
          className="relative p-2.5 rounded-xl text-brand-text-secondary hover:text-brand-primary hover:bg-brand-primary/10 transition-all duration-200 active:scale-90 group"
        >
          <span className="absolute inset-0 rounded-xl group-hover:ring-1 group-hover:ring-brand-primary/20" />
          {theme === 'light' ? <MoonIcon className="w-5 h-5" /> : <SunIcon className="w-5 h-5" />}
        </button>
      </div>
    </header>
  );
};

export default Header;
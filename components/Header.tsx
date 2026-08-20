import React from 'react';
import { AtomIcon, MenuIcon, MoonIcon, SunIcon } from './icons/MiscIcons';

type Theme = 'light' | 'dark';

interface HeaderProps {
    directoryName: string | null;
    theme: Theme;
    onToggleTheme: () => void;
    onOpenSidebar: () => void;
}

const Header: React.FC<HeaderProps> = ({ directoryName, theme, onToggleTheme, onOpenSidebar }) => {
    return (
      <header className="h-14 px-4 md:px-6 bg-brand-surface/80 dark:bg-brand-surface/60 backdrop-blur-xl border-b border-brand-border/60 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-3">
            <button
                onClick={onOpenSidebar}
                className="md:hidden p-2 text-brand-text-medium hover:text-brand-text-light hover:bg-brand-bg/80 rounded-xl transition-all duration-200"
            >
                <MenuIcon className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 bg-gradient-to-br from-brand-primary to-indigo-500 rounded-xl flex items-center justify-center text-white shadow-lg shadow-brand-primary/25">
                    <AtomIcon className="w-5 h-5" />
                </div>
                <h1 className="text-base font-bold text-brand-text-light hidden sm:block tracking-tight">Lesson Plan AI</h1>
            </div>
        </div>

        <div className="flex items-center gap-2">
             <div className="hidden md:flex items-center px-2.5 py-1.5 bg-brand-bg/60 rounded-full border border-brand-border/60 gap-2">
                <div className={`w-1.5 h-1.5 rounded-full ${directoryName ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.4)]' : 'bg-amber-500'}`}></div>
                <span className="text-[11px] font-semibold text-brand-text-medium">
                    {directoryName ? directoryName : 'No Context'}
                </span>
             </div>

             <div className="h-5 w-px bg-brand-border/60 mx-0.5"></div>

             <button
                onClick={onToggleTheme}
                className="p-2 rounded-xl text-brand-text-medium hover:text-brand-primary hover:bg-brand-accent transition-all duration-200"
                title={`Switch to ${theme === 'light' ? 'Dark' : 'Light'} Mode`}
             >
                {theme === 'light' ? <MoonIcon className="w-[18px] h-[18px]" /> : <SunIcon className="w-[18px] h-[18px]" />}
             </button>

             <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 p-[1.5px] cursor-pointer hover:scale-105 transition-transform duration-200 shadow-md">
                 <div className="w-full h-full bg-brand-surface rounded-full flex items-center justify-center">
                     <span className="text-[10px] font-bold text-transparent bg-clip-text bg-gradient-to-r from-indigo-500 to-pink-500">AA</span>
                 </div>
             </div>
        </div>
      </header>
    );
};

export default Header;

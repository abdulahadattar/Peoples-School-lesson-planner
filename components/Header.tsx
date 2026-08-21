
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
      <header className="h-16 px-4 md:px-6 bg-brand-surface/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-brand-border/60 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-4">
            <button 
                onClick={onOpenSidebar}
                className="md:hidden p-2 text-brand-text-medium hover:text-brand-text-light hover:bg-brand-bg rounded-xl transition-colors"
            >
                <MenuIcon className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-brand-primary rounded-xl flex items-center justify-center text-white shadow-sm shadow-brand-primary/20">
                    <AtomIcon className="w-5 h-5" />
                </div>
                <h1 className="text-lg font-bold text-brand-text-light hidden sm:block tracking-tight">Lesson Plan AI</h1>
            </div>
        </div>

        <div className="flex items-center gap-3">
             <div className="hidden md:flex items-center px-3 py-1.5 bg-brand-bg rounded-full border border-brand-border/60 gap-2">
                 <div className={`w-1.5 h-1.5 rounded-full ${directoryName ? 'bg-emerald-500' : 'bg-amber-500'}`}></div>
                 <span className="text-xs font-medium text-brand-text-medium">
                     {directoryName ? directoryName : 'No Context'}
                 </span>
             </div>
              
             <div className="h-5 w-px bg-brand-border/60 mx-0.5"></div>

             <button 
                onClick={onToggleTheme}
                className="p-2 rounded-xl text-brand-text-medium hover:text-brand-primary hover:bg-brand-primary/10 transition-all"
                title={`Switch to ${theme === 'light' ? 'Dark' : 'Light'} Mode`}
             >
                {theme === 'light' ? <MoonIcon className="w-5 h-5" /> : <SunIcon className="w-5 h-5" />}
            </button>
              
             <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 p-[2px] cursor-pointer hover:scale-105 transition-transform shadow-sm">
                  <div className="w-full h-full bg-brand-surface rounded-full flex items-center justify-center">
                      <span className="text-[10px] font-bold text-transparent bg-clip-text bg-gradient-to-r from-indigo-500 to-purple-600">AA</span>
                  </div>
             </div>
        </div>
      </header>
    );
};

export default Header;
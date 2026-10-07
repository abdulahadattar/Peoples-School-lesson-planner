import React from 'react';
import { motion } from 'motion/react';
import { View } from '../../types';
import { SchoolConfig } from '../../services/schoolConfigService';
import { PhssjLogo, ZiauddinLogo } from '../Logo';
import {
  BookOpenIcon,
  CloseIcon,
  DocumentTextIcon,
  HomeIcon,
  PulseIcon,
  ArchiveIcon,
  SpreadsheetIcon,
  UserGroupIcon,
  FolderArchiveIcon,
} from '../icons/MiscIcons';
import { Settings as SettingsIcon } from 'lucide-react';
import versionConfig from '../../version.json';

export interface NavItem {
  view: View;
  label: string;
  icon: React.FC<React.SVGProps<SVGSVGElement>>;
  activeViews: View[];
}

export interface NavSection {
  title?: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    items: [
      { view: 'home', label: 'Home', icon: HomeIcon, activeViews: ['home'] },
    ],
  },
  {
    title: 'Academics',
    items: [
      { view: 'lesson', label: 'Lesson Plans', icon: BookOpenIcon, activeViews: ['lesson', 'results'] },
      { view: 'paper', label: 'Exam Papers', icon: DocumentTextIcon, activeViews: ['paper'] },
      { view: 'history', label: 'History Archive', icon: ArchiveIcon, activeViews: ['history'] },
    ],
  },
  {
    title: 'Students & Records',
    items: [
      { view: 'attendance', label: 'Daily Attendance', icon: UserGroupIcon, activeViews: ['attendance'] },
      { view: 'records', label: 'Student Records', icon: SpreadsheetIcon, activeViews: ['records'] },
      { view: 'archive', label: 'Document Archive', icon: FolderArchiveIcon, activeViews: ['archive'] },
    ],
  },
  {
    title: 'Operations & Admin',
    items: [
      { view: 'live', label: 'Live Monitor', icon: PulseIcon, activeViews: ['live'] },
      { view: 'settings', label: 'School Admin', icon: SettingsIcon, activeViews: ['settings'] },
    ],
  },
];

export interface AppSidebarProps {
  currentView: View;
  isSidebarOpen: boolean;
  schoolConfig?: SchoolConfig | null;
  onCloseSidebar: () => void;
  onNavigate: (view: View) => void;
  onNavigateLesson: () => void;
  onNavigatePaper: () => void;
  onBackToHome: () => void;
}

export const AppSidebar: React.FC<AppSidebarProps> = ({
  currentView,
  isSidebarOpen,
  schoolConfig,
  onCloseSidebar,
  onNavigate,
  onNavigateLesson,
  onNavigatePaper,
  onBackToHome,
}) => {
  return (
    <>
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-slate-900/40 dark:bg-black/60 z-40 md:hidden backdrop-blur-sm animate-fadeIn"
          onClick={onCloseSidebar}
        />
      )}

      <aside className={`fixed md:relative z-50 md:z-10 top-0 left-0 h-[100dvh] md:h-full bg-white/90 dark:bg-slate-900/90 backdrop-blur-2xl flex flex-col transition-transform duration-300 md:transition-none w-[270px] ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'} border-r border-black/[0.06] dark:border-white/[0.08]`}>
        <div className="p-5 flex-grow flex flex-col h-full overflow-hidden">
          <div className="flex items-center justify-between mb-6 md:hidden">
            <span className="font-semibold text-sm text-slate-900 dark:text-white">Navigation</span>
            <button
              type="button"
              onClick={onCloseSidebar}
              className="p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors active:scale-95 cursor-pointer"
            >
              <CloseIcon className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-3 mb-6 px-1">
            <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 border border-black/[0.06] dark:border-white/[0.08] flex items-center justify-center shrink-0 p-1">
              <PhssjLogo className="w-full h-full object-contain" />
            </div>
            <div className="leading-tight truncate">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white tracking-tight">PHSSJ Portal</h3>
              <p className="text-[11px] text-slate-500 truncate">{schoolConfig?.schoolName || 'Peoples Higher Secondary School'}</p>
            </div>
          </div>

          <nav className="flex-1 overflow-y-auto space-y-4 pr-1 -mr-1 custom-scrollbar">
            {NAV_SECTIONS.map((section, sIdx) => (
              <div key={section.title || `section-${sIdx}`} className="space-y-1">
                {section.title && (
                  <div className="px-2.5 pt-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    {section.title}
                  </div>
                )}
                <div className="space-y-0.5">
                  {section.items.map(item => {
                    const isActive = item.activeViews.includes(currentView);
                    return (
                      <button
                        key={item.view}
                        id={`nav-${item.view}`}
                        type="button"
                        onClick={() => {
                          if (item.view === 'home') onBackToHome();
                          else if (item.view === 'lesson') onNavigateLesson();
                          else if (item.view === 'paper') onNavigatePaper();
                          else onNavigate(item.view);
                          onCloseSidebar();
                        }}
                        className={`relative w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs sm:text-sm font-medium transition-colors group select-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 ${
                          isActive
                            ? 'text-blue-600 dark:text-white font-semibold'
                            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100/80 dark:hover:bg-slate-800/80 hover:text-slate-900 dark:hover:text-slate-100'
                        }`}
                      >
                        {isActive && (
                          <motion.span
                            layoutId="activeNavPill"
                            className="absolute inset-0 bg-blue-500/10 dark:bg-blue-500/20 rounded-xl border border-blue-500/20 dark:border-blue-500/30"
                            transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                          />
                        )}
                        <item.icon className="relative z-10 w-4 h-4 transition-transform group-hover:scale-105 shrink-0" />
                        <span className="relative z-10 truncate">{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          <div className="mt-auto pt-4 border-t border-black/[0.04] dark:border-white/[0.06] space-y-3">
            <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-black/[0.04] dark:border-white/[0.06]">
              <div className="shrink-0 bg-white rounded-md p-1 border border-slate-200/80 flex items-center justify-center">
                <ZiauddinLogo className="h-5 w-auto" />
              </div>
              <p className="text-[10px] leading-snug text-slate-500 dark:text-slate-400">
                Affiliated with
                <br />
                <span className="font-semibold text-slate-800 dark:text-slate-200">Ziauddin University</span>
              </p>
            </div>
            <div className="px-3 text-[10px] text-slate-500 dark:text-slate-400 flex items-start gap-2">
              <div
                className={`mt-1 w-2 h-2 rounded-full ${
                  versionConfig.environment === 'testing'
                    ? 'bg-yellow-400 animate-pulse'
                    : versionConfig.environment === 'partial-public'
                    ? 'bg-blue-400'
                    : 'bg-green-400'
                }`}
              />
              <div>
                <p className="font-semibold text-slate-700 dark:text-slate-300">v{versionConfig.version} ({versionConfig.branch})</p>
                <p>Built: {new Date(versionConfig.buildDate).toLocaleString('en-PK', {
                  timeZone: 'Asia/Karachi',
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: true,
                })}</p>
              </div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};

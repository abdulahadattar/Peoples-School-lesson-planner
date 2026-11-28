import React from 'react';
import { motion } from 'motion/react';
import { View } from '../../types';
import { SchoolConfig } from '../../services/schoolConfigService';
import { PhssjLogo, ZiauddinLogo } from '../Logo';
import {
  Activity,
  Archive,
  Award,
  BookOpen,
  FileSpreadsheet,
  FileText,
  FolderArchive,
  Home,
  Settings,
  Users,
  X,
} from 'lucide-react';
import versionConfig from '../../version.json';

export interface NavItem {
  view: View;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  activeViews: View[];
}

export interface NavSection {
  title?: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    items: [
      { view: 'home', label: 'Home', icon: Home, activeViews: ['home'] },
    ],
  },
  {
    title: 'Academics',
    items: [
      { view: 'lesson', label: 'Lesson Plans', icon: BookOpen, activeViews: ['lesson', 'results'] },
      { view: 'paper', label: 'Exams & Papers', icon: FileText, activeViews: ['paper', 'omr-scanner'] },
      { view: 'history', label: 'History Archive', icon: Archive, activeViews: ['history'] },
    ],
  },
  {
    title: 'Students & Records',
    items: [
      { view: 'attendance', label: 'Daily Attendance', icon: Users, activeViews: ['attendance'] },
      { view: 'records', label: 'Student Records', icon: FileSpreadsheet, activeViews: ['records'] },
      { view: 'marksheets', label: 'Marksheets', icon: Award, activeViews: ['marksheets'] },
      { view: 'archive', label: 'Student Documents', icon: FolderArchive, activeViews: ['archive'] },
    ],
  },
  {
    title: 'Operations & Admin',
    items: [
      { view: 'live', label: 'Live Monitor', icon: Activity, activeViews: ['live'] },
      { view: 'settings', label: 'School Admin', icon: Settings, activeViews: ['settings'] },
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
  onNavigatePath?: (path: string) => void;
  onPrefetchView?: (view: View) => void;
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
  onNavigatePath,
  onPrefetchView,
}) => {
  return (
    <>
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-slate-900/40 dark:bg-black/60 z-40 md:hidden backdrop-blur-sm animate-fadeIn"
          onClick={onCloseSidebar}
        />
      )}

      <aside className={`fixed md:relative z-50 md:z-10 top-0 left-0 h-[100dvh] md:h-full bg-white dark:bg-slate-900 flex flex-col transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] md:transition-none w-[270px] shrink-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'} border-r border-black/[0.06] dark:border-white/[0.08] print:hidden`}>
        <div className="p-5 flex-grow flex flex-col h-full overflow-hidden">
          <div className="flex items-center justify-between mb-6 md:hidden">
            <span className="font-semibold text-sm text-slate-900 dark:text-white">Navigation</span>
            <button
              type="button"
              onClick={onCloseSidebar}
              aria-label="Close navigation"
              className="p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors active:scale-95 cursor-pointer"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>

          <div className="flex items-center gap-3 mb-6 px-1">
            <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 border border-black/[0.06] dark:border-white/[0.08] flex items-center justify-center shrink-0 p-1">
              <PhssjLogo
                className="w-full h-full object-contain"
                alt={schoolConfig?.schoolName || 'PHSSJ'}
                src={schoolConfig?.schoolLogoUrl}
              />
            </div>
            <div className="leading-tight truncate">
              <p className="text-sm font-bold text-slate-900 dark:text-white tracking-tight">PHSSJ Portal</p>
              <p className="text-[11px] text-slate-600 dark:text-slate-300 truncate">{schoolConfig?.schoolName || 'Peoples Higher Secondary School Jamshoro'}</p>
            </div>
          </div>

          <nav className="flex-1 overflow-y-auto space-y-4 pr-1 -mr-1 custom-scrollbar">
            {NAV_SECTIONS.map((section, sIdx) => (
              <div key={section.title || `section-${sIdx}`} className="space-y-1">
                {section.title && (
                  <div className="px-2.5 pt-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
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
                        onMouseEnter={() => onPrefetchView?.(item.view)}
                        onFocus={() => onPrefetchView?.(item.view)}
                        onClick={() => {
                          if (item.view === 'home') onBackToHome();
                          else if (item.view === 'lesson') onNavigateLesson();
                          else if (item.view === 'paper') onNavigatePaper();
                          else onNavigate(item.view);
                          onCloseSidebar();
                        }}
                        className={`relative w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs sm:text-sm font-medium transition-colors group select-none cursor-pointer outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 ${
                          isActive
                            ? 'text-blue-700 dark:text-white font-semibold'
                            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100/80 dark:hover:bg-slate-800/80 hover:text-slate-900 dark:hover:text-slate-100'
                        }`}
                      >
                        {isActive && (
                          <motion.span
                            layoutId="activeNavPill"
                            className="absolute inset-0 bg-blue-50/90 dark:bg-blue-500/20 rounded-xl border border-blue-500/25 dark:border-blue-400/30 shadow-2xs"
                            transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                          >
                            <span
                              aria-hidden="true"
                              className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-4 rounded-r-full bg-blue-600 dark:bg-blue-400"
                            />
                          </motion.span>
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
                <ZiauddinLogo
                  className="h-5 w-auto"
                  alt={(schoolConfig?.affiliation || '').replace(/^Affiliated with\s+/i, '').trim() || 'Ziauddin University'}
                  src={schoolConfig?.affiliationLogoUrl}
                />
              </div>
              <p className="text-[10px] leading-snug text-slate-600 dark:text-slate-300 min-w-0">
                Affiliated with
                <br />
                <span className="font-semibold text-slate-800 dark:text-slate-100 block truncate">
                  {(schoolConfig?.affiliation || '').replace(/^Affiliated with\s+/i, '').trim() || 'Ziauddin University'}
                </span>
              </p>
            </div>
            <div className="px-3 text-[10px] text-slate-600 dark:text-slate-300 space-y-1.5 tabular-nums">
              <p className="font-semibold text-slate-700 dark:text-slate-200">
                v{versionConfig.version} · {versionConfig.branch}
              </p>
              <div className="flex items-center gap-2 text-[11px] font-medium">
                <a
                  href="/privacy"
                  onClick={(e) => {
                    if (onNavigatePath && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
                      e.preventDefault();
                      onNavigatePath('/privacy');
                      onCloseSidebar();
                    }
                  }}
                  className="text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Privacy Policy
                </a>
                <span className="text-slate-400">&bull;</span>
                <a
                  href="/terms"
                  onClick={(e) => {
                    if (onNavigatePath && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
                      e.preventDefault();
                      onNavigatePath('/terms');
                      onCloseSidebar();
                    }
                  }}
                  className="text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Terms of Service
                </a>
              </div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};

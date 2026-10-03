import React from 'react';
import {
  BookOpenIcon,
  DocumentTextIcon,
  UserGroupIcon,
  SpreadsheetIcon,
  FolderArchiveIcon,
  PulseIcon,
  ArchiveIcon,
} from './icons/MiscIcons';
import { Settings as SettingsIcon, ArrowRight } from 'lucide-react';
import { PhssjLogo, ZiauddinLogo } from './Logo';
import { View } from '../types';
import { motion } from 'motion/react';

interface HomeViewProps {
  onNavigate?: (view: View) => void;
}

interface FeatureSection {
  title: string;
  items: {
    view: View;
    title: string;
    description: string;
    icon: React.FC<React.SVGProps<SVGSVGElement>>;
    accentColor: string;
    tag?: string;
  }[];
}

const FEATURE_SECTIONS: FeatureSection[] = [
  {
    title: 'Academics & Generation',
    items: [
      {
        view: 'lesson' as View,
        title: 'Lesson Plans',
        description: 'SLO-aligned curriculum plans by topic, single SLO, or full chapter.',
        icon: BookOpenIcon,
        accentColor: 'text-blue-600 dark:text-blue-400 bg-blue-500/10 dark:bg-blue-500/15',
      },
      {
        view: 'paper' as View,
        title: 'Exam Papers',
        description: 'Mark-balanced examination papers with MCQs, short, and long questions.',
        icon: DocumentTextIcon,
        accentColor: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 dark:bg-emerald-500/15',
      },
      {
        view: 'history' as View,
        title: 'History Archive',
        description: 'Instant local access to all saved lesson plans and examination papers.',
        icon: ArchiveIcon,
        accentColor: 'text-amber-600 dark:text-amber-400 bg-amber-500/10 dark:bg-amber-500/15',
      },
    ],
  },
  {
    title: 'Students & Records',
    items: [
      {
        view: 'attendance' as View,
        title: 'Daily Attendance',
        description: 'Mark class attendance, monitor absentees, and sync offline-first.',
        icon: UserGroupIcon,
        accentColor: 'text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 dark:bg-indigo-500/15',
      },
      {
        view: 'records' as View,
        title: 'Student Records',
        description: 'Central register with GR profiles, phone lookup, and cohort analytics.',
        icon: SpreadsheetIcon,
        accentColor: 'text-teal-600 dark:text-teal-400 bg-teal-500/10 dark:bg-teal-500/15',
      },
      {
        view: 'archive' as View,
        title: 'Document Archive',
        description: 'OCR verification, B-Form & CNIC audit, and discrepancy detection.',
        icon: FolderArchiveIcon,
        accentColor: 'text-purple-600 dark:text-purple-400 bg-purple-500/10 dark:bg-purple-500/15',
      },
    ],
  },
  {
    title: 'Operations & Administration',
    items: [
      {
        view: 'live' as View,
        title: 'Live Monitor',
        description: 'Real-time class periods, break duty supervision, and teacher substitutions.',
        icon: PulseIcon,
        accentColor: 'text-rose-600 dark:text-rose-400 bg-rose-500/10 dark:bg-rose-500/15',
      },
      {
        view: 'settings' as View,
        title: 'School Admin',
        description: 'Timetable matrix, teacher subject allocations, and bell schedule rules.',
        icon: SettingsIcon as any,
        accentColor: 'text-slate-700 dark:text-slate-300 bg-slate-500/10 dark:bg-slate-500/15',
      },
    ],
  },
];

const HomeView: React.FC<HomeViewProps> = ({ onNavigate }) => {
  return (
    <div className="relative min-h-full w-full flex flex-col justify-between py-6 px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto">
      {/* Subtle Apple-style architectural grid backdrop */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-[0.03] dark:opacity-[0.05]" aria-hidden="true">
        <div
          className="w-full h-full"
          style={{
            backgroundImage: `linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)`,
            backgroundSize: '48px 48px',
          }}
        />
      </div>

      <div className="relative z-10 w-full">
        {/* Header Hero Section */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className="text-center pt-4 pb-8 sm:pb-10"
        >
          <div className="relative mx-auto mb-4 w-fit">
            <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-white dark:bg-slate-900 shadow-md border-2 border-slate-200/80 dark:border-white/10 flex items-center justify-center p-1 ring-4 ring-blue-500/10">
              <PhssjLogo className="w-full h-full rounded-full" />
            </div>
          </div>

          <h1
            className="text-2xl sm:text-3xl font-bold tracking-tight text-brand-text-primary text-balance"
            style={{ textWrap: 'balance' }}
          >
            Peoples Higher Secondary School Jamshoro
          </h1>
          <p className="text-xs sm:text-sm text-brand-text-secondary mt-1.5 max-w-xl mx-auto leading-relaxed">
            Unified institutional workspace for curriculum generation, examination synthesis, and real-time school operations.
          </p>
        </motion.div>

        {/* Feature Grid by Categories */}
        <div className="space-y-7">
          {FEATURE_SECTIONS.map((section, sIdx) => (
            <div key={section.title} className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <span className="text-[11px] font-semibold tracking-wider uppercase text-brand-text-tertiary">
                  {section.title}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {section.items.map((feature, i) => (
                  <motion.button
                    key={feature.view}
                    type="button"
                    onClick={() => onNavigate?.(feature.view)}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      duration: 0.3,
                      delay: 0.03 * (sIdx * 3 + i),
                      ease: [0.16, 1, 0.3, 1],
                    }}
                    whileHover={{ y: -2 }}
                    whileTap={{ scale: 0.985 }}
                    className="group relative flex flex-col justify-between p-5 rounded-2xl bg-white dark:bg-brand-surface border border-brand-border/80 dark:border-white/[0.08] shadow-soft hover:shadow-card-hover transition-all duration-200 text-left cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-3.5">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-105 ${feature.accentColor}`}>
                          <feature.icon className="w-5 h-5" />
                        </div>
                        <span className="w-7 h-7 rounded-full flex items-center justify-center text-slate-400 group-hover:text-brand-primary group-hover:bg-brand-primary/10 transition-colors">
                          <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                        </span>
                      </div>

                      <h3 className="text-sm sm:text-base font-semibold text-brand-text-primary tracking-tight mb-1">
                        {feature.title}
                      </h3>
                      <p className="text-xs text-brand-text-secondary leading-relaxed line-clamp-2">
                        {feature.description}
                      </p>
                    </div>
                  </motion.button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer Affiliation Strip */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.3 }}
        className="relative z-10 flex items-center justify-center gap-2 pt-8 pb-2 text-xs text-brand-text-secondary"
      >
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white dark:bg-brand-surface border border-brand-border/80 dark:border-white/[0.08] shadow-xs">
          <span className="text-[11px]">Affiliated with</span>
          <div className="h-4 flex items-center">
            <ZiauddinLogo className="h-4 w-auto" />
          </div>
          <span className="font-semibold text-brand-text-primary text-[11px]">Ziauddin University</span>
        </div>
      </motion.div>
    </div>
  );
};

export default HomeView;

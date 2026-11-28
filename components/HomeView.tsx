import React from 'react';
import {
  Activity,
  Archive,
  ArrowRight,
  Award,
  BookOpen,
  FileSpreadsheet,
  FileText,
  FolderArchive,
  Settings,
  Users,
} from 'lucide-react';
import { PhssjLogo, ZiauddinLogo } from './Logo';
import { View } from '../types';

interface HomeViewProps {
  onNavigate?: (view: View) => void;
  onPrefetchView?: (view: View) => void;
}

interface FeatureItem {
  view: View;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  accentColor: string;
}

interface FeatureSection {
  title: string;
  columnsClass: string;
  items: FeatureItem[];
}

const FEATURE_SECTIONS: FeatureSection[] = [
  {
    title: 'Academics',
    columnsClass: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
    items: [
      {
        view: 'lesson',
        title: 'Lesson Plans',
        description: 'Lesson plans by topic, SLO, or chapter.',
        icon: BookOpen,
        accentColor: 'text-blue-600 dark:text-blue-400 bg-blue-500/10 dark:bg-blue-500/15',
      },
      {
        view: 'paper',
        title: 'Exams & Papers',
        description: 'MCQ papers, OMR sheets, and grading.',
        icon: FileText,
        accentColor: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 dark:bg-emerald-500/15',
      },
      {
        view: 'history',
        title: 'History Archive',
        description: 'Saved lesson plans and test papers.',
        icon: Archive,
        accentColor: 'text-amber-600 dark:text-amber-400 bg-amber-500/10 dark:bg-amber-500/15',
      },
    ],
  },
  {
    title: 'Students & Records',
    columnsClass: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
    items: [
      {
        view: 'attendance',
        title: 'Daily Attendance',
        description: 'Class attendance and register export.',
        icon: Users,
        accentColor: 'text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 dark:bg-indigo-500/15',
      },
      {
        view: 'records',
        title: 'Student Records',
        description: 'Central student register and profiles.',
        icon: FileSpreadsheet,
        accentColor: 'text-teal-600 dark:text-teal-400 bg-teal-500/10 dark:bg-teal-500/15',
      },
      {
        view: 'marksheets',
        title: 'Marksheets',
        description: 'Exam marksheets and printable result cards.',
        icon: Award,
        accentColor: 'text-sky-600 dark:text-sky-400 bg-sky-500/10 dark:bg-sky-500/15',
      },
      {
        view: 'archive',
        title: 'Student Documents',
        description: 'B-Forms, CNICs, and student folders.',
        icon: FolderArchive,
        accentColor: 'text-purple-600 dark:text-purple-400 bg-purple-500/10 dark:bg-purple-500/15',
      },
    ],
  },
  {
    title: 'School Operations',
    columnsClass: 'grid-cols-1 sm:grid-cols-2',
    items: [
      {
        view: 'live',
        title: 'Live Monitor',
        description: 'Current periods, duties, and substitutions.',
        icon: Activity,
        accentColor: 'text-rose-600 dark:text-rose-400 bg-rose-500/10 dark:bg-rose-500/15',
      },
      {
        view: 'settings',
        title: 'School Admin',
        description: 'Classes, teachers, timetable, and bell timings.',
        icon: Settings,
        accentColor: 'text-slate-700 dark:text-slate-300 bg-slate-500/10 dark:bg-slate-500/15',
      },
    ],
  },
];

const HomeView: React.FC<HomeViewProps> = ({ onNavigate, onPrefetchView }) => {
  return (
    <div className="relative min-h-full w-full flex flex-col justify-between py-6 px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto">
      <div className="relative z-10 w-full">
        {/* Hero */}
        <div className="text-center pt-3 pb-7 sm:pb-9">
          <div className="mx-auto mb-3.5 w-fit">
            <div className="w-18 h-18 sm:w-22 sm:h-22 rounded-full bg-white dark:bg-slate-900 shadow-md border-2 border-slate-200/80 dark:border-white/10 flex items-center justify-center p-1 ring-4 ring-blue-500/10">
              <PhssjLogo className="w-full h-full rounded-full" />
            </div>
          </div>

          <h1
            className="text-2xl sm:text-3xl font-bold tracking-tight text-brand-text-primary text-balance"
            style={{ textWrap: 'balance' }}
          >
            Peoples Higher Secondary School Jamshoro
          </h1>
        </div>

        {/* Feature Grid by Categories */}
        <div className="space-y-6">
          {FEATURE_SECTIONS.map((section, sIdx) => (
            <div
              key={section.title}
              className="space-y-2.5 animate-softSettle"
              style={{ animationDelay: `${sIdx * 45}ms` }}
            >
              <div className="px-1">
                <h2 className="text-[11px] font-semibold tracking-wider uppercase text-slate-600 dark:text-slate-300">
                  {section.title}
                </h2>
              </div>

              <div className={`grid ${section.columnsClass} gap-3.5`}>
                {section.items.map((feature) => (
                  <button
                    key={feature.view}
                    type="button"
                    onMouseEnter={() => onPrefetchView?.(feature.view)}
                    onFocus={() => onPrefetchView?.(feature.view)}
                    onClick={() => onNavigate?.(feature.view)}
                    className="group relative flex flex-col justify-between p-4 sm:p-5 rounded-2xl bg-white dark:bg-brand-surface border border-brand-border/80 dark:border-white/[0.08] shadow-soft hover:shadow-card-hover hover:-translate-y-0.5 active:scale-[0.985] transition-[box-shadow,transform] duration-200 text-left cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <div
                          className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-105 ${feature.accentColor}`}
                        >
                          <feature.icon className="w-5 h-5" aria-hidden="true" />
                        </div>
                        <span className="w-7 h-7 rounded-full flex items-center justify-center text-slate-600 dark:text-slate-300 group-hover:text-brand-primary group-hover:bg-brand-primary/10 transition-colors">
                          <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                        </span>
                      </div>

                      <h3 className="text-sm sm:text-base font-semibold text-brand-text-primary tracking-tight mb-1">
                        {feature.title}
                      </h3>
                      <p className="text-xs text-brand-text-secondary leading-relaxed line-clamp-2">
                        {feature.description}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer Affiliation Strip */}
      <div className="relative z-10 flex items-center justify-center gap-2 pt-8 pb-2 text-xs text-brand-text-secondary">
        <span className="text-[11px]">Affiliated with</span>
        <div className="h-4 flex items-center">
          <ZiauddinLogo className="h-4 w-auto" />
        </div>
        <span className="font-semibold text-brand-text-primary text-[11px]">
          Ziauddin University
        </span>
      </div>
    </div>
  );
};

export default HomeView;

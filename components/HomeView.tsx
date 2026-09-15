import React from 'react';
import { BookOpenIcon, DocumentTextIcon, PulseIcon, ArchiveIcon, SpreadsheetIcon, UserGroupIcon } from './icons/MiscIcons';
import { PhssjLogo, ZiauddinLogo } from './Logo';
import { View } from '../types';

interface HomeViewProps {
  onNavigate?: (view: View) => void;
}

/** Feature cards data — one source instead of copy-pasted markup. */
const FEATURES = [
  {
    view: 'records' as View,
    title: 'Student Records',
    description: 'Live Google Sheets register, GR# profiles, search, filters, and two-way sync.',
    icon: SpreadsheetIcon,
    accent: 'text-emerald-600 bg-emerald-500/10 group-hover:bg-emerald-600 group-hover:text-white',
  },
  {
    view: 'attendance' as View,
    title: 'Daily Attendance',
    description: 'Mark daily attendance directly onto Google Sheets with an intuitive interface.',
    icon: UserGroupIcon,
    accent: 'text-amber-600 bg-amber-500/10 group-hover:bg-amber-600 group-hover:text-white',
  },
  {
    view: 'lesson' as View,
    title: 'Lesson Plans',
    description: 'Generate curriculum-aligned lesson plans for any topic, SLO or whole chapter.',
    icon: BookOpenIcon,
    accent: 'text-brand-primary bg-brand-primary/10 group-hover:bg-brand-primary group-hover:text-white',
  },
  {
    view: 'paper' as View,
    title: 'Exam Papers',
    description: 'Create structured, mark-balanced assessments with MCQs, short and long questions.',
    icon: DocumentTextIcon,
    accent: 'text-brand-accent bg-brand-accent/10 group-hover:bg-brand-accent group-hover:text-white',
  },
];

const HomeView: React.FC<HomeViewProps> = ({ onNavigate }) => {
  return (
    <div className="min-h-full flex flex-col items-center justify-center px-4 py-10 md:py-16 relative overflow-hidden">
      {/* Animated background: drifting gradient orbs + dot grid */}
      <div className="absolute inset-0 bg-brand-bg transition-colors duration-500" />
      <div className="absolute -top-32 -left-24 w-[28rem] h-[28rem] rounded-full bg-brand-primary/15 dark:bg-brand-primary/10 blur-3xl animate-drift" />
      <div
        className="absolute -bottom-40 -right-24 w-[30rem] h-[30rem] rounded-full bg-brand-accent/15 dark:bg-brand-accent/10 blur-3xl animate-drift"
        style={{ animationDelay: '-8s' }}
      />
      <div
        className="absolute inset-0 opacity-[0.025] dark:opacity-[0.04]"
        style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)`,
          backgroundSize: '32px 32px',
        }}
      />

      <div className="w-full max-w-3xl relative z-10">
        {/* Hero */}
        <div className="text-center mb-10 md:mb-12 animate-fadeInUp">
          <div className="relative mx-auto mb-6 w-fit animate-floatSlow">
            <div className="absolute inset-0 rounded-full bg-brand-primary/20 blur-2xl scale-125" />
            <div className="relative w-24 h-24 md:w-28 md:h-28 rounded-full bg-white dark:bg-slate-900 shadow-glass border-2 border-brand-border dark:border-blue-500/30 flex items-center justify-center p-1.5 ring-4 ring-brand-primary/10">
              <PhssjLogo className="w-full h-full rounded-full drop-shadow-sm" />
            </div>
          </div>

          <h1 className="text-3xl md:text-4xl font-extrabold text-brand-text-primary tracking-tight mb-2 animate-fadeInUp" style={{ animationDelay: '80ms' }}>
            Lesson Planner
          </h1>
          <p className="text-sm md:text-base text-brand-text-secondary font-normal max-w-sm mx-auto leading-relaxed animate-fadeInUp" style={{ animationDelay: '160ms' }}>
            Craft beautiful lesson plans and exam papers aligned with your curriculum — in seconds.
          </p>
        </div>

        {/* Feature cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-4">
          {FEATURES.map((feature, i) => (
            <button
              key={feature.view}
              onClick={() => onNavigate?.(feature.view)}
              className="group flex-1 relative overflow-hidden rounded-2xl glass-card p-5 text-left transition-all duration-300 hover:-translate-y-1 hover:shadow-glass active:scale-[0.98] animate-fadeInUp"
              style={{ animationDelay: `${240 + i * 100}ms` }}
            >
              <div className="absolute inset-x-0 top-0 h-1 brand-gradient opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <div className="relative z-10">
                <div className={`w-11 h-11 mb-4 rounded-xl flex items-center justify-center transition-all duration-300 group-hover:scale-110 ${feature.accent}`}>
                  <feature.icon className="w-5 h-5" />
                </div>
                <h2 className="text-base font-bold text-brand-text-primary mb-1">{feature.title}</h2>
                <p className="text-xs text-brand-text-secondary leading-relaxed">{feature.description}</p>
              </div>
            </button>
          ))}
        </div>

        {/* Quick Utilities */}
        <div className="flex flex-wrap items-center justify-center gap-2.5 mb-8 animate-fadeInUp" style={{ animationDelay: '400ms' }}>
          <button
            type="button"
            onClick={() => onNavigate?.('records')}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-brand-primary/10 text-brand-primary border border-brand-primary/30 hover:bg-brand-primary hover:text-white shadow-soft transition-all"
          >
            <SpreadsheetIcon className="w-4 h-4" />
            <span>Student Records (Google Sheets)</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate?.('live')}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-white dark:bg-brand-surface border border-brand-border text-brand-text-primary hover:border-brand-primary/40 hover:text-brand-primary shadow-soft transition-all"
          >
            <PulseIcon className="w-4 h-4 text-emerald-500" />
            <span>Live Monitor</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate?.('history')}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-white dark:bg-brand-surface border border-brand-border text-brand-text-primary hover:border-brand-primary/40 hover:text-brand-primary shadow-soft transition-all"
          >
            <ArchiveIcon className="w-4 h-4 text-brand-accent" />
            <span>History Archive</span>
          </button>
        </div>

        {/* Affiliation strip */}
        <div className="flex flex-col items-center gap-3 animate-fadeInUp" style={{ animationDelay: '460ms' }}>
          <div className="flex items-center gap-3 w-full justify-center">
            <span className="h-px flex-1 max-w-[80px] bg-brand-border" />
            <p className="text-[10px] font-semibold text-brand-text-tertiary tracking-[0.18em] uppercase">
              Peoples Higher Secondary School Jamshoro
            </p>
            <span className="h-px flex-1 max-w-[80px] bg-brand-border" />
          </div>
          <div className="flex items-center gap-2.5 px-4 py-2 rounded-full bg-white dark:bg-brand-surface shadow-card border border-brand-border">
            <span className="text-[10px] text-brand-text-secondary font-medium">Affiliated with</span>
            <div className="bg-white rounded-md px-1.5 py-0.5 border border-slate-200 dark:border-brand-border/60 flex items-center">
              <ZiauddinLogo className="h-5 w-auto" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HomeView;
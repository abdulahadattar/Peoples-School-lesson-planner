import React from 'react';
import { BookOpenIcon, DocumentTextIcon, UserGroupIcon, SpreadsheetIcon } from './icons/MiscIcons';
import { PhssjLogo, ZiauddinLogo } from './Logo';
import { View } from '../types';
import { motion } from 'motion/react';

interface HomeViewProps {
  onNavigate?: (view: View) => void;
}

/** Feature cards data */
const FEATURES = [
  {
    view: 'records' as View,
    title: 'Student Records',
    description: 'Google Sheets register, GR# profiles and search.',
    icon: SpreadsheetIcon,
    accent: 'text-emerald-600 bg-emerald-500/10 dark:bg-emerald-950/40 dark:text-emerald-300 group-hover:bg-emerald-600 group-hover:text-white',
  },
  {
    view: 'attendance' as View,
    title: 'Daily Attendance',
    description: 'Mark daily attendance and track absentees.',
    icon: UserGroupIcon,
    accent: 'text-blue-600 bg-blue-500/10 dark:bg-blue-950/40 dark:text-blue-300 group-hover:bg-blue-600 group-hover:text-white',
  },
  {
    view: 'lesson' as View,
    title: 'Lesson Plans',
    description: 'Lesson plans by topic, SLO or whole chapter.',
    icon: BookOpenIcon,
    accent: 'text-brand-primary bg-brand-primary/10 dark:bg-blue-950/40 group-hover:bg-brand-primary group-hover:text-white',
  },
  {
    view: 'paper' as View,
    title: 'Exam Papers',
    description: 'Mark-balanced papers with MCQs, short and long questions.',
    icon: DocumentTextIcon,
    accent: 'text-brand-accent bg-brand-accent/10 dark:bg-emerald-950/40 group-hover:bg-brand-accent group-hover:text-white',
  },
];

const HomeView: React.FC<HomeViewProps> = ({ onNavigate }) => {
  return (
    <div className="min-h-full flex flex-col items-center justify-center px-4 py-10 md:py-16 relative overflow-hidden">
      {/* Animated background: drifting gradient orbs + dot grid */}
      <div className="absolute inset-0 bg-brand-bg transition-colors duration-500" />
      <motion.div
        animate={{
          x: [0, 25, -20, 0],
          y: [0, -35, 20, 0],
          scale: [1, 1.08, 0.95, 1],
        }}
        transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute -top-32 -left-24 w-[28rem] h-[28rem] rounded-full bg-brand-primary/15 dark:bg-brand-primary/10 blur-3xl pointer-events-none"
      />
      <motion.div
        animate={{
          x: [0, -30, 25, 0],
          y: [0, 30, -25, 0],
          scale: [1, 1.1, 0.92, 1],
        }}
        transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
        className="absolute -bottom-40 -right-24 w-[30rem] h-[30rem] rounded-full bg-brand-accent/15 dark:bg-brand-accent/10 blur-3xl pointer-events-none"
      />
      <div
        className="absolute inset-0 opacity-[0.025] dark:opacity-[0.04] pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)`,
          backgroundSize: '32px 32px',
        }}
      />

      <div className="w-full max-w-3xl relative z-10">
        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="text-center mb-10 md:mb-12"
        >
          <motion.div
            animate={{ y: [0, -8, 0] }}
            transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
            className="relative mx-auto mb-6 w-fit"
          >
            <div className="absolute inset-0 rounded-full bg-brand-primary/20 blur-2xl scale-125" />
            <div className="relative w-24 h-24 md:w-28 md:h-28 rounded-full bg-white dark:bg-slate-900 shadow-glass border-2 border-brand-border dark:border-blue-500/30 flex items-center justify-center p-1.5 ring-4 ring-brand-primary/10">
              <PhssjLogo className="w-full h-full rounded-full drop-shadow-sm" />
            </div>
          </motion.div>

          <h1 className="text-3xl md:text-4xl font-extrabold text-brand-text-primary tracking-tight mb-2">
            Academic Portal
          </h1>
          <p className="text-sm text-brand-text-secondary font-normal max-w-md mx-auto leading-relaxed">
            Select a section from the sidebar to begin.
          </p>
        </motion.div>

        {/* Feature cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-4">
          {FEATURES.map((feature, i) => (
            <motion.button
              key={feature.view}
              onClick={() => onNavigate?.(feature.view)}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.05 * i, ease: [0.16, 1, 0.3, 1] }}
              whileHover={{ y: -3, scale: 1.012 }}
              whileTap={{ scale: 0.98 }}
              className="group flex-1 relative overflow-hidden rounded-2xl glass-card p-5 text-left transition-shadow duration-200 hover:shadow-glass active:scale-[0.98] border border-brand-border/80 dark:border-brand-border cursor-pointer select-none"
            >
              <div className="absolute inset-x-0 top-0 h-1 brand-gradient opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <div className="relative z-10">
                <div className={`w-11 h-11 mb-4 rounded-xl flex items-center justify-center transition-all duration-300 group-hover:scale-110 shadow-xs ${feature.accent}`}>
                  <feature.icon className="w-5 h-5" />
                </div>
                <h2 className="text-base font-bold text-brand-text-primary mb-1">{feature.title}</h2>
                <p className="text-xs text-brand-text-secondary leading-relaxed">{feature.description}</p>
              </div>
            </motion.button>
          ))}
        </div>

        {/* Affiliation strip */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.35 }}
          className="flex flex-col items-center gap-3 mt-8"
        >
          <div className="flex items-center gap-2.5 px-4 py-2 rounded-full bg-white dark:bg-brand-surface shadow-card border border-brand-border">
            <span className="text-[10px] text-brand-text-secondary font-medium">Affiliated with</span>
            <div className="bg-white rounded-md px-1.5 py-0.5 border border-slate-200 dark:border-brand-border/60 flex items-center">
              <ZiauddinLogo className="h-5 w-auto" />
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default HomeView;
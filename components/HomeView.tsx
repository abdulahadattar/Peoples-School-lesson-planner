import React from 'react';
import { BookOpenIcon, DocumentTextIcon } from './icons/MiscIcons';

interface HomeViewProps {
  onNavigate?: (view: 'lesson' | 'paper') => void;
}

const HomeView: React.FC<HomeViewProps> = ({ onNavigate }) => {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-5 py-10 relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-brand-accent via-brand-bg to-brand-bg dark:from-brand-accent dark:via-brand-bg dark:to-brand-bg transition-colors duration-500" />
      <div
        className="absolute inset-0 opacity-[0.025] dark:opacity-[0.04]"
        style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)`,
          backgroundSize: '32px 32px',
        }}
      />

      {/* Content */}
      <div className="w-full max-w-xl relative z-10">
        {/* Hero Section */}
        <div className="text-center mb-14 md:mb-20 opacity-0 animate-[fadeInUp_0.8s_ease-out_forwards]">
          {/* School Logo */}
          <div className="w-20 h-20 md:w-24 md:h-24 mx-auto mb-6 rounded-full bg-gradient-to-br from-brand-primary to-indigo-600 dark:from-brand-primary dark:to-indigo-400 flex items-center justify-center shadow-xl shadow-brand-primary/15 ring-[3px] ring-white dark:ring-slate-800/80 transition-transform duration-500 hover:scale-105">
            <span className="text-2xl md:text-3xl font-bold text-white tracking-tight">PHSS</span>
          </div>

          <h1 className="text-4xl md:text-[2.75rem] font-extrabold text-brand-text-light tracking-tight mb-4 text-balance">
            Lesson Planner
          </h1>
          <p className="text-base md:text-lg text-brand-text-medium font-medium max-w-sm mx-auto leading-relaxed text-balance">
            Create lesson plans and exam papers with AI assistance
          </p>
        </div>

        {/* Cards Grid */}
        <div className="flex flex-col sm:flex-row gap-4 sm:gap-5 mb-12">
          {/* Lesson Plan Card */}
          <button
            onClick={() => onNavigate?.('lesson')}
            className="group flex-1 relative overflow-hidden bg-white/90 dark:bg-slate-800/90 backdrop-blur-md rounded-3xl shadow-card hover:shadow-elevated border border-brand-border/80 p-7 sm:p-8 text-center transition-all duration-400 hover:-translate-y-1 hover:border-brand-primary/30 active:scale-[0.98] opacity-0 animate-[fadeInUp_0.8s_ease-out_0.15s_forwards]"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-brand-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

            <div className="relative z-10">
              <div className="w-14 h-14 mx-auto mb-5 rounded-2xl bg-gradient-to-br from-brand-primary/10 to-indigo-50 dark:from-brand-primary/15 dark:to-indigo-900/40 flex items-center justify-center transition-all duration-300 group-hover:scale-110 group-hover:rotate-2">
                <BookOpenIcon className="w-7 h-7 text-brand-primary" />
              </div>
              <h2 className="text-lg font-bold text-brand-text-light mb-2 tracking-tight">Lesson Plan</h2>
              <p className="text-[13px] text-brand-text-medium leading-relaxed">
                Generate comprehensive lesson plans aligned with curriculum standards
              </p>
            </div>
          </button>

          {/* Exam Paper Card */}
          <button
            onClick={() => onNavigate?.('paper')}
            className="group flex-1 relative overflow-hidden bg-white/90 dark:bg-slate-800/90 backdrop-blur-md rounded-3xl shadow-card hover:shadow-elevated border border-brand-border/80 p-7 sm:p-8 text-center transition-all duration-400 hover:-translate-y-1 hover:border-brand-primary/30 active:scale-[0.98] opacity-0 animate-[fadeInUp_0.8s_ease-out_0.3s_forwards]"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-brand-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

            <div className="relative z-10">
              <div className="w-14 h-14 mx-auto mb-5 rounded-2xl bg-gradient-to-br from-brand-primary/10 to-indigo-50 dark:from-brand-primary/15 dark:to-indigo-900/40 flex items-center justify-center transition-all duration-300 group-hover:scale-110 group-hover:rotate-2">
                <DocumentTextIcon className="w-7 h-7 text-brand-primary" />
              </div>
              <h2 className="text-lg font-bold text-brand-text-light mb-2 tracking-tight">Exam Paper</h2>
              <p className="text-[13px] text-brand-text-medium leading-relaxed">
                Create well-structured exam papers and assessments
              </p>
            </div>
          </button>
        </div>

        {/* School Name */}
        <div className="text-center opacity-0 animate-[fadeInUp_0.8s_ease-out_0.45s_forwards]">
          <p className="text-sm font-semibold text-brand-text-medium tracking-wide">
            Peoples Higher Secondary School Jamshoro
          </p>
        </div>
      </div>

      {/* Custom Animations */}
      <style>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(24px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
};

export default HomeView;

import React from 'react';
import { BookOpenIcon, DocumentTextIcon } from './icons/MiscIcons';

interface HomeViewProps {
  onNavigate?: (view: 'lesson' | 'paper') => void;
}

const HomeView: React.FC<HomeViewProps> = ({ onNavigate }) => {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8 relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-50 via-slate-50 to-indigo-50 dark:from-slate-900 dark:via-slate-900 dark:to-indigo-950 transition-colors duration-500" />
      <div
        className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05]"
        style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)`,
          backgroundSize: '40px 40px',
        }}
      />

      {/* Content */}
      <div className="w-full max-w-2xl relative z-10">
        {/* Hero Section */}
        <div className="text-center mb-12 md:mb-16 opacity-0 animate-[fadeInUp_0.8s_ease-out_forwards]">
          {/* School Logo */}
          <div className="w-24 h-24 md:w-28 md:h-28 mx-auto mb-6 rounded-full bg-gradient-to-br from-brand-primary to-indigo-600 dark:from-brand-primary dark:to-sky-400 flex items-center justify-center shadow-lg shadow-brand-primary/20 ring-4 ring-white dark:ring-slate-800 transition-transform duration-500 hover:scale-105">
            <span className="text-3xl md:text-4xl font-bold text-white tracking-tight">PHSS</span>
          </div>

          <h1 className="text-3xl md:text-4xl font-extrabold text-brand-text-light tracking-tight mb-3">
            Lesson Planner
          </h1>
          <p className="text-base md:text-lg text-brand-text-medium font-medium max-w-md mx-auto leading-relaxed">
            Create lesson plans and exam papers with AI assistance
          </p>
        </div>

        {/* Cards Grid */}
        <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 mb-10">
          {/* Lesson Plan Card */}
          <button
            onClick={() => onNavigate?.('lesson')}
            className="group flex-1 relative overflow-hidden bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm rounded-3xl shadow-lg shadow-black/5 dark:shadow-black/20 border border-brand-border p-6 sm:p-8 text-center transition-all duration-300 hover:shadow-xl hover:shadow-brand-primary/10 dark:hover:shadow-brand-primary/20 hover:-translate-y-1 hover:border-brand-primary/30 active:scale-[0.98] opacity-0 animate-[fadeInUp_0.8s_ease-out_0.15s_forwards]"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-brand-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

            <div className="relative z-10">
              <div className="w-14 h-14 mx-auto mb-5 rounded-2xl bg-gradient-to-br from-brand-primary/10 to-indigo-100 dark:from-brand-primary/20 dark:to-indigo-900/50 flex items-center justify-center transition-all duration-300 group-hover:scale-110 group-hover:rotate-3">
                <BookOpenIcon className="w-7 h-7 text-brand-primary" />
              </div>
              <h2 className="text-xl font-bold text-brand-text-light mb-2">Lesson Plan</h2>
              <p className="text-sm text-brand-text-medium leading-relaxed">
                Generate comprehensive lesson plans aligned with curriculum standards
              </p>
            </div>
          </button>

          {/* Exam Paper Card */}
          <button
            onClick={() => onNavigate?.('paper')}
            className="group flex-1 relative overflow-hidden bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm rounded-3xl shadow-lg shadow-black/5 dark:shadow-black/20 border border-brand-border p-6 sm:p-8 text-center transition-all duration-300 hover:shadow-xl hover:shadow-brand-primary/10 dark:hover:shadow-brand-primary/20 hover:-translate-y-1 hover:border-brand-primary/30 active:scale-[0.98] opacity-0 animate-[fadeInUp_0.8s_ease-out_0.3s_forwards]"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-brand-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

            <div className="relative z-10">
              <div className="w-14 h-14 mx-auto mb-5 rounded-2xl bg-gradient-to-br from-brand-primary/10 to-indigo-100 dark:from-brand-primary/20 dark:to-indigo-900/50 flex items-center justify-center transition-all duration-300 group-hover:scale-110 group-hover:rotate-3">
                <DocumentTextIcon className="w-7 h-7 text-brand-primary" />
              </div>
              <h2 className="text-xl font-bold text-brand-text-light mb-2">Exam Paper</h2>
              <p className="text-sm text-brand-text-medium leading-relaxed">
                Create well-structured exam papers and assessments
              </p>
            </div>
          </button>
        </div>

        {/* School Name */}
        <div className="text-center opacity-0 animate-[fadeInUp_0.8s_ease-out_0.45s_forwards]">
          <p className="text-sm font-semibold text-brand-text-medium tracking-wide uppercase">
            Peoples Higher Secondary School Jamshoro
          </p>
        </div>
      </div>

      {/* Custom Animations */}
      <style>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(20px);
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

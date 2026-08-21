import React from 'react';
import { BookOpenIcon, DocumentTextIcon } from './icons/MiscIcons';

interface HomeViewProps {
  onNavigate?: (view: 'lesson' | 'paper') => void;
}

const HomeView: React.FC<HomeViewProps> = ({ onNavigate }) => {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8 relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-brand-bg transition-colors duration-500" />
      <div
        className="absolute inset-0 opacity-[0.02] dark:opacity-[0.03]"
        style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)`,
          backgroundSize: '32px 32px',
        }}
      />

      {/* Content */}
      <div className="w-full max-w-lg relative z-10">
        {/* Hero Section */}
        <div className="text-center mb-10 md:mb-12 opacity-0 animate-[fadeInUp_0.8s_ease-out_forwards]">
          {/* School Logo */}
          <div className="w-20 h-20 md:w-24 md:h-24 mx-auto mb-5 rounded-2xl bg-brand-primary flex items-center justify-center text-white shadow-lg shadow-brand-primary/20">
            <span className="text-2xl md:text-3xl font-bold tracking-tight">PHSS</span>
          </div>

          <h1 className="text-2xl md:text-3xl font-bold text-brand-text-light tracking-tight mb-2">
            Lesson Planner
          </h1>
          <p className="text-sm md:text-base text-brand-text-medium font-normal max-w-xs mx-auto leading-relaxed">
            AI-powered lesson plans and exam papers for your classroom
          </p>
        </div>

        {/* Cards Grid */}
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 mb-8">
          {/* Lesson Plan Card */}
          <button
            onClick={() => onNavigate?.('lesson')}
            className="group flex-1 relative overflow-hidden bg-brand-surface rounded-2xl border border-brand-border p-5 sm:p-6 text-left transition-all duration-200 hover:border-brand-primary/30 hover:shadow-card active:scale-[0.98] opacity-0 animate-[fadeInUp_0.8s_ease-out_0.15s_forwards]"
          >
            <div className="relative z-10">
              <div className="w-10 h-10 mb-4 rounded-xl bg-brand-primary-soft flex items-center justify-center transition-all duration-200 group-hover:scale-105">
                <BookOpenIcon className="w-5 h-5 text-brand-primary" />
              </div>
              <h2 className="text-base font-bold text-brand-text-light mb-1">Lesson Plan</h2>
              <p className="text-xs text-brand-text-medium leading-relaxed">
                Generate curriculum-aligned lesson plans
              </p>
            </div>
          </button>

          {/* Exam Paper Card */}
          <button
            onClick={() => onNavigate?.('paper')}
            className="group flex-1 relative overflow-hidden bg-brand-surface rounded-2xl border border-brand-border p-5 sm:p-6 text-left transition-all duration-200 hover:border-brand-primary/30 hover:shadow-card active:scale-[0.98] opacity-0 animate-[fadeInUp_0.8s_ease-out_0.3s_forwards]"
          >
            <div className="relative z-10">
              <div className="w-10 h-10 mb-4 rounded-xl bg-brand-primary-soft flex items-center justify-center transition-all duration-200 group-hover:scale-105">
                <DocumentTextIcon className="w-5 h-5 text-brand-primary" />
              </div>
              <h2 className="text-base font-bold text-brand-text-light mb-1">Exam Paper</h2>
              <p className="text-xs text-brand-text-medium leading-relaxed">
                Create structured assessments
              </p>
            </div>
          </button>
        </div>

        {/* School Name */}
        <div className="text-center opacity-0 animate-[fadeInUp_0.8s_ease-out_0.45s_forwards]">
          <p className="text-xs font-semibold text-brand-text-medium tracking-wide uppercase">
            Peoples Higher Secondary School Jamshoro
          </p>
        </div>
      </div>

      {/* Custom Animations */}
      <style>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(16px);
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

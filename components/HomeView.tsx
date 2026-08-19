import React from 'react';
import { BookOpenIcon, DocumentTextIcon } from './icons/MiscIcons';

interface HomeViewProps {
  onNavigate?: (view: 'lesson' | 'paper') => void;
}

const HomeView: React.FC<HomeViewProps> = ({ onNavigate }) => {
  return (
    <div className="min-h-screen bg-brand-bg flex flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold text-brand-text-light tracking-tight mb-2">
            Lesson Planner
          </h1>
          <p className="text-lg text-brand-text-medium">
            Create lesson plans and exam papers with AI assistance
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 sm:gap-6">
          <button
            onClick={() => onNavigate?.('lesson')}
            className="flex-1 bg-brand-surface rounded-2xl shadow-soft border border-brand-border p-6 sm:p-8 text-center hover:shadow-lg hover:border-brand-primary/20 transition-all active:scale-[0.98]"
          >
            <div className="w-12 h-12 bg-brand-primary/10 rounded-xl flex items-center justify-center mx-auto mb-4">
              <BookOpenIcon className="w-12 h-12 text-brand-primary" />
            </div>
            <h2 className="text-xl font-bold text-brand-text-light mb-2">Lesson Plan</h2>
            <p className="text-sm text-brand-text-medium">
              Generate comprehensive lesson plans aligned with curriculum standards
            </p>
          </button>

          <button
            onClick={() => onNavigate?.('paper')}
            className="flex-1 bg-brand-surface rounded-2xl shadow-soft border border-brand-border p-6 sm:p-8 text-center hover:shadow-lg hover:border-brand-primary/20 transition-all active:scale-[0.98]"
          >
            <div className="w-12 h-12 bg-brand-primary/10 rounded-xl flex items-center justify-center mx-auto mb-4">
              <DocumentTextIcon className="w-12 h-12 text-brand-primary" />
            </div>
            <h2 className="text-xl font-bold text-brand-text-light mb-2">Exam Paper</h2>
            <p className="text-sm text-brand-text-medium">
              Create well-structured exam papers and assessments
            </p>
          </button>
        </div>

        <div className="mt-10 text-center">
          <p className="text-sm text-brand-text-medium font-medium">
            Peoples Higher Secondary School Jamshoro
          </p>
        </div>
      </div>
    </div>
  );
};

export default HomeView;

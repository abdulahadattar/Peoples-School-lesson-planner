
import React, { useState } from 'react';
import { LessonPlan } from '../types';
import MarkdownRenderer from './MarkdownRenderer';
import { ArrowLeftIcon, BookOpenIcon, ClipboardListIcon, ClockIcon, PuzzleIcon, TargetIcon, DownloadIcon } from './icons/MiscIcons';
import { FileIcon } from './icons/FileIcon';
import { exportAsDocx, exportAsPdf } from '../services/exportService';

interface ResultsPanelProps {
  lessonPlans: LessonPlan[];
  onBack: () => void;
}

const ResultsPanel: React.FC<ResultsPanelProps> = ({ lessonPlans, onBack }) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  if (lessonPlans.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8 animate-fadeIn bg-brand-bg">
        <div className="bg-brand-surface p-6 rounded-full mb-4 shadow-sm border border-brand-border">
             <FileIcon className="w-12 h-12 text-brand-text-medium opacity-50" />
        </div>
        <h2 className="text-2xl font-bold text-brand-text-light mb-2">No Plans Generated</h2>
        <p className="text-brand-text-medium mb-6 max-w-md leading-relaxed">The generation process didn't produce any plans. Try selecting different outcomes or checking your context files.</p>
        <button 
          onClick={onBack} 
          className="flex items-center gap-2 px-5 py-2.5 bg-brand-primary text-white font-semibold rounded-xl hover:bg-brand-primary-hover transition-all shadow-lg shadow-brand-primary/20 hover:-translate-y-0.5"
        >
          <ArrowLeftIcon className="w-5 h-5" />
          Return to Selection
        </button>
      </div>
    );
  }

  const selectedPlan = lessonPlans[selectedIndex];

  const handleExport = async (type: 'pdf' | 'docx') => {
      if (!selectedPlan) return;
      try {
          if (type === 'pdf') await exportAsPdf(selectedPlan);
          else await exportAsDocx(selectedPlan);
      } catch (error) {
          alert(error instanceof Error ? error.message : 'Failed to export. Please try again.');
      }
  };

  return (
    <div className="flex h-full bg-brand-bg text-brand-text-light overflow-hidden">
      {/* Sidebar - Plan List */}
      <aside className="w-80 flex-shrink-0 bg-brand-surface border-r border-brand-border flex flex-col h-full z-20 shadow-soft">
        <div className="p-5 border-b border-brand-border flex-shrink-0 bg-brand-surface">
          <button 
            onClick={onBack} 
            className="flex items-center gap-2 text-brand-text-medium hover:text-brand-primary transition-colors mb-5 text-sm font-bold group"
          >
            <div className="p-1.5 rounded-lg bg-brand-bg group-hover:bg-brand-primary/10 transition-colors">
               <ArrowLeftIcon className="w-4 h-4" />
            </div>
            Back to Selection
          </button>
          <h2 className="text-lg font-extrabold text-brand-text-light tracking-tight">Generated Plans</h2>
          <p className="text-xs text-brand-text-medium mt-1 font-medium">{lessonPlans.length} document(s) ready</p>
        </div>

        <div className="overflow-y-auto custom-scrollbar p-3 flex-grow space-y-2">
          {lessonPlans.map((plan, index) => {
             const isSelected = selectedIndex === index;
             return (
                <button 
                  key={index}
                  onClick={() => setSelectedIndex(index)}
                  className={`w-full text-left p-4 rounded-xl transition-all duration-200 group relative overflow-hidden ${
                      isSelected 
                      ? 'bg-brand-primary/5 border border-brand-primary/20 shadow-sm' 
                      : 'hover:bg-brand-bg border border-transparent'
                  }`}
                >
                  {isSelected && <div className="absolute left-0 top-0 bottom-0 w-1 bg-brand-primary rounded-l-xl"></div>}
                  
                  <div className="flex items-center justify-between mb-2">
                     <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${
                         isSelected 
                         ? 'bg-brand-primary text-white shadow-sm' 
                         : 'bg-brand-bg text-brand-text-medium group-hover:bg-brand-surface'
                     }`}>
                        {plan.gradeLevel}
                     </span>
                  </div>
                  <h3 className={`font-bold text-sm leading-snug line-clamp-2 ${isSelected ? 'text-brand-primary' : 'text-brand-text-light'}`}>
                      {plan.title}
                  </h3>
                </button>
             );
          })}
        </div>
      </aside>

      {/* Main Content - Document View */}
      <main className="flex-1 flex flex-col h-full relative min-w-0 bg-brand-bg">
        {selectedPlan && (
          <>
             {/* Sticky Document Header */}
             <div className="flex-shrink-0 px-6 py-4 bg-brand-surface/90 backdrop-blur-md border-b border-brand-border z-10 flex items-center justify-between sticky top-0">
                 <div className="min-w-0 flex-1 mr-6">
                    <h1 className="text-xl font-bold text-brand-text-light truncate leading-tight" title={selectedPlan.title}>
                        {selectedPlan.title}
                    </h1>
                    <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-brand-text-medium font-medium flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-brand-primary"></span>
                            {selectedPlan.subject}
                        </span>
                    </div>
                 </div>
                 <div className="flex gap-2 flex-shrink-0">
                     <button onClick={() => handleExport('pdf')} title="Export PDF" className="flex items-center gap-2 px-3 py-2 bg-brand-surface hover:bg-brand-bg border border-brand-border hover:border-brand-text-medium/30 rounded-lg text-xs font-bold text-brand-text-light transition-all shadow-sm active:scale-95">
                        <DownloadIcon className="w-4 h-4" />
                        <span className="hidden lg:inline">PDF</span>
                     </button>
                     <button onClick={() => handleExport('docx')} title="Export Word" className="flex items-center gap-2 px-3 py-2 bg-brand-surface hover:bg-brand-bg border border-brand-border hover:border-brand-text-medium/30 rounded-lg text-xs font-bold text-brand-text-light transition-all shadow-sm active:scale-95">
                        <FileIcon className="w-4 h-4" />
                        <span className="hidden lg:inline">Word</span>
                     </button>
                 </div>
             </div>

            {/* Scrollable Content Area */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 md:p-8 lg:p-12">
                <div className="max-w-5xl mx-auto space-y-8 pb-20">
                    
                    {/* Learning Objective Card */}
                    <div className="bg-gradient-to-br from-brand-primary/5 to-brand-surface border border-brand-primary/10 rounded-2xl p-6 shadow-sm">
                         <div className="flex items-start gap-4">
                            <div className="p-2.5 bg-white dark:bg-brand-bg rounded-xl shadow-sm text-brand-primary flex-shrink-0 border border-brand-primary/10">
                                <TargetIcon className="w-6 h-6" />
                            </div>
                            <div>
                                <h2 className="text-xs font-bold text-brand-primary uppercase tracking-widest mb-2">Learning Objective</h2>
                                <MarkdownRenderer text={selectedPlan.objective} className="text-lg md:text-xl font-medium text-brand-text-light leading-relaxed" />
                            </div>
                         </div>
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                        {/* Left Column: Lesson Procedure */}
                        <div className="xl:col-span-2 space-y-8">
                            <section>
                                <div className="flex items-center gap-3 mb-6">
                                    <div className="p-2 bg-brand-surface rounded-lg border border-brand-border text-brand-text-dark shadow-sm">
                                        <PuzzleIcon className="w-5 h-5" />
                                    </div>
                                    <h2 className="text-lg font-bold text-brand-text-light">Lesson Procedure</h2>
                                </div>

                                <div className="space-y-8 relative before:absolute before:left-[27px] before:top-4 before:bottom-4 before:w-0.5 before:bg-brand-border/60 before:z-0">
                                    {selectedPlan.activities.map((activity, i) => (
                                    <div key={i} className="relative pl-16 group">
                                        {/* Timeline Node */}
                                        <div className="absolute left-[10px] top-0 w-9 h-9 rounded-full bg-brand-surface border-4 border-brand-bg flex items-center justify-center z-10 shadow-sm text-sm font-bold text-brand-text-medium group-hover:border-brand-primary/30 group-hover:text-brand-primary transition-colors">
                                            {i+1}
                                        </div>
                                        
                                        {/* Activity Card */}
                                        <div className="bg-brand-surface rounded-2xl p-6 border border-brand-border shadow-soft hover:shadow-md hover:border-brand-primary/20 transition-all">
                                            <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-3 border-b border-brand-bg">
                                                <h3 className="font-bold text-base text-brand-text-light">{activity.name}</h3>
                                                <div className="flex items-center gap-1.5 text-xs font-bold text-brand-text-medium bg-brand-bg px-2.5 py-1 rounded-lg border border-brand-border/50">
                                                    <ClockIcon className="w-3.5 h-3.5 text-brand-text-dark"/>
                                                    <span>{activity.duration} min</span>
                                                </div>
                                            </div>
                                            <MarkdownRenderer text={activity.description} className="text-brand-text-medium text-sm leading-relaxed" />
                                        </div>
                                    </div>
                                    ))}
                                </div>
                            </section>
                        </div>

                        {/* Right Column: Resources & Homework */}
                        <div className="xl:col-span-1 space-y-6">
                            {/* Resources Card */}
                            <div className="bg-brand-surface rounded-2xl border border-brand-border shadow-soft overflow-hidden">
                                <div className="px-6 py-4 border-b border-brand-border/50 bg-brand-bg/30 flex items-center gap-3">
                                    <ClipboardListIcon className="w-4 h-4 text-brand-text-medium" />
                                    <h3 className="font-bold text-sm text-brand-text-light uppercase tracking-wide">Resources</h3>
                                </div>
                                <div className="p-6">
                                    {selectedPlan.materials.length > 0 ? (
                                        <ul className="space-y-3">
                                            {selectedPlan.materials.map((item, i) => (
                                                <li key={i} className="flex items-start gap-3 text-sm text-brand-text-medium group">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-brand-primary/50 mt-1.5 flex-shrink-0 group-hover:bg-brand-primary transition-colors"></div>
                                                    <MarkdownRenderer text={item} />
                                                </li>
                                            ))}
                                        </ul>
                                    ) : (
                                        <p className="text-brand-text-medium italic text-sm">No specific materials listed.</p>
                                    )}
                                </div>
                            </div>

                            {/* Homework Card */}
                            <div className="bg-brand-surface rounded-2xl border border-brand-border shadow-soft overflow-hidden">
                                <div className="px-6 py-4 border-b border-brand-border/50 bg-brand-bg/30 flex items-center gap-3">
                                    <BookOpenIcon className="w-4 h-4 text-brand-text-medium" />
                                    <h3 className="font-bold text-sm text-brand-text-light uppercase tracking-wide">Homework</h3>
                                </div>
                                <div className="p-6 bg-amber-50/50 dark:bg-amber-900/5">
                                     <MarkdownRenderer text={selectedPlan.homework} className="text-brand-text-light text-sm leading-relaxed" />
                                </div>
                            </div>
                        </div>
                    </div>

                </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
};

export default ResultsPanel;

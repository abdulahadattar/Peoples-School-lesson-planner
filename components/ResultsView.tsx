import React, { useState } from 'react';
import { LessonPlan, GeneratedPaper, TeacherInfo, ExportFormat } from '../types';
import { ArrowLeftIcon, DownloadIcon, ChevronLeftIcon, ChevronRightIcon, RefreshIcon } from './icons/MiscIcons';
import { exportPaperAsDocx, exportPaperAsPdf } from '../services/exportService';
import {
  hasOptions,
  layoutOptions,
  OPTION_CIRCLE,
  optionLetter,
  paperSectionNote,
  questionNumber,
  sectionInstruction,
} from '../services/paperLayout';
import KaTeXText from './KaTeXText';
import { PhssjLogo } from './Logo';
import Spinner from './ui/Spinner';

interface ResultsViewProps {
  lessonPlans: LessonPlan[];
  papers: GeneratedPaper[];
  onBack: () => void;
  teacherName: string;
  schoolName: string;
  exportFormat?: ExportFormat;
  onExportPlan?: (plan: LessonPlan) => void;
  onRevisePaper?: (prompt: string) => Promise<GeneratedPaper | null>;
  isRevising?: boolean;
}

const chipClass = 'px-2 py-1 bg-brand-bg rounded-md border border-brand-border text-[11px]';

const ResultsView: React.FC<ResultsViewProps> = ({
  lessonPlans,
  papers,
  onBack,
  teacherName,
  schoolName,
  exportFormat = 'both',
  onExportPlan,
  onRevisePaper,
  isRevising = false,
}) => {
  const [selectedPlanIndex, setSelectedPlanIndex] = useState(0);
  const [revisionPrompt, setRevisionPrompt] = useState('');
  const [showRevision, setShowRevision] = useState(false);

  const handleExportPaper = async (paper: GeneratedPaper) => {
    try {
      const teacherInfo = { name: teacherName, schoolName };
      if (exportFormat === 'pdf') {
        await exportPaperAsPdf(paper, teacherInfo);
      } else if (exportFormat === 'docx') {
        await exportPaperAsDocx(paper, teacherInfo);
      } else {
        // Both
        await exportPaperAsDocx(paper, teacherInfo);
        await new Promise(resolve => setTimeout(resolve, 250));
        await exportPaperAsPdf(paper, teacherInfo);
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to export. Please try again.');
    }
  };

  if (lessonPlans.length > 0) {
    const selectedPlan = lessonPlans[selectedPlanIndex];
    const hasMultiple = lessonPlans.length > 1;

    return (
      <div className="h-full flex flex-col bg-brand-bg">
        <div className="flex-shrink-0 px-4 py-3 bg-brand-surface/80 backdrop-blur-xl border-b border-brand-border flex items-center justify-between sticky top-0 z-10">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-brand-text-secondary hover:text-brand-primary transition-all duration-200 text-sm font-semibold active:scale-95"
          >
            <ArrowLeftIcon className="w-4 h-4" />
            Back
          </button>

          <div className="flex items-center gap-2">
            {hasMultiple && (
              <div className="flex items-center gap-1 mr-2">
                <button
                  onClick={() => setSelectedPlanIndex(prev => Math.max(0, prev - 1))}
                  disabled={selectedPlanIndex === 0}
                  aria-label="Previous plan"
                  className="p-1.5 rounded-lg border border-brand-border hover:bg-brand-bg disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 active:scale-90"
                >
                  <ChevronLeftIcon className="w-4 h-4" />
                </button>
                <span className="text-xs font-semibold text-brand-text-secondary px-2">
                  {selectedPlanIndex + 1} / {lessonPlans.length}
                </span>
                <button
                  onClick={() => setSelectedPlanIndex(prev => Math.min(lessonPlans.length - 1, prev + 1))}
                  disabled={selectedPlanIndex === lessonPlans.length - 1}
                  aria-label="Next plan"
                  className="p-1.5 rounded-lg border border-brand-border hover:bg-brand-bg disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 active:scale-90"
                >
                  <ChevronRightIcon className="w-4 h-4" />
                </button>
              </div>
            )}
            {onExportPlan && (
              <button
                onClick={() => onExportPlan(selectedPlan)}
                className="flex items-center gap-1.5 px-3 py-1.5 brand-gradient text-white rounded-lg text-xs font-semibold hover:shadow-glass transition-all duration-200 active:scale-95"
              >
                <DownloadIcon className="w-3.5 h-3.5" />
                Export {exportFormat === 'both' ? 'DOCX + PDF' : exportFormat.toUpperCase()}
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-6">
          <div className="max-w-3xl mx-auto space-y-6 animate-fadeInUp">
            <div className="glass-card rounded-xl p-4">
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-full bg-white border border-brand-border flex items-center justify-center overflow-hidden flex-shrink-0">
                  <PhssjLogo className="w-full h-full" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-xl font-bold text-brand-text-primary mb-1 leading-tight">{selectedPlan.title}</h1>
                  <div className="flex flex-wrap gap-2">
                    <span className={chipClass}>{selectedPlan.gradeLevel}</span>
                    <span className={chipClass}>{selectedPlan.subject}</span>
                    {selectedPlan.chapterName && <span className={chipClass}>{selectedPlan.chapterName}</span>}
                    {hasMultiple && (
                      <span className="px-2 py-1 bg-brand-primary/10 text-brand-primary rounded-md border border-brand-primary/15 font-semibold text-[11px]">
                        Plan {selectedPlanIndex + 1} of {lessonPlans.length}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="glass-card rounded-xl p-4 hover:shadow-card-hover transition-shadow">
              <h2 className="text-sm font-bold text-brand-primary uppercase tracking-widest mb-2">Objective</h2>
              <KaTeXText text={selectedPlan.objective} className="text-brand-text-primary leading-relaxed" as="p" />
            </div>

            <div className="glass-card rounded-xl p-4">
              <h2 className="text-sm font-bold text-brand-primary uppercase tracking-widest mb-4">Lesson Procedure</h2>
              <div className="space-y-4">
                {selectedPlan.activities.map((activity, i) => (
                  <div key={i} className="border-l-2 border-brand-primary pl-4 group">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="font-bold text-brand-text-primary text-sm">{activity.name}</h3>
                      <span className="text-xs text-brand-text-secondary bg-brand-bg px-2 py-0.5 rounded-md">{activity.duration} mins</span>
                    </div>
                    <KaTeXText text={activity.description} className="text-sm text-brand-text-secondary leading-relaxed group-hover:text-brand-text-primary transition-colors" as="p" />
                  </div>
                ))}
              </div>
            </div>

            <div className="glass-card rounded-xl p-4">
              <h2 className="text-sm font-bold text-brand-primary uppercase tracking-widest mb-2">Resources</h2>
              <ul className="space-y-1">
                {selectedPlan.materials.map((item, i) => (
                  <li key={i} className="text-sm text-brand-text-secondary flex items-start gap-2">
                    <span className="text-brand-primary mt-1">•</span>
                    <KaTeXText text={item} />
                  </li>
                ))}
              </ul>
            </div>

            <div className="glass-card rounded-xl p-4">
              <h2 className="text-sm font-bold text-brand-primary uppercase tracking-widest mb-2">Homework</h2>
              <KaTeXText text={selectedPlan.homework} className="text-sm text-brand-text-secondary leading-relaxed" as="p" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (papers.length > 0) {
    const paper = papers[0];
    return (
      <div className="h-full flex flex-col bg-brand-bg">
        <div className="flex-shrink-0 px-4 py-3 bg-brand-surface/80 backdrop-blur-xl border-b border-brand-border flex items-center justify-between sticky top-0 z-10">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-brand-text-secondary hover:text-brand-primary transition-all duration-200 text-sm font-semibold active:scale-95"
          >
            <ArrowLeftIcon className="w-4 h-4" />
            Back
          </button>
          <button
            onClick={() => handleExportPaper(paper)}
            className="flex items-center gap-1.5 px-3 py-1.5 brand-gradient text-white rounded-lg text-xs font-semibold hover:shadow-glass transition-all duration-200 active:scale-95"
          >
            <DownloadIcon className="w-3.5 h-3.5" />
            Export {exportFormat === 'both' ? 'DOCX + PDF' : exportFormat.toUpperCase()}
          </button>
        </div>

        {/* Extra bottom padding keeps the last question clear of the floating revision bar */}
        <div className={`flex-1 overflow-y-auto custom-scrollbar p-4 md:p-6 ${onRevisePaper ? 'pb-36' : ''}`}>
          <div className="max-w-3xl mx-auto animate-fadeInUp">
            <div className="glass-card rounded-xl p-4 mb-6 text-center">
              <div className="w-14 h-14 rounded-full bg-white border border-brand-border flex items-center justify-center overflow-hidden mx-auto mb-3">
                <PhssjLogo className="w-full h-full" />
              </div>
              <h1 className="text-lg font-bold text-brand-text-primary mb-1">{schoolName}</h1>
              <h2 className="text-xl font-bold text-brand-text-primary mb-2">{paper.title}</h2>
              <div className="flex flex-wrap justify-center gap-2">
                <span className={chipClass}>Subject: {paper.subject}</span>
                <span className={chipClass}>Class: {paper.gradeLevel}</span>
                <span className={chipClass}>Total Marks: {paper.totalMarks}</span>
                <span className={chipClass}>Duration: {paper.durationMinutes} mins</span>
              </div>
            </div>

            {paper.sections.map((section, sIdx) => {
              const genericInstruction = sectionInstruction(section);
              const markingNote = paperSectionNote(paper, sIdx, section);
              return (
                <div key={sIdx} className="glass-card rounded-xl p-4 mb-4 hover:shadow-card-hover transition-shadow">
                  <h3 className="text-lg font-bold text-brand-text-primary mb-1">{section.title}</h3>
                  {genericInstruction && <p className="text-sm text-brand-text-secondary mb-1">{genericInstruction}</p>}
                  {markingNote && (
                    <p className="text-sm font-semibold text-brand-primary mb-4">{markingNote}</p>
                  )}
                  <div className="space-y-4">
                    {section.questions.map((q, qIdx) => (
                      <div key={`${sIdx}-${qIdx}`} className="text-sm text-brand-text-primary">
                        <div className="flex items-start">
                          <span className="font-semibold mr-1.5">{questionNumber(qIdx)}.</span>
                          <KaTeXText text={q.question} />
                        </div>
                        {hasOptions(q) && (
                          <div className="mt-2 space-y-1.5">
                            {layoutOptions(q.options || []).map((row, rIdx) =>
                              row.options.length === 2 ? (
                                // Two short options share one line with fixed alignment
                                <div key={rIdx} className="grid grid-cols-2 gap-x-8 items-start">
                                  {row.options.map(o => (
                                    <div key={o.index} className="flex items-start">
                                      <span className="text-brand-text-secondary mr-1.5 whitespace-nowrap">
                                        {OPTION_CIRCLE} {optionLetter(o.index)})
                                      </span>
                                      <KaTeXText text={o.text} className="text-brand-text-secondary" />
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div key={rIdx} className="flex items-start">
                                  <span className="text-brand-text-secondary mr-1.5 whitespace-nowrap">
                                    {OPTION_CIRCLE} {optionLetter(row.options[0].index)})
                                  </span>
                                  <KaTeXText text={row.options[0].text} className="text-brand-text-secondary" />
                                </div>
                              )
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Floating Revision Bar */}
        {onRevisePaper && (
          <div className="fixed bottom-0 left-0 right-0 z-50 flex justify-center pointer-events-none">
            <div className="w-full max-w-2xl mx-4 mb-4 pointer-events-auto">
              {!showRevision ? (
                <button
                  onClick={() => setShowRevision(true)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 glass-card rounded-full shadow-glass hover:-translate-y-0.5 hover:border-brand-primary/30 transition-all duration-200 active:scale-[0.99]"
                >
                  <RefreshIcon className="w-4 h-4 text-brand-primary flex-shrink-0" />
                  <span className="text-sm text-brand-text-secondary">Revise this paper...</span>
                </button>
              ) : (
                <div className="glass-card rounded-2xl shadow-glass overflow-hidden transition-all animate-scaleIn">
                  <div className="px-4 pt-3 pb-2">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-brand-primary uppercase tracking-wider">Revise Paper</span>
                      <button
                        onClick={() => { setShowRevision(false); setRevisionPrompt(''); }}
                        aria-label="Close revision"
                        className="text-brand-text-secondary hover:text-brand-text-primary transition-colors active:scale-90"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                    <textarea
                      value={revisionPrompt}
                      onChange={e => setRevisionPrompt(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          if (revisionPrompt.trim() && !isRevising) {
                            onRevisePaper(revisionPrompt).then(result => {
                              if (result) { setRevisionPrompt(''); setShowRevision(false); }
                            });
                          }
                        }
                      }}
                      placeholder="Describe any changes you want to make..."
                      className="w-full h-16 px-1 py-1 bg-transparent text-sm text-brand-text-primary placeholder:text-brand-text-secondary/50 focus:outline-none resize-none"
                      disabled={isRevising}
                      autoFocus
                    />
                  </div>
                  <div className="flex items-center justify-between px-4 py-2 border-t border-brand-border bg-brand-bg/50">
                    <p className="text-[10px] text-brand-text-secondary">
                      e.g. Add MCQs about thermodynamics, remove q3, change marks
                    </p>
                    <button
                      onClick={async () => {
                        if (!revisionPrompt.trim() || isRevising) return;
                        const result = await onRevisePaper(revisionPrompt);
                        if (result) { setRevisionPrompt(''); setShowRevision(false); }
                      }}
                      disabled={isRevising || !revisionPrompt.trim()}
                      aria-label="Send revision"
                      className="flex items-center justify-center w-8 h-8 rounded-full brand-gradient text-white hover:shadow-glass disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 active:scale-90 flex-shrink-0"
                    >
                      {isRevising ? (
                        <Spinner className="w-4 h-4" />
                      ) : (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Empty state
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-8 animate-fadeInUp">
      <div className="w-20 h-20 rounded-full bg-white shadow-glass border border-brand-border flex items-center justify-center overflow-hidden mb-5">
        <PhssjLogo className="w-full h-full" />
      </div>
      <h2 className="text-xl font-bold text-brand-text-primary mb-2">No results yet</h2>
      <p className="text-brand-text-secondary mb-6 max-w-md leading-relaxed text-sm">
        Generate a lesson plan or exam paper and it will appear here, ready to review and export.
      </p>
      <button
        onClick={onBack}
        className="flex items-center gap-2 px-5 py-2.5 brand-gradient text-white font-semibold rounded-xl hover:shadow-glass hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200"
      >
        <ArrowLeftIcon className="w-5 h-5" />
        Get Started
      </button>
    </div>
  );
};

export default ResultsView;
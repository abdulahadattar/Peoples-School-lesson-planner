import React, { useState } from 'react';
import { LessonPlan, GeneratedPaper, TeacherInfo, ExportFormat, PaperQuestion } from '../types';
import { ArrowLeftIcon, DownloadIcon, ChevronLeftIcon, ChevronRightIcon, RefreshIcon, SparklesIcon } from './icons/MiscIcons';
import {
  paperSectionNote,
  sectionInstruction,
} from '../services/paperLayout';
import KaTeXText from './KaTeXText';
import { PhssjLogo } from './Logo';
import Spinner from './ui/Spinner';
import { QuestionEditor } from './QuestionEditor';
import { saveExamPaperToDb } from '../services/storageService';

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
  onUpdatePaper?: (updatedPaper: GeneratedPaper) => void;
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
  onUpdatePaper,
}) => {
  const [selectedPlanIndex, setSelectedPlanIndex] = useState(0);
  const [revisionPrompt, setRevisionPrompt] = useState('');
  const [showRevision, setShowRevision] = useState(false);
  const [mathScale, setMathScale] = useState<number>(() => {
    const saved = localStorage.getItem('phssj_math_scale');
    return saved ? Number(saved) || 85 : 85;
  });

  const handleMathScaleChange = (newScale: number) => {
    const clamped = Math.max(70, Math.min(200, newScale));
    setMathScale(clamped);
    localStorage.setItem('phssj_math_scale', String(clamped));
    window.dispatchEvent(new CustomEvent('phssj-math-scale-changed', { detail: { scale: clamped } }));
  };

  const handleUpdateQuestion = (sIdx: number, qIdx: number, updatedQuestion: PaperQuestion) => {
    if (!papers || papers.length === 0) return;
    const paper = papers[0];
    const newPaper: GeneratedPaper = JSON.parse(JSON.stringify(paper));
    newPaper.sections[sIdx].questions[qIdx] = updatedQuestion;
    const calculatedMarks = newPaper.sections.reduce((acc, sec) =>
      acc + sec.questions.reduce((qAcc, q) => qAcc + (Number(q.marks) || 0), 0), 0
    );
    newPaper.totalMarks = calculatedMarks;
    onUpdatePaper?.(newPaper);
    saveExamPaperToDb(newPaper).catch(console.error);
  };

  const handleDeleteQuestion = (sIdx: number, qIdx: number) => {
    if (!papers || papers.length === 0) return;
    if (!confirm('Are you sure you want to remove this question?')) return;
    const paper = papers[0];
    const newPaper: GeneratedPaper = JSON.parse(JSON.stringify(paper));
    newPaper.sections[sIdx].questions.splice(qIdx, 1);
    const calculatedMarks = newPaper.sections.reduce((acc, sec) =>
      acc + sec.questions.reduce((qAcc, q) => qAcc + (Number(q.marks) || 0), 0), 0
    );
    newPaper.totalMarks = calculatedMarks;
    onUpdatePaper?.(newPaper);
    saveExamPaperToDb(newPaper).catch(console.error);
  };

  const handleAddQuestion = (sIdx: number) => {
    if (!papers || papers.length === 0) return;
    const paper = papers[0];
    const newPaper: GeneratedPaper = JSON.parse(JSON.stringify(paper));
    const section = newPaper.sections[sIdx];
    const isMcq = section.title.toLowerCase().includes('multiple') || section.title.toLowerCase().includes('mcq');
    const defaultMarks = isMcq ? 1 : (section.title.toLowerCase().includes('short') ? 4 : 8);
    const newQ: PaperQuestion = {
      id: `q_${Date.now()}`,
      type: isMcq ? 'mcq' : (section.title.toLowerCase().includes('short') ? 'short' : 'long'),
      question: 'New question text goes here (click edit to modify or regenerate with AI)',
      marks: defaultMarks,
      options: isMcq ? ['Option A', 'Option B', 'Option C', 'Option D'] : undefined,
    };
    section.questions.push(newQ);
    const calculatedMarks = newPaper.sections.reduce((acc, sec) =>
      acc + sec.questions.reduce((qAcc, q) => qAcc + (Number(q.marks) || 0), 0), 0
    );
    newPaper.totalMarks = calculatedMarks;
    onUpdatePaper?.(newPaper);
    saveExamPaperToDb(newPaper).catch(console.error);
  };

  const handleExportPaper = async (paper: GeneratedPaper) => {
    try {
      const teacherInfo = { name: teacherName, schoolName };
      const { exportPaperAsDocx, exportPaperAsPdf } = await import('../services/exportService');
      if (exportFormat === 'pdf') {
        await exportPaperAsPdf(paper, teacherInfo, mathScale);
      } else if (exportFormat === 'docx') {
        await exportPaperAsDocx(paper, teacherInfo, mathScale);
      } else {
        // Both
        await exportPaperAsDocx(paper, teacherInfo, mathScale);
        await new Promise(resolve => setTimeout(resolve, 250));
        await exportPaperAsPdf(paper, teacherInfo, mathScale);
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
        <div className="flex-shrink-0 px-4 py-3 bg-brand-surface/80 backdrop-blur-xl border-b border-brand-border flex items-center justify-between gap-3 sticky top-0 z-10">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-brand-text-secondary hover:text-brand-primary transition-all duration-200 text-sm font-semibold active:scale-95"
          >
            <ArrowLeftIcon className="w-4 h-4" />
            Back
          </button>

          <div className="flex items-center gap-3">
            {/* Manual LaTeX Equation Size Controller */}
            <div className="flex items-center gap-1.5 bg-brand-bg/80 border border-brand-border/80 rounded-xl px-2.5 py-1 text-xs shadow-sm">
              <span className="text-brand-text-tertiary font-medium hidden sm:inline">LaTeX Size:</span>
              <button
                onClick={() => handleMathScaleChange(mathScale - 10)}
                title="Decrease LaTeX equation font size"
                className="w-6 h-6 rounded-lg flex items-center justify-center font-bold text-brand-text-secondary hover:text-brand-primary hover:bg-brand-surface transition-colors active:scale-90"
              >
                -
              </button>
              <span className="font-mono font-bold text-brand-primary min-w-[44px] text-center">{mathScale}%</span>
              <button
                onClick={() => handleMathScaleChange(mathScale + 10)}
                title="Increase LaTeX equation font size"
                className="w-6 h-6 rounded-lg flex items-center justify-center font-bold text-brand-text-secondary hover:text-brand-primary hover:bg-brand-surface transition-colors active:scale-90"
              >
                +
              </button>
              <div className="hidden md:flex items-center gap-1 ml-1.5 border-l border-brand-border/60 pl-2">
                {[85, 100, 115, 130].map(s => (
                  <button
                    key={s}
                    onClick={() => handleMathScaleChange(s)}
                    className={`px-2 py-0.5 rounded-md text-[11px] font-semibold transition-all ${
                      mathScale === s
                        ? 'brand-gradient text-white shadow-xs'
                        : 'text-brand-text-tertiary hover:text-brand-text-primary hover:bg-brand-surface'
                    }`}
                  >
                    {s === 85 ? 'Compact (Default)' : s === 100 ? 'Standard' : s === 115 ? 'Large' : 'XL'}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={() => handleExportPaper(paper)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 brand-gradient text-white rounded-xl text-xs font-semibold hover:shadow-glass transition-all duration-200 active:scale-95"
            >
              <DownloadIcon className="w-3.5 h-3.5" />
              Export {exportFormat === 'both' ? 'DOCX + PDF' : exportFormat.toUpperCase()}
            </button>
          </div>
        </div>

        {/* Scrollable Questions Area - Clean natural padding without floating obstructions */}
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-4 md:p-6">
          <div className="max-w-3xl mx-auto animate-fadeInUp">
            <div className="glass-card rounded-xl p-4 mb-6 text-center">
              <div className="w-14 h-14 rounded-full bg-white border border-brand-border flex items-center justify-center overflow-hidden mx-auto mb-3 shadow-soft">
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
                  <div className="space-y-2">
                    {section.questions.map((q, qIdx) => (
                      <QuestionEditor
                        key={q.id || `${sIdx}-${qIdx}`}
                        question={q}
                        index={qIdx}
                        sectionIndex={sIdx}
                        paper={paper}
                        onUpdateQuestion={(updated) => handleUpdateQuestion(sIdx, qIdx, updated)}
                        onDeleteQuestion={() => handleDeleteQuestion(sIdx, qIdx)}
                      />
                    ))}
                  </div>

                  <div className="mt-4 pt-3 border-t border-brand-border/60 flex items-center justify-between">
                    <span className="text-xs text-brand-text-secondary">
                      {section.questions.length} questions in this section
                    </span>
                    <button
                      type="button"
                      onClick={() => handleAddQuestion(sIdx)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg text-brand-primary hover:bg-brand-primary/10 border border-dashed border-brand-primary/40 transition-colors active:scale-95"
                    >
                      <span>+</span> Add Question to {section.title}
                    </button>
                  </div>
                </div>
              );
            })}

            {/* Bottom spacer ensuring clean scroll buffer */}
            <div className="h-6" />
          </div>
        </div>

        {/* Docked Revision Bar - Sits cleanly below scroll area so it never covers document text */}
        {onRevisePaper && (
          <div className="flex-shrink-0 border-t border-brand-border bg-brand-surface/95 dark:bg-brand-surface backdrop-blur-xl px-4 py-3 z-20 shadow-[0_-4px_20px_rgba(0,0,0,0.06)] dark:shadow-[0_-4px_20px_rgba(0,0,0,0.3)]">
            <div className="max-w-3xl mx-auto">
              {!showRevision ? (
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                  <button
                    onClick={() => setShowRevision(true)}
                    className="flex-1 flex items-center gap-3 px-4 py-2.5 bg-brand-bg hover:bg-brand-bg/80 border border-brand-border rounded-xl text-left transition-all duration-200 group active:scale-[0.99]"
                  >
                    <div className="w-7 h-7 rounded-lg brand-gradient flex items-center justify-center text-white flex-shrink-0 shadow-soft">
                      <RefreshIcon className="w-3.5 h-3.5" />
                    </div>
                    <span className="text-xs sm:text-sm text-brand-text-secondary group-hover:text-brand-text-primary transition-colors truncate">
                      Revise paper with AI (e.g., add MCQs, change marks, regenerate section)...
                    </span>
                    <span className="hidden sm:inline-flex text-[11px] font-semibold text-brand-primary bg-brand-primary/10 px-2.5 py-1 rounded-lg ml-auto border border-brand-primary/20">
                      Revise
                    </span>
                  </button>

                  <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar py-0.5 sm:py-0">
                    <button
                      type="button"
                      onClick={() => { setRevisionPrompt('Add 5 more MCQs to Section A'); setShowRevision(true); }}
                      className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-brand-bg border border-brand-border text-brand-text-secondary hover:text-brand-primary hover:border-brand-primary/40 whitespace-nowrap transition-all"
                    >
                      + 5 MCQs
                    </button>
                    <button
                      type="button"
                      onClick={() => { setRevisionPrompt('Add 2 more short questions with optional choices'); setShowRevision(true); }}
                      className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-brand-bg border border-brand-border text-brand-text-secondary hover:text-brand-primary hover:border-brand-primary/40 whitespace-nowrap transition-all"
                    >
                      + 2 Short Qs
                    </button>
                    <button
                      type="button"
                      onClick={() => { setRevisionPrompt('Make the questions slightly more challenging and conceptually oriented'); setShowRevision(true); }}
                      className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-brand-bg border border-brand-border text-brand-text-secondary hover:text-brand-primary hover:border-brand-primary/40 whitespace-nowrap transition-all hidden md:inline-block"
                    >
                      Higher Rigor
                    </button>
                  </div>
                </div>
              ) : (
                <div className="glass-card rounded-2xl border border-brand-primary/30 shadow-card overflow-hidden transition-all animate-scaleIn">
                  <div className="px-4 pt-3 pb-2">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-brand-primary animate-pulse" />
                        <span className="text-xs font-bold text-brand-primary uppercase tracking-wider">
                          AI Paper Revision
                        </span>
                      </div>
                      <button
                        onClick={() => { setShowRevision(false); setRevisionPrompt(''); }}
                        aria-label="Close revision"
                        className="p-1 rounded-lg text-brand-text-secondary hover:text-brand-text-primary hover:bg-brand-bg transition-colors active:scale-90"
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
                      placeholder="Describe what to change (e.g. 'Add 5 MCQs about vectors, replace question 3 with a numerical problem, rebalance total marks to 50')..."
                      className="w-full h-18 px-3 py-2 bg-brand-bg border border-brand-border rounded-xl text-sm text-brand-text-primary placeholder:text-brand-text-secondary/60 focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary resize-none transition-all"
                      disabled={isRevising}
                      autoFocus
                    />


                  </div>

                  <div className="flex items-center justify-between px-4 py-2.5 border-t border-brand-border bg-brand-bg/60">
                    <p className="text-[10px] text-brand-text-secondary">
                      Press <kbd className="px-1 py-0.5 bg-brand-surface rounded border border-brand-border font-mono text-[9px]">Enter</kbd> to revise, <kbd className="px-1 py-0.5 bg-brand-surface rounded border border-brand-border font-mono text-[9px]">Shift+Enter</kbd> for new line
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => { setShowRevision(false); setRevisionPrompt(''); }}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium text-brand-text-secondary hover:bg-brand-surface transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={async () => {
                          if (!revisionPrompt.trim() || isRevising) return;
                          const result = await onRevisePaper(revisionPrompt);
                          if (result) { setRevisionPrompt(''); setShowRevision(false); }
                        }}
                        disabled={isRevising || !revisionPrompt.trim()}
                        className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl brand-gradient text-white text-xs font-semibold hover:shadow-glass disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 active:scale-95"
                      >
                        {isRevising ? (
                          <>
                            <Spinner className="w-3.5 h-3.5" />
                            <span>Revising Paper...</span>
                          </>
                        ) : (
                          <>
                            <SparklesIcon className="w-3.5 h-3.5" />
                            <span>Apply Revision</span>
                          </>
                        )}
                      </button>
                    </div>
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
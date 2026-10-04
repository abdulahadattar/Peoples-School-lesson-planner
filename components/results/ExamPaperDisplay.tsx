import React from 'react';
import { GeneratedPaper, ExportFormat, PaperQuestion } from '../../types';
import { ArrowLeftIcon, DownloadIcon } from '../icons/MiscIcons';
import { sectionInstruction, paperSectionNote } from '../../services/paperLayout';
import { QuestionEditor } from '../QuestionEditor';
import { PhssjLogo } from '../Logo';

const chipClass = 'px-2 py-1 bg-brand-bg rounded-md border border-brand-border text-[11px]';

export interface ExamPaperDisplayProps {
  paper: GeneratedPaper;
  schoolName: string;
  mathScale: number;
  onMathScaleChange: (scale: number) => void;
  onBack: () => void;
  exportFormat?: ExportFormat;
  onExportPaper: (paper: GeneratedPaper) => void;
  onUpdateQuestion: (sIdx: number, qIdx: number, updated: PaperQuestion) => void;
  onDeleteQuestion: (sIdx: number, qIdx: number) => void;
  onAddQuestion: (sIdx: number) => void;
}

export const ExamPaperDisplay: React.FC<ExamPaperDisplayProps> = ({
  paper,
  schoolName,
  mathScale,
  onMathScaleChange,
  onBack,
  exportFormat = 'both',
  onExportPaper,
  onUpdateQuestion,
  onDeleteQuestion,
  onAddQuestion,
}) => {
  return (
    <div className="h-full flex flex-col bg-brand-bg">
      <div className="flex-shrink-0 px-4 py-3 bg-brand-surface/80 backdrop-blur-xl border-b border-brand-border flex items-center justify-between gap-3 sticky top-0 z-10">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-brand-text-secondary hover:text-brand-primary transition-all duration-200 text-sm font-semibold active:scale-95 cursor-pointer"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          Back
        </button>

        <div className="flex items-center gap-3">
          {/* Manual LaTeX Equation Size Controller */}
          <div className="flex items-center gap-1.5 bg-brand-bg/80 border border-brand-border/80 rounded-xl px-2.5 py-1 text-xs shadow-sm">
            <span className="text-brand-text-tertiary font-medium hidden sm:inline">LaTeX Size:</span>
            <button
              onClick={() => onMathScaleChange(mathScale - 10)}
              title="Decrease LaTeX equation font size"
              className="w-6 h-6 rounded-lg flex items-center justify-center font-bold text-brand-text-secondary hover:text-brand-primary hover:bg-brand-surface transition-colors active:scale-90 cursor-pointer"
            >
              -
            </button>
            <span className="font-mono font-bold text-brand-primary min-w-[44px] text-center">{mathScale}%</span>
            <button
              onClick={() => onMathScaleChange(mathScale + 10)}
              title="Increase LaTeX equation font size"
              className="w-6 h-6 rounded-lg flex items-center justify-center font-bold text-brand-text-secondary hover:text-brand-primary hover:bg-brand-surface transition-colors active:scale-90 cursor-pointer"
            >
              +
            </button>
            <div className="hidden md:flex items-center gap-1 ml-1.5 border-l border-brand-border/60 pl-2">
              {[85, 100, 115, 130].map(s => (
                <button
                  key={s}
                  onClick={() => onMathScaleChange(s)}
                  className={`px-2 py-0.5 rounded-md text-[11px] font-semibold transition-all cursor-pointer ${
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
            onClick={() => onExportPaper(paper)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 brand-gradient text-white rounded-xl text-xs font-semibold hover:shadow-glass transition-all duration-200 active:scale-95 cursor-pointer"
          >
            <DownloadIcon className="w-3.5 h-3.5" />
            Export {exportFormat === 'both' ? 'DOCX + PDF' : exportFormat.toUpperCase()}
          </button>
        </div>
      </div>

      {/* Scrollable Questions Area */}
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-4 md:p-6">
        <div className="max-w-3xl mx-auto animate-fadeInUp">
          <div className="glass-card rounded-xl p-4 mb-6 text-center">
            <div className="w-14 h-14 rounded-full bg-white dark:bg-slate-900 border border-brand-border flex items-center justify-center mx-auto mb-3 shadow-soft p-1 ring-1 ring-black/5 dark:ring-white/10">
              <PhssjLogo className="w-full h-full rounded-full" />
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
                      onUpdateQuestion={(updated) => onUpdateQuestion(sIdx, qIdx, updated)}
                      onDeleteQuestion={() => onDeleteQuestion(sIdx, qIdx)}
                    />
                  ))}
                </div>

                <div className="mt-4 pt-3 border-t border-brand-border/60 flex items-center justify-between">
                  <span className="text-xs text-brand-text-secondary">
                    {section.questions.length} questions in this section
                  </span>
                  <button
                    type="button"
                    onClick={() => onAddQuestion(sIdx)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg text-brand-primary hover:bg-brand-primary/10 border border-dashed border-brand-primary/40 transition-colors active:scale-95 cursor-pointer"
                  >
                    <span>+</span> Add Question to {section.title}
                  </button>
                </div>
              </div>
            );
          })}

          <div className="h-6" />
        </div>
      </div>
    </div>
  );
};

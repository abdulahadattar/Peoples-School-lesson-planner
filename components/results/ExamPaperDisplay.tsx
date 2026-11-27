import React, { useState } from 'react';
import { ArrowLeft, Download, QrCode } from 'lucide-react';
import { GeneratedPaper, ExportFormat, PaperQuestion } from '../../types';
import { sectionInstruction, paperSectionNote } from '../../services/paperLayout';
import { QuestionEditor } from '../QuestionEditor';
import { PhssjLogo } from '../Logo';
import { OmrExportModal } from '../omr/OmrExportModal';
import { McqOmrTestKitBanner } from '../omr/McqOmrTestKitBanner';

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
  onScanSheetsForPaper?: (testCode: string) => void;
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
  onScanSheetsForPaper,
}) => {
  const [showOmrModal, setShowOmrModal] = useState(false);

  const handleUpdateMcqKey = (mcqIndex: number, nextLetter: string) => {
    let seen = 0;
    for (let sIdx = 0; sIdx < paper.sections.length; sIdx++) {
      const sec = paper.sections[sIdx];
      for (let qIdx = 0; qIdx < sec.questions.length; qIdx++) {
        const q = sec.questions[qIdx];
        const isMcq = q.type === 'mcq' || (Array.isArray(q.options) && q.options.length > 0);
        if (!isMcq) continue;
        if (seen === mcqIndex) {
          onUpdateQuestion(sIdx, qIdx, { ...q, correctAnswer: nextLetter });
          return;
        }
        seen++;
      }
    }
  };

  return (
    <div className="h-full flex flex-col bg-brand-bg print:h-auto print:bg-white">
      <div className="flex-shrink-0 px-4 py-3 bg-brand-surface/80 backdrop-blur-xl border-b border-brand-border flex items-center justify-between gap-3 sticky top-0 z-10 flex-wrap print:hidden">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-brand-text-secondary hover:text-brand-primary transition-[color,background-color,border-color,transform] duration-200 text-sm font-semibold active:scale-95 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>

        <div className="flex items-center gap-2.5 flex-wrap">
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
                  className={`px-2 py-0.5 rounded-md text-[11px] font-semibold transition-[color,background-color,border-color,box-shadow] cursor-pointer ${
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
            type="button"
            onClick={() => setShowOmrModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-brand-border bg-brand-bg hover:bg-slate-100 dark:hover:bg-slate-800 text-brand-text-primary text-xs font-semibold transition-colors cursor-pointer"
          >
            <QrCode className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            Export OMR Sheet (A4 PDF)
          </button>

          <button
            onClick={() => onExportPaper(paper)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 brand-gradient text-white rounded-xl text-xs font-semibold hover:shadow-glass transition-[transform,box-shadow] duration-200 active:scale-95 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            Export {exportFormat === 'both' ? 'DOCX + PDF' : exportFormat.toUpperCase()}
          </button>
        </div>
      </div>

      <OmrExportModal
        isOpen={showOmrModal}
        onClose={() => setShowOmrModal(false)}
        paper={paper}
        schoolName={schoolName}
      />

      {/* Scrollable Questions Area */}
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-4 md:p-6 print:overflow-visible print:p-0">
        <div className="max-w-3xl mx-auto animate-fadeInUp print:max-w-none">
          <div className="glass-card rounded-xl p-4 mb-5 text-center print:p-0 print:mb-2">
            <div className="w-14 h-14 rounded-full bg-white dark:bg-slate-900 border border-brand-border flex items-center justify-center mx-auto mb-3 shadow-soft p-1 ring-1 ring-black/5 dark:ring-white/10 print:hidden">
              <PhssjLogo className="w-full h-full rounded-full" />
            </div>
            <h1 className="text-lg font-bold text-brand-text-primary mb-1 print:text-sm print:mb-0.5">{schoolName}</h1>
            <h2 className="text-xl font-bold text-brand-text-primary mb-2 print:text-xs print:mb-1">{paper.title}</h2>
            <div className="flex flex-wrap justify-center gap-2 print:gap-1.5 print:text-[9pt]">
              <span className={chipClass}>Subject: {paper.subject}</span>
              <span className={chipClass}>Class: {paper.gradeLevel}</span>
              <span className={chipClass}>Total Marks: {paper.totalMarks}</span>
              <span className={chipClass}>Duration: {paper.durationMinutes} mins</span>
              {paper.omrMeta?.enabled && (
                <>
                  <span className={chipClass}>{paper.omrMeta.testNumber}</span>
                  <span className={chipClass}>Date: {paper.omrMeta.testDate}</span>
                  <span className="px-2 py-1 bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 rounded-md border border-blue-200 dark:border-blue-800 text-[11px] font-mono font-bold">
                    Code: {paper.omrMeta.testCode}
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="print:hidden">
            <McqOmrTestKitBanner
              paper={paper}
              schoolName={schoolName}
              onOpenOmrExport={() => setShowOmrModal(true)}
              onScanSheetsForPaper={onScanSheetsForPaper}
              onUpdatePaperMcqKey={handleUpdateMcqKey}
            />
          </div>

          {paper.sections.map((section, sIdx) => {
            const genericInstruction = sectionInstruction(section);
            const markingNote = paperSectionNote(paper, sIdx, section);
            return (
              <div key={sIdx} className="glass-card rounded-xl p-4 mb-4 hover:shadow-card-hover transition-shadow print:p-0 print:mb-2">
                <h3 className="text-lg font-bold text-brand-text-primary mb-1 print:text-xs print:mb-0.5">{section.title}</h3>
                {genericInstruction && <p className="text-sm text-brand-text-secondary mb-1 print:text-[9pt] print:mb-0.5">{genericInstruction}</p>}
                {markingNote && (
                  <p className="text-sm font-semibold text-brand-primary mb-4 print:text-[9pt] print:mb-1.5 print:text-black">{markingNote}</p>
                )}
                <div className="space-y-2 print:space-y-1">
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

                <div className="mt-4 pt-3 border-t border-brand-border/60 flex items-center justify-between print:hidden">
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

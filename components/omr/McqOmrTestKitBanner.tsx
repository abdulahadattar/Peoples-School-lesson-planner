import React, { useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Download,
  FileSpreadsheet,
  KeyRound,
  QrCode,
  ScanLine,
} from 'lucide-react';
import { GeneratedPaper } from '../../types';
import {
  formatAnswerKeyCsv,
  generateAnswerKeyPdf,
  triggerAnswerKeyPdfDownload,
} from '../../services/omr/answerKeyPdf';
import { extractPaperOmrData } from '../../services/omr/omrPdfGenerator';
import { formatTestFrequencyLabel } from '../../services/omr/classroomRanking';
import { registerOmrTestFromPaper } from '../../services/omr/testRegistry';
import { OMR_ANSWER_LETTERS } from '../../services/omr/types';

export interface McqOmrTestKitBannerProps {
  paper: GeneratedPaper;
  schoolName: string;
  onOpenOmrExport: () => void;
  onScanSheetsForPaper?: (testCode: string) => void;
  onUpdatePaperMcqKey?: (mcqIndex: number, nextLetter: string) => void;
}

export const McqOmrTestKitBanner: React.FC<McqOmrTestKitBannerProps> = ({
  paper,
  schoolName,
  onOpenOmrExport,
  onScanSheetsForPaper,
  onUpdatePaperMcqKey,
}) => {
  const [showKeyGrid, setShowKeyGrid] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const extracted = useMemo(() => extractPaperOmrData(paper), [paper]);
  const mcqQuestions = useMemo(
    () =>
      paper.sections.flatMap((sec) =>
        sec.questions.filter(
          (q) => q.type === 'mcq' || (Array.isArray(q.options) && q.options.length > 0)
        )
      ),
    [paper]
  );

  if (mcqQuestions.length === 0) return null;

  const ensureRegistered = () => {
    return registerOmrTestFromPaper(paper, {
      testCode: extracted.paperId,
      testFrequency: extracted.testFrequency,
      testNumber: extracted.testNumber,
      testDate: extracted.testDate,
      examType: extracted.examType,
      paperSnapshot: paper,
    });
  };

  const handleDownloadKeyPdf = async () => {
    const reg = ensureRegistered();
    const bytes = await generateAnswerKeyPdf({
      schoolName,
      subject: reg.subject,
      classLevel: reg.classLevel,
      title: reg.title,
      testCode: reg.testCode,
      testNumber: reg.testNumber,
      testDate: reg.testDate,
      questionCount: reg.questionCount,
      answerKey: reg.answerKey,
      questionSnippets: mcqQuestions.map((q) => q.question),
    });
    triggerAnswerKeyPdfDownload(bytes, reg.testCode);
    setStatusMessage(`Downloaded Answer Key PDF (${reg.testCode}).`);
  };

  const handleDownloadKeyCsv = () => {
    const reg = ensureRegistered();
    const csv = formatAnswerKeyCsv({
      schoolName,
      subject: reg.subject,
      classLevel: reg.classLevel,
      title: reg.title,
      testCode: reg.testCode,
      testNumber: reg.testNumber,
      testDate: reg.testDate,
      questionCount: reg.questionCount,
      answerKey: reg.answerKey,
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Answer_Key_${reg.testCode}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatusMessage(`Downloaded Answer Key CSV (${reg.testCode}).`);
  };

  const handleScanClick = () => {
    const reg = ensureRegistered();
    onScanSheetsForPaper?.(reg.testCode);
  };

  return (
    <div className="rounded-2xl border border-blue-500/30 bg-gradient-to-br from-blue-50/80 to-indigo-50/50 dark:from-blue-950/35 dark:to-slate-900/60 p-4 mb-5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <div className="p-2 rounded-xl bg-blue-600 text-white shrink-0">
            <QrCode className="w-4 h-4" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-bold text-brand-text-primary">
                {extracted.isMcqOnly ? formatTestFrequencyLabel(extracted.testFrequency) : 'Section A MCQs'} · Answer Key &amp; OMR
              </h3>
              <span className="px-2 py-0.5 rounded-md font-mono text-[11px] font-bold bg-white dark:bg-slate-800 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300">
                Code: {extracted.paperId}
              </span>
            </div>
            <p className="text-xs text-brand-text-secondary mt-0.5 tabular-nums">
              {extracted.testNumber} · Date: {extracted.testDate} · {mcqQuestions.length} MCQs · Key:{' '}
              <span className="font-mono font-semibold text-brand-text-primary">
                {extracted.answerKey.slice(0, 20)}
                {extracted.answerKey.length > 20 ? '…' : ''}
              </span>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowKeyGrid((s) => !s)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-brand-border bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-semibold text-brand-text-primary cursor-pointer"
          >
            <KeyRound className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            <span>{showKeyGrid ? 'Hide Key' : 'Answer Key'}</span>
            {showKeyGrid ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          <button
            type="button"
            id="download-answer-key-pdf-btn"
            onClick={handleDownloadKeyPdf}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-brand-border bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-semibold text-brand-text-primary cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            <span>Download Key (PDF)</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadKeyCsv}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-brand-border bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-semibold text-brand-text-primary cursor-pointer"
            title="Download Answer Key CSV"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            <span>Key CSV</span>
          </button>

          <button
            type="button"
            onClick={onOpenOmrExport}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-blue-600/30 bg-white dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-slate-700 text-xs font-semibold text-blue-700 dark:text-blue-300 cursor-pointer"
          >
            <QrCode className="w-3.5 h-3.5" />
            <span>Download OMR Sheets</span>
          </button>

          {onScanSheetsForPaper && (
            <button
              type="button"
              id="scan-sheets-for-paper-btn"
              onClick={handleScanClick}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm cursor-pointer transition-colors"
            >
              <ScanLine className="w-3.5 h-3.5" />
              <span>Scan &amp; Check OMR</span>
            </button>
          )}
        </div>
      </div>

      {showKeyGrid && (
        <div className="pt-2 border-t border-blue-200/70 dark:border-blue-800/40 space-y-2">
          <div className="flex items-center justify-between text-[11px] text-brand-text-secondary">
            <span>Generated Answer Key (automatically saved with Test Code {extracted.paperId})</span>
            {onUpdatePaperMcqKey && <span>Click a letter to adjust any MCQ key</span>}
          </div>
          <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-10 gap-1.5">
            {mcqQuestions.map((_, idx) => {
              const letter = extracted.answerKey[idx] || 'A';
              return (
                <div
                  key={idx}
                  className="rounded-lg border border-brand-border bg-white dark:bg-slate-900 px-2 py-1 flex items-center justify-between text-[11px] font-mono"
                >
                  <span className="text-brand-text-tertiary">Q{idx + 1}</span>
                  {onUpdatePaperMcqKey ? (
                    <button
                      type="button"
                      aria-label={`Answer key for Q${idx + 1}: ${letter}`}
                      onClick={() => {
                        const curIdx = OMR_ANSWER_LETTERS.indexOf(letter as any);
                        const next = OMR_ANSWER_LETTERS[(curIdx + 1) % OMR_ANSWER_LETTERS.length];
                        onUpdatePaperMcqKey(idx, next);
                      }}
                      title="Click to cycle A → B → C → D"
                      className="px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/70 font-bold text-blue-700 dark:text-blue-300 transition-colors cursor-pointer"
                    >
                      {letter}
                    </button>
                  ) : (
                    <strong className="text-blue-700 dark:text-blue-300">{letter}</strong>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {statusMessage && (
        <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300">{statusMessage}</p>
      )}
    </div>
  );
};

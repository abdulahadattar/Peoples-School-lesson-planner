import React from 'react';

export interface MarkDistribution {
  mcqMarks: number;
  shortMarks: number;
  longMarks: number;
  shortAttempt: number;
  longAttempt: number;
  totalQuestionMarks: number;
}

export interface PaperMarkSummaryProps {
  markDistribution: MarkDistribution;
  totalMarks: number;
  mcqCount: number;
  shortQuestionCount: number;
  longQuestionCount: number;
  shortMarksPerQuestion: number;
  longMarksPerQuestion: number;
  balanceFeedback: string | null;
}

export const PaperMarkSummary: React.FC<PaperMarkSummaryProps> = ({
  markDistribution,
  totalMarks,
  mcqCount,
  shortQuestionCount,
  longQuestionCount,
  shortMarksPerQuestion,
  longMarksPerQuestion,
  balanceFeedback,
}) => {
  const isBalanced = markDistribution.totalQuestionMarks === totalMarks;

  return (
    <div className="rounded-2xl border border-brand-border bg-slate-50/80 dark:bg-slate-900/40 p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className="text-xs font-bold text-brand-text-primary">
          Exam Paper Mark Distribution Blueprint
        </span>
        <span
          className={`text-xs font-mono font-bold px-2 py-0.5 rounded-md ${
            isBalanced
              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
              : 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
          }`}
        >
          Total Configured: {markDistribution.totalQuestionMarks} / {totalMarks} Marks
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
        <div className="p-2.5 rounded-xl bg-white dark:bg-brand-surface border border-brand-border">
          <div className="text-brand-text-tertiary text-[10px] font-semibold uppercase">Section A (MCQs)</div>
          <div className="font-bold text-brand-text-primary mt-0.5">
            {mcqCount} MCQs × 1 Mark = <span className="text-brand-primary">{markDistribution.mcqMarks}M</span>
          </div>
        </div>

        <div className="p-2.5 rounded-xl bg-white dark:bg-brand-surface border border-brand-border">
          <div className="text-brand-text-tertiary text-[10px] font-semibold uppercase">Section B (Short Answers)</div>
          <div className="font-bold text-brand-text-primary mt-0.5">
            Attempt {markDistribution.shortAttempt} of {shortQuestionCount} × {shortMarksPerQuestion}M ={' '}
            <span className="text-brand-primary">{markDistribution.shortMarks}M</span>
          </div>
        </div>

        <div className="p-2.5 rounded-xl bg-white dark:bg-brand-surface border border-brand-border">
          <div className="text-brand-text-tertiary text-[10px] font-semibold uppercase">Section C (Descriptive / Long)</div>
          <div className="font-bold text-brand-text-primary mt-0.5">
            Attempt {markDistribution.longAttempt} of {longQuestionCount} × {longMarksPerQuestion}M ={' '}
            <span className="text-brand-primary">{markDistribution.longMarks}M</span>
          </div>
        </div>
      </div>

      {balanceFeedback && (
        <div className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 p-2.5 rounded-xl border border-amber-200 dark:border-amber-800/50 flex items-center gap-2">
          <span>⚠️</span>
          <span>{balanceFeedback}</span>
        </div>
      )}
    </div>
  );
};

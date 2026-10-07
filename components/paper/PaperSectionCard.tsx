import React from 'react';
import { NumberField } from '../ui/NumberField';

export interface PaperSectionCardProps {
  sectionLetter: 'A' | 'B' | 'C';
  title: string;
  badgeColor: string;
  marksSummary: string;
  questionCount: number;
  attemptCount: number;
  marksPerQuestion: number;
  isMcq?: boolean;
  onQuestionCountChange: (val: number) => void;
  onAttemptCountChange?: (val: number) => void;
  onMarksPerQuestionChange?: (val: number) => void;
}

export const PaperSectionCard: React.FC<PaperSectionCardProps> = ({
  sectionLetter,
  title,
  badgeColor,
  marksSummary,
  questionCount,
  attemptCount,
  marksPerQuestion,
  isMcq,
  onQuestionCountChange,
  onAttemptCountChange,
  onMarksPerQuestionChange,
}) => {
  const optionalCount = Math.max(0, questionCount - attemptCount);

  return (
    <div className="p-4 rounded-xl border border-black/[0.06] dark:border-white/[0.08] bg-slate-50/60 dark:bg-slate-900/30 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className={`w-6 h-6 rounded-md flex items-center justify-center font-bold text-xs ${badgeColor}`}
          >
            {sectionLetter}
          </span>
          <span className="text-sm font-semibold text-brand-text-primary">
            {title}
          </span>
        </div>
        <span className="text-xs font-mono tabular-nums font-bold text-slate-700 dark:text-slate-300">
          {marksSummary}
        </span>
      </div>

      {isMcq ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <NumberField
            label="Total MCQs"
            value={questionCount}
            min={0}
            max={50}
            hint="Multiple choice questions"
            onChange={onQuestionCountChange}
          />
          <div className="flex items-center p-3 rounded-lg bg-white dark:bg-slate-800/60 border border-black/[0.04] dark:border-white/[0.06] text-xs text-slate-600 dark:text-slate-400">
            <span>Each MCQ carries exactly 1 mark. All are compulsory.</span>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <NumberField
              label="Printed Questions"
              value={questionCount}
              min={0}
              max={25}
              hint="Questions printed on paper"
              onChange={onQuestionCountChange}
            />
            {onAttemptCountChange && (
              <NumberField
                label="Questions to Attempt"
                value={attemptCount}
                min={0}
                max={Math.max(0, questionCount)}
                hint="Mandatory student answers"
                onChange={onAttemptCountChange}
              />
            )}
            {onMarksPerQuestionChange && (
              <NumberField
                label="Marks Per Question"
                value={marksPerQuestion}
                min={1}
                max={25}
                hint="Marks per attempted question"
                onChange={onMarksPerQuestionChange}
              />
            )}
          </div>

          <div className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-white dark:bg-slate-800/60 border border-black/[0.04] dark:border-white/[0.06] text-xs">
            <span className="text-slate-600 dark:text-slate-400">
              {questionCount === 0 ? (
                'No questions included in this section.'
              ) : optionalCount > 0 ? (
                <span>
                  Attempt{' '}
                  <strong className="text-slate-900 dark:text-white">
                    {attemptCount} of {questionCount}
                  </strong>{' '}
                  questions ({optionalCount} optional choice{optionalCount > 1 ? 's' : ''}).
                </span>
              ) : (
                <span>
                  All <strong className="text-slate-900 dark:text-white">{questionCount}</strong>{' '}
                  questions are compulsory.
                </span>
              )}
            </span>
            {attemptCount > 0 && (
              <span className="font-mono tabular-nums text-[11px] font-bold shrink-0 text-slate-700 dark:text-slate-300">
                {attemptCount} × {marksPerQuestion}M = {attemptCount * marksPerQuestion}M
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
};

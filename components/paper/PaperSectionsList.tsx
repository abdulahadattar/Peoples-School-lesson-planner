import React from 'react';
import { PaperFormat } from '../../types';
import { PaperSectionCard } from './PaperSectionCard';

export interface MarkDistribution {
  mcqMarks: number;
  shortMarks: number;
  longMarks: number;
  shortAttempt: number;
  longAttempt: number;
  totalQuestionMarks: number;
}

export interface PaperSectionsListProps {
  paperFormat: PaperFormat;
  markDistribution: MarkDistribution;
  mcqCount: number;
  mcqMarksPerQuestion: number;
  setMcqCount: (n: number) => void;
  shortQuestionCount: number;
  shortAttemptCount: number;
  shortMarksPerQuestion: number;
  setShortQuestionCount: (n: number) => void;
  setShortAttemptCount: (n: number) => void;
  setShortMarksPerQuestion: (n: number) => void;
  longQuestionCount: number;
  longAttemptCount: number;
  longMarksPerQuestion: number;
  setLongQuestionCount: (n: number) => void;
  setLongAttemptCount: (n: number) => void;
  setLongMarksPerQuestion: (n: number) => void;
}

export const PaperSectionsList: React.FC<PaperSectionsListProps> = ({
  paperFormat,
  markDistribution,
  mcqCount,
  mcqMarksPerQuestion,
  setMcqCount,
  shortQuestionCount,
  shortAttemptCount,
  shortMarksPerQuestion,
  setShortQuestionCount,
  setShortAttemptCount,
  setShortMarksPerQuestion,
  longQuestionCount,
  longAttemptCount,
  longMarksPerQuestion,
  setLongQuestionCount,
  setLongAttemptCount,
  setLongMarksPerQuestion,
}) => {
  const isMcqOnly = paperFormat === 'mcq_only';
  const showShort = paperFormat === 'full' || paperFormat === 'section_ab';
  const showLong = paperFormat === 'full';

  return (
    <div className="space-y-3">
      <PaperSectionCard
        sectionLetter="A"
        title={isMcqOnly ? 'Section A — MCQ Unit Test' : 'Section A — Multiple Choice Questions (MCQs)'}
        badgeColor="bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300"
        marksSummary={`${markDistribution.mcqMarks} Marks (${mcqCount} × ${mcqMarksPerQuestion}M)`}
        questionCount={mcqCount}
        attemptCount={mcqCount}
        marksPerQuestion={mcqMarksPerQuestion}
        minQuestionCount={isMcqOnly ? 5 : 0}
        maxQuestionCount={isMcqOnly ? 100 : 50}
        isMcq
        onQuestionCountChange={setMcqCount}
      />

      {showShort && (
        <PaperSectionCard
          sectionLetter="B"
          title="Section B — Short Answer Questions"
          badgeColor="bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300"
          marksSummary={`${markDistribution.shortMarks} Marks (${markDistribution.shortAttempt} × ${shortMarksPerQuestion}M)`}
          questionCount={shortQuestionCount}
          attemptCount={shortAttemptCount}
          marksPerQuestion={shortMarksPerQuestion}
          onQuestionCountChange={setShortQuestionCount}
          onAttemptCountChange={setShortAttemptCount}
          onMarksPerQuestionChange={setShortMarksPerQuestion}
        />
      )}

      {showLong && (
        <PaperSectionCard
          sectionLetter="C"
          title="Section C — Descriptive / Long Questions"
          badgeColor="bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300"
          marksSummary={`${markDistribution.longMarks} Marks (${markDistribution.longAttempt} × ${longMarksPerQuestion}M)`}
          questionCount={longQuestionCount}
          attemptCount={longAttemptCount}
          marksPerQuestion={longMarksPerQuestion}
          onQuestionCountChange={setLongQuestionCount}
          onAttemptCountChange={setLongAttemptCount}
          onMarksPerQuestionChange={setLongMarksPerQuestion}
        />
      )}
    </div>
  );
};

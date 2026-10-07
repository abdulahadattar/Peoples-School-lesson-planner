import React from 'react';
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
  markDistribution: MarkDistribution;
  mcqCount: number;
  setMcqCount: (n: number) => void;
  shortQuestionCount: number;
  setShortQuestionCount: (n: number) => void;
  shortAttemptCount: number;
  setShortAttemptCount: (n: number) => void;
  shortMarksPerQuestion: number;
  setShortMarksPerQuestion: (n: number) => void;
  longQuestionCount: number;
  setLongQuestionCount: (n: number) => void;
  longAttemptCount: number;
  setLongAttemptCount: (n: number) => void;
  longMarksPerQuestion: number;
  setLongMarksPerQuestion: (n: number) => void;
}

export const PaperSectionsList: React.FC<PaperSectionsListProps> = ({
  markDistribution,
  mcqCount,
  setMcqCount,
  shortQuestionCount,
  setShortQuestionCount,
  shortAttemptCount,
  setShortAttemptCount,
  shortMarksPerQuestion,
  setShortMarksPerQuestion,
  longQuestionCount,
  setLongQuestionCount,
  longAttemptCount,
  setLongAttemptCount,
  longMarksPerQuestion,
  setLongMarksPerQuestion,
}) => {
  return (
    <div className="space-y-4">
      <PaperSectionCard
        sectionLetter="A"
        title="Section A: Multiple Choice Questions (MCQs)"
        badgeColor="bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300"
        marksSummary={`${markDistribution.mcqMarks} Marks (${mcqCount} × 1M)`}
        questionCount={mcqCount}
        attemptCount={mcqCount}
        marksPerQuestion={1}
        isMcq
        onQuestionCountChange={setMcqCount}
      />

      <PaperSectionCard
        sectionLetter="B"
        title="Section B: Short Answer Questions"
        badgeColor="bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300"
        marksSummary={`${markDistribution.shortMarks} Marks (${markDistribution.shortAttempt} × ${shortMarksPerQuestion}M)`}
        questionCount={shortQuestionCount}
        attemptCount={shortAttemptCount}
        marksPerQuestion={shortMarksPerQuestion}
        onQuestionCountChange={(v) => {
          setShortQuestionCount(v);
          setShortAttemptCount(Math.min(shortAttemptCount, v));
        }}
        onAttemptCountChange={setShortAttemptCount}
        onMarksPerQuestionChange={setShortMarksPerQuestion}
      />

      <PaperSectionCard
        sectionLetter="C"
        title="Section C: Detailed / Long Questions"
        badgeColor="bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300"
        marksSummary={`${markDistribution.longMarks} Marks (${markDistribution.longAttempt} × ${longMarksPerQuestion}M)`}
        questionCount={longQuestionCount}
        attemptCount={longAttemptCount}
        marksPerQuestion={longMarksPerQuestion}
        onQuestionCountChange={(v) => {
          setLongQuestionCount(v);
          setLongAttemptCount(Math.min(longAttemptCount, v));
        }}
        onAttemptCountChange={setLongAttemptCount}
        onMarksPerQuestionChange={setLongMarksPerQuestion}
      />
    </div>
  );
};

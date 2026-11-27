import React from 'react';
import { CLASSROOM_MCQ_MAX, CLASSROOM_MCQ_MIN } from '../../services/omr/classroomRanking';
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
}

export const PaperSectionsList: React.FC<PaperSectionsListProps> = ({
  markDistribution,
  mcqCount,
  setMcqCount,
}) => {
  return (
    <div className="space-y-3">
      <PaperSectionCard
        sectionLetter="A"
        title="Classroom MCQ Test (30–50 Questions)"
        badgeColor="bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300"
        marksSummary={`${markDistribution.mcqMarks} Marks (${mcqCount} × 1M)`}
        questionCount={mcqCount}
        attemptCount={mcqCount}
        marksPerQuestion={1}
        minQuestionCount={CLASSROOM_MCQ_MIN}
        maxQuestionCount={CLASSROOM_MCQ_MAX}
        isMcq
        onQuestionCountChange={setMcqCount}
      />
    </div>
  );
};

import type { ClassroomTestFrequency } from './types';

export const CLASSROOM_MCQ_MIN = 30;
export const CLASSROOM_MCQ_MAX = 50;

export function clampClassroomMcqCount(rawCount: number): number {
  const n = Math.round(Number(rawCount) || CLASSROOM_MCQ_MIN);
  return Math.max(CLASSROOM_MCQ_MIN, Math.min(CLASSROOM_MCQ_MAX, n));
}

export function formatTestFrequencyLabel(
  frequency?: ClassroomTestFrequency | string
): string {
  return frequency === 'monthly' ? 'Monthly Class Test' : 'Weekly Class Test';
}

export function formatTestFrequencyBadge(
  frequency?: ClassroomTestFrequency | string
): string {
  return frequency === 'monthly' ? 'MONTHLY TEST' : 'WEEKLY TEST';
}

export interface RankableStudentRow {
  grNo: string;
  score: number;
  percentage: number;
  rank?: number;
}

/**
 * Sorts student rows by score descending, percentage descending, then numeric GR ascending,
 * assigning standard competition ranks (e.g. 1, 2, 2, 4 on a tie for 2nd place).
 */
export function computeCompetitionRanks<T extends RankableStudentRow>(
  rows: T[]
): Array<T & { rank: number }> {
  const sorted = [...rows].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.percentage !== a.percentage) return b.percentage - a.percentage;
    const numA = Number(a.grNo);
    const numB = Number(b.grNo);
    if (!Number.isNaN(numA) && !Number.isNaN(numB) && numA !== numB) {
      return numA - numB;
    }
    return String(a.grNo).localeCompare(String(b.grNo));
  });

  let currentRank = 1;
  return sorted.map((row, index) => {
    if (index > 0) {
      const prev = sorted[index - 1];
      if (row.score !== prev.score || row.percentage !== prev.percentage) {
        currentRank = index + 1;
      }
    }
    return {
      ...row,
      rank: currentRank,
    };
  });
}

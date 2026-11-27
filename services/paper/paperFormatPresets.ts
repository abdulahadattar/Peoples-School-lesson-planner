import { ClassroomTestFrequency, PaperFormat } from '../../types';

export interface PaperPreset {
  id: string;
  format: PaperFormat;
  name: string;
  total: number;
  duration: number;
  mcq: number;
  mcqMarks: number;
  shortCount: number;
  shortAttempt: number;
  shortMarks: number;
  longCount: number;
  longAttempt: number;
  longMarks: number;
  testFrequency: ClassroomTestFrequency;
  formulaLabel: string;
}

export const PAPER_PRESETS: PaperPreset[] = [
  // Full Paper (Section A + B + C)
  {
    id: 'full-100',
    format: 'full',
    name: 'Board Paper (100M)',
    total: 100,
    duration: 180,
    mcq: 20,
    mcqMarks: 1,
    shortCount: 14,
    shortAttempt: 10,
    shortMarks: 4,
    longCount: 6,
    longAttempt: 4,
    longMarks: 10,
    testFrequency: 'monthly',
    formulaLabel: '20M + 10/14×4 + 4/6×10',
  },
  {
    id: 'full-75',
    format: 'full',
    name: 'Full Exam (75M)',
    total: 75,
    duration: 150,
    mcq: 15,
    mcqMarks: 1,
    shortCount: 13,
    shortAttempt: 9,
    shortMarks: 4,
    longCount: 5,
    longAttempt: 3,
    longMarks: 8,
    testFrequency: 'monthly',
    formulaLabel: '15M + 9/13×4 + 3/5×8',
  },
  {
    id: 'full-50',
    format: 'full',
    name: 'Mid-Term (50M)',
    total: 50,
    duration: 120,
    mcq: 10,
    mcqMarks: 1,
    shortCount: 9,
    shortAttempt: 6,
    shortMarks: 4,
    longCount: 3,
    longAttempt: 2,
    longMarks: 8,
    testFrequency: 'monthly',
    formulaLabel: '10M + 6/9×4 + 2/3×8',
  },
  {
    id: 'full-40',
    format: 'full',
    name: 'Unit Exam (40M)',
    total: 40,
    duration: 90,
    mcq: 10,
    mcqMarks: 1,
    shortCount: 7,
    shortAttempt: 5,
    shortMarks: 3,
    longCount: 4,
    longAttempt: 3,
    longMarks: 5,
    testFrequency: 'monthly',
    formulaLabel: '10M + 5/7×3 + 3/4×5',
  },
  // Section A + Section B
  {
    id: 'ab-50',
    format: 'section_ab',
    name: 'Half-Term A+B (50M)',
    total: 50,
    duration: 75,
    mcq: 14,
    mcqMarks: 1,
    shortCount: 12,
    shortAttempt: 9,
    shortMarks: 4,
    longCount: 0,
    longAttempt: 0,
    longMarks: 0,
    testFrequency: 'monthly',
    formulaLabel: '14 MCQs + 9/12 Short',
  },
  {
    id: 'ab-40',
    format: 'section_ab',
    name: 'Term Quiz A+B (40M)',
    total: 40,
    duration: 60,
    mcq: 10,
    mcqMarks: 1,
    shortCount: 12,
    shortAttempt: 10,
    shortMarks: 3,
    longCount: 0,
    longAttempt: 0,
    longMarks: 0,
    testFrequency: 'monthly',
    formulaLabel: '10 MCQs + 10/12 Short',
  },
  {
    id: 'ab-30',
    format: 'section_ab',
    name: 'Unit Paper A+B (30M)',
    total: 30,
    duration: 45,
    mcq: 10,
    mcqMarks: 1,
    shortCount: 7,
    shortAttempt: 5,
    shortMarks: 4,
    longCount: 0,
    longAttempt: 0,
    longMarks: 0,
    testFrequency: 'weekly',
    formulaLabel: '10 MCQs + 5/7 Short',
  },
  {
    id: 'ab-25',
    format: 'section_ab',
    name: 'Quick Test A+B (25M)',
    total: 25,
    duration: 40,
    mcq: 9,
    mcqMarks: 1,
    shortCount: 6,
    shortAttempt: 4,
    shortMarks: 4,
    longCount: 0,
    longAttempt: 0,
    longMarks: 0,
    testFrequency: 'weekly',
    formulaLabel: '9 MCQs + 4/6 Short',
  },
  // MCQ-Only Unit Tests
  {
    id: 'mcq-20',
    format: 'mcq_only',
    name: 'Chapter Quiz (20 MCQs)',
    total: 20,
    duration: 25,
    mcq: 20,
    mcqMarks: 1,
    shortCount: 0,
    shortAttempt: 0,
    shortMarks: 0,
    longCount: 0,
    longAttempt: 0,
    longMarks: 0,
    testFrequency: 'weekly',
    formulaLabel: '20 MCQs · Weekly',
  },
  {
    id: 'weekly-30',
    format: 'mcq_only',
    name: 'Weekly Test (30 MCQs)',
    total: 30,
    duration: 30,
    mcq: 30,
    mcqMarks: 1,
    shortCount: 0,
    shortAttempt: 0,
    shortMarks: 0,
    longCount: 0,
    longAttempt: 0,
    longMarks: 0,
    testFrequency: 'weekly',
    formulaLabel: '30 MCQs · Weekly',
  },
  {
    id: 'monthly-40',
    format: 'mcq_only',
    name: 'Unit Test (40 MCQs)',
    total: 40,
    duration: 45,
    mcq: 40,
    mcqMarks: 1,
    shortCount: 0,
    shortAttempt: 0,
    shortMarks: 0,
    longCount: 0,
    longAttempt: 0,
    longMarks: 0,
    testFrequency: 'monthly',
    formulaLabel: '40 MCQs · Monthly',
  },
  {
    id: 'monthly-50',
    format: 'mcq_only',
    name: 'Monthly Test (50 MCQs)',
    total: 50,
    duration: 50,
    mcq: 50,
    mcqMarks: 1,
    shortCount: 0,
    shortAttempt: 0,
    shortMarks: 0,
    longCount: 0,
    longAttempt: 0,
    longMarks: 0,
    testFrequency: 'monthly',
    formulaLabel: '50 MCQs · Monthly',
  },
];

export function getPresetsForFormat(format: PaperFormat): PaperPreset[] {
  return PAPER_PRESETS.filter((p) => p.format === format);
}

export function getDefaultPresetForFormat(format: PaperFormat): PaperPreset {
  if (format === 'full') return PAPER_PRESETS.find((p) => p.id === 'full-75')!;
  if (format === 'section_ab') return PAPER_PRESETS.find((p) => p.id === 'ab-30')!;
  return PAPER_PRESETS.find((p) => p.id === 'weekly-30')!;
}

export interface BalancedPaperSections {
  mcqCount: number;
  mcqMarksPerQuestion: number;
  shortQuestionCount: number;
  shortAttemptCount: number;
  shortMarksPerQuestion: number;
  longQuestionCount: number;
  longAttemptCount: number;
  longMarksPerQuestion: number;
  totalMarks: number;
}

/**
 * Computes balanced section counts that sum exactly to `targetTotalMarks`
 * for the chosen paper format, preserving choice rules where appropriate.
 */
export function balanceSectionsForTotalMarks(
  format: PaperFormat,
  rawTargetMarks: number
): BalancedPaperSections {
  const target = Math.max(5, Math.min(200, Math.round(Number(rawTargetMarks) || 30)));

  if (format === 'mcq_only') {
    const mcq = Math.max(5, Math.min(100, target));
    return {
      mcqCount: mcq,
      mcqMarksPerQuestion: 1,
      shortQuestionCount: 0,
      shortAttemptCount: 0,
      shortMarksPerQuestion: 0,
      longQuestionCount: 0,
      longAttemptCount: 0,
      longMarksPerQuestion: 0,
      totalMarks: mcq,
    };
  }

  if (format === 'section_ab') {
    const shortMarks = target >= 45 ? 4 : target >= 20 ? 3 : 2;
    const approxShortBudget = Math.round(target * 0.72);
    const shortAttempt = Math.max(1, Math.floor(approxShortBudget / shortMarks));
    const shortTotal = shortAttempt * shortMarks;
    const mcqCount = Math.max(0, target - shortTotal);
    const shortCount = shortAttempt + (shortAttempt >= 4 ? 2 : 1);
    return {
      mcqCount,
      mcqMarksPerQuestion: 1,
      shortQuestionCount: shortCount,
      shortAttemptCount: shortAttempt,
      shortMarksPerQuestion: shortMarks,
      longQuestionCount: 0,
      longAttemptCount: 0,
      longMarksPerQuestion: 0,
      totalMarks: mcqCount + shortTotal,
    };
  }

  // Full paper (Section A + B + C)
  const longMarks = target >= 80 ? 10 : target >= 45 ? 8 : 5;
  const shortMarks = target >= 45 ? 4 : 3;
  const longAttempt = Math.max(1, Math.min(6, Math.round((target * 0.34) / longMarks)));
  const longTotal = longAttempt * longMarks;
  const remainingAfterLong = Math.max(2, target - longTotal);
  const mcqTarget = Math.max(5, Math.min(25, Math.round(target * 0.2)));
  const maxShortBudget = Math.max(0, remainingAfterLong - 2);
  const shortAttempt = Math.max(1, Math.min(14, Math.floor((remainingAfterLong - mcqTarget) / shortMarks)));
  const shortTotal = Math.min(maxShortBudget, shortAttempt * shortMarks);
  const effectiveShortAttempt = Math.max(1, Math.floor(shortTotal / shortMarks));
  const finalShortTotal = effectiveShortAttempt * shortMarks;
  const mcqCount = Math.max(1, target - longTotal - finalShortTotal);

  return {
    mcqCount,
    mcqMarksPerQuestion: 1,
    shortQuestionCount: effectiveShortAttempt + (effectiveShortAttempt >= 5 ? 3 : 2),
    shortAttemptCount: effectiveShortAttempt,
    shortMarksPerQuestion: shortMarks,
    longQuestionCount: longAttempt + (longAttempt >= 3 ? 2 : 1),
    longAttemptCount: longAttempt,
    longMarksPerQuestion: longMarks,
    totalMarks: mcqCount + finalShortTotal + longTotal,
  };
}

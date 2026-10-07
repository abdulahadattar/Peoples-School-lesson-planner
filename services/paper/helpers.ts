import { curriculumData } from '../../curriculum';
import { PaperDifficulty } from '../../types';

export const getGradeName = (gradeId: string): string => {
  const cls = curriculumData.classes.find((c) => c.id === gradeId);
  return cls?.name || gradeId;
};

export const getSubjectName = (gradeId: string, subjectId: string): string => {
  const cls = curriculumData.classes.find((c) => c.id === gradeId);
  const subject = cls?.subjects.find((s) => s.id === subjectId);
  return subject?.name || subjectId;
};

export const getChapterName = (
  gradeId: string,
  subjectId: string,
  chapterId: string
): string => {
  const cls = curriculumData.classes.find((c) => c.id === gradeId);
  const subject = cls?.subjects.find((s) => s.id === subjectId);
  const chapter = subject?.chapters.find((ch) => ch.id === chapterId);
  return chapter?.name || chapterId;
};

export const getChapterSLOs = (
  gradeId: string,
  subjectId: string,
  chapterId: string
): string[] => {
  const cls = curriculumData.classes.find((c) => c.id === gradeId);
  const subject = cls?.subjects.find((s) => s.id === subjectId);
  const chapter = subject?.chapters.find((ch) => ch.id === chapterId);
  return chapter?.slos.map((s) => `${s.id}: ${s.text}`) || [];
};

export function buildDifficultyDescription(difficulty: PaperDifficulty): string {
  if (difficulty === 'easy') {
    return 'Easy — favour Knowledge & Understanding questions with direct recall and simple calculations';
  }
  if (difficulty === 'hard') {
    return 'Hard — weight towards Application, Analysis & Evaluation with multi-step problems and unfamiliar contexts';
  }
  return 'Medium — a balanced mix of Knowledge, Understanding and Application questions';
}

export function buildSectionRules(
  isMcqOnly: boolean,
  mcqCount: number,
  mcqMarksPerQuestion: number,
  mcqMarks: number,
  shortQuestionCount: number,
  shortMarksPerQuestion: number,
  attemptShort: number,
  shortMarks: number,
  longQuestionCount: number,
  longMarksPerQuestion: number,
  attemptLong: number,
  longMarks: number
): string {
  if (isMcqOnly) {
    return `
    - Section A (MCQs Only): Generate exactly ${mcqCount} high-quality Multiple Choice Questions covering all concepts/SLOs of the whole chapter. Each question carries ${mcqMarksPerQuestion} mark. Total = ${mcqMarks} marks.
    - Do NOT generate Section B or Section C. Output only Section A in the sections array.`;
  }
  return `
    - Section A (MCQs): ${mcqCount} questions x ${mcqMarksPerQuestion} mark each = ${mcqMarks} marks (all are attempted).
    ${shortQuestionCount > 0 ? `- Section B (Short Questions): generate exactly ${shortQuestionCount} short questions x ${shortMarksPerQuestion} marks each; students attempt any ${attemptShort} of them = ${shortMarks} marks.` : ''}
    ${longQuestionCount > 0 ? `- Section C (Long Questions): generate exactly ${longQuestionCount} long questions x ${longMarksPerQuestion} marks each; students attempt any ${attemptLong} of them = ${longMarks} marks.` : ''}
    ${shortQuestionCount - attemptShort > 0 || longQuestionCount - attemptLong > 0 ? `- The optional (non-attempted) questions (${shortQuestionCount - attemptShort > 0 ? `${shortQuestionCount - attemptShort} short optional` : ''}${shortQuestionCount - attemptShort > 0 && longQuestionCount - attemptLong > 0 ? ', ' : ''}${longQuestionCount - attemptLong > 0 ? `${longQuestionCount - attemptLong} long optional` : ''}) still appear on the paper for student choice.` : ''}`;
}

import { GeneratedPaper, PaperConfig } from '../../types';
import { generateExamPaper, reviseExamPaper } from '../../services/paperService';
import { saveExamPaperToDb } from '../../services/storageService';

export async function generateExamPaperAction(
  config: PaperConfig,
  addLog: (msg: string) => void,
  setProgress: (prog: { current: number; total: number } | null) => void,
  setStatusMessage: (msg: string) => void
): Promise<GeneratedPaper> {
  setProgress({ current: 1, total: 3 });
  setStatusMessage('Generating questions with AI...');
  addLog('Progress 1/3: Generating questions with AI model...');

  const paper = await generateExamPaper(
    config.gradeId,
    config.subjectId,
    config.chapterId,
    config.totalMarks,
    config.mcqCount,
    config.shortQuestionCount,
    config.shortAttemptCount,
    config.longQuestionCount,
    config.longAttemptCount,
    config.durationMinutes,
    config.difficulty || 'medium',
    addLog,
    config.shortMarksPerQuestion || 2,
    config.longMarksPerQuestion || 4,
    1
  );

  setProgress({ current: 2, total: 3 });
  setStatusMessage('Formatting document...');
  addLog('Progress 2/3: Formatting exam paper document...');

  setProgress({ current: 3, total: 3 });
  setStatusMessage('Complete!');
  addLog('Progress 3/3: Paper generation complete!');

  saveExamPaperToDb(paper).catch((err) =>
    console.error('Failed to auto-save paper to DB:', err)
  );

  return paper;
}

export async function reviseExamPaperAction(
  currentPaper: GeneratedPaper,
  revisionPrompt: string,
  addLog: (msg: string) => void
): Promise<GeneratedPaper> {
  addLog(`Revision instructions: "${revisionPrompt}"`);
  const revised = await reviseExamPaper(currentPaper, revisionPrompt, addLog);
  saveExamPaperToDb(revised).catch((err) =>
    console.error('Failed to auto-save revised paper to DB:', err)
  );
  addLog('\n✓ Paper revised successfully!');
  return revised;
}

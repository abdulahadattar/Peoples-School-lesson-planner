import { GeneratedPaper, PaperConfig, TeacherInfo } from '../../types';
import { auditAndRefinePaper, generateExamPaper, reviseExamPaper } from '../../services/paperService';
import { saveExamPaperToDb } from '../../services/storageService';
import { isMcqOnlyPaper, registerOmrTestFromPaper } from '../../services/omr/testRegistry';

function readStoredMathScale(): number {
  if (typeof localStorage === 'undefined') return 85;
  const saved = Number(localStorage.getItem('phssj_math_scale'));
  return Number.isFinite(saved) && saved >= 70 ? saved : 85;
}

export async function generateExamPaperAction(
  config: PaperConfig,
  addLog: (msg: string) => void,
  setProgress: (prog: { current: number; total: number } | null) => void,
  setStatusMessage: (msg: string) => void,
  teacherInfo?: TeacherInfo
): Promise<GeneratedPaper> {
  setProgress({ current: 1, total: 4 });
  setStatusMessage('Reading chapter & preparing questions...');
  addLog('Reading chapter and preparing exam questions...');

  const draftPaper = await generateExamPaper(
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
    (msg) => {
      if (msg.startsWith('Reading chapter:') || msg.startsWith('Chapter textbook') || msg.startsWith('Using syllabus')) {
        addLog(msg);
      }
    },
    config.shortMarksPerQuestion || 2,
    config.longMarksPerQuestion || 4,
    config.mcqMarksPerQuestion || 1
  );

  setProgress({ current: 2, total: 4 });
  setStatusMessage('Checking formulas, marks & answer key...');
  addLog('Checking questions, formulas, and answer key...');

  const paper = await auditAndRefinePaper(draftPaper, {
    teacherInfo,
    mathScale: readStoredMathScale(),
    maxPasses: 2,
  });

  setProgress({ current: 3, total: 4 });
  setStatusMessage('Preparing printable paper & answer key...');
  addLog('Formatting printable paper and answer key...');

  const isMcqOnly =
    (config.shortQuestionCount === 0 && config.longQuestionCount === 0 && config.mcqCount > 0) ||
    isMcqOnlyPaper(paper);
  const shouldPairOmr = (config.omrMeta?.enabled ?? isMcqOnly) && config.mcqCount > 0;

  if (shouldPairOmr) {
    const reg = registerOmrTestFromPaper(paper, {
      testCode: config.omrMeta?.testCode,
      testFrequency: config.omrMeta?.testFrequency || 'weekly',
      testNumber: config.omrMeta?.testNumber,
      testDate: config.omrMeta?.testDate,
      examType: config.omrMeta?.examType,
      paperSnapshot: paper,
    });
    addLog(`✓ Linked Test Code: ${reg.testCode} (${reg.testNumber})`);
  }

  setProgress({ current: 4, total: 4 });
  setStatusMessage('Question paper is ready!');
  addLog('✓ Question paper ready to view and print.');

  try {
    const saved = await saveExamPaperToDb(paper, teacherInfo);
    paper.savedPaperId = saved.id;
    if (shouldPairOmr && paper.omrMeta?.enabled) {
      registerOmrTestFromPaper(paper, {
        ...paper.omrMeta,
        paperSnapshot: paper,
      });
    }
  } catch (err) {
    console.error('Failed to auto-save paper to DB:', err);
  }

  return paper;
}

export async function reviseExamPaperAction(
  currentPaper: GeneratedPaper,
  revisionPrompt: string,
  addLog: (msg: string) => void,
  teacherInfo?: TeacherInfo
): Promise<GeneratedPaper> {
  addLog(`Revision instructions: "${revisionPrompt}"`);
  const draftRevised = await reviseExamPaper(currentPaper, revisionPrompt, addLog);

  addLog('Verifying updated paper...');
  const revised = await auditAndRefinePaper(draftRevised, {
    teacherInfo,
    mathScale: readStoredMathScale(),
    maxPasses: 2,
  });

  if (currentPaper.omrMeta?.enabled || isMcqOnlyPaper(revised)) {
    registerOmrTestFromPaper(revised, {
      ...currentPaper.omrMeta,
      paperSnapshot: revised,
    });
  }
  try {
    const saved = await saveExamPaperToDb(revised, teacherInfo);
    revised.savedPaperId = saved.id;
    if (revised.omrMeta?.enabled) {
      registerOmrTestFromPaper(revised, {
        ...revised.omrMeta,
        paperSnapshot: revised,
      });
    }
  } catch (err) {
    console.error('Failed to auto-save revised paper to DB:', err);
  }
  addLog('\n✓ Paper updated and ready!');
  return revised;
}

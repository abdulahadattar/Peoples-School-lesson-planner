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
  setStatusMessage('Preparing exam questions...');
  addLog('Step 1/4: Preparing exam questions...');

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
    addLog,
    config.shortMarksPerQuestion || 2,
    config.longMarksPerQuestion || 4,
    1
  );

  setProgress({ current: 2, total: 4 });
  setStatusMessage('Verifying formatting, math & answer key...');
  addLog('Step 2/4: Verifying paper quality, layout, and answer key...');

  const paper = await auditAndRefinePaper(draftPaper, {
    teacherInfo,
    mathScale: readStoredMathScale(),
    maxPasses: 2,
  });

  setProgress({ current: 3, total: 4 });
  setStatusMessage('Formatting document & pairing OMR key...');
  addLog('Step 3/4: Finalizing paper & answer key...');

  const isMcqOnly =
    (config.shortQuestionCount === 0 && config.longQuestionCount === 0 && config.mcqCount > 0) ||
    isMcqOnlyPaper(paper);
  const shouldPairOmr = config.omrMeta?.enabled ?? isMcqOnly;

  if (shouldPairOmr) {
    const reg = registerOmrTestFromPaper(paper, {
      testCode: config.omrMeta?.testCode,
      testFrequency: config.omrMeta?.testFrequency || 'weekly',
      testNumber: config.omrMeta?.testNumber,
      testDate: config.omrMeta?.testDate,
      examType: config.omrMeta?.examType,
      paperSnapshot: paper,
    });
    addLog(`✓ Paired Classroom Test Code: ${reg.testCode} (${reg.testNumber}, ${reg.testDate})`);
  }

  setProgress({ current: 4, total: 4 });
  setStatusMessage('Complete!');
  addLog('Step 4/4: Paper ready!');

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

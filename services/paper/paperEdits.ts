import { GeneratedPaper, PaperQuestion } from '../../types';

/**
 * Pure helpers for mutating exam paper sections while keeping totalMarks,
 * sectionBlueprints (attempt counts & listed counts), and instructions in sync.
 */

export function computeEffectivePaperMarks(paper: GeneratedPaper): number {
  return (paper.sections || []).reduce((acc, sec, sIdx) => {
    const questions = sec.questions || [];
    const bp = paper.sectionBlueprints?.[sIdx];
    const attemptCount = bp
      ? Math.max(0, Math.min(bp.attemptCount, questions.length))
      : questions.length;

    if (attemptCount === questions.length) {
      return acc + questions.reduce((qAcc, q) => qAcc + (Number(q.marks) || 0), 0);
    }

    if (attemptCount === 0) return acc;

    const firstMarks = Number(questions[0]?.marks) || 0;
    const uniformMarks = questions.every((q) => (Number(q.marks) || 0) === firstMarks);
    if (uniformMarks) {
      return acc + attemptCount * firstMarks;
    }

    const sortedHighest = questions
      .map((q) => Number(q.marks) || 0)
      .slice(0, attemptCount)
      .reduce((sum, m) => sum + m, 0);
    return acc + sortedHighest;
  }, 0);
}

function syncSectionBlueprintCounts(paper: GeneratedPaper, sIdx: number): void {
  const sec = paper.sections?.[sIdx];
  const bp = paper.sectionBlueprints?.[sIdx];
  if (!sec || !bp) return;

  const count = sec.questions.length;
  bp.questionCount = count;
  bp.attemptCount = Math.min(bp.attemptCount, count);

  const firstMarks = Number(sec.questions[0]?.marks);
  if (Number.isFinite(firstMarks) && firstMarks > 0 && sec.questions.every((q) => Number(q.marks) === firstMarks)) {
    bp.perQuestionMarks = firstMarks;
  }
}

export function applyQuestionUpdateToPaper(
  paper: GeneratedPaper,
  sIdx: number,
  qIdx: number,
  updatedQuestion: PaperQuestion
): GeneratedPaper {
  const next: GeneratedPaper = JSON.parse(JSON.stringify(paper));
  if (!next.sections?.[sIdx]?.questions) return next;
  next.sections[sIdx].questions[qIdx] = updatedQuestion;
  syncSectionBlueprintCounts(next, sIdx);
  next.totalMarks = computeEffectivePaperMarks(next);
  return next;
}

export function removeQuestionFromPaper(
  paper: GeneratedPaper,
  sIdx: number,
  qIdx: number
): GeneratedPaper {
  const next: GeneratedPaper = JSON.parse(JSON.stringify(paper));
  if (!next.sections?.[sIdx]?.questions) return next;
  next.sections[sIdx].questions.splice(qIdx, 1);
  syncSectionBlueprintCounts(next, sIdx);
  next.totalMarks = computeEffectivePaperMarks(next);
  return next;
}

export function addQuestionToPaper(
  paper: GeneratedPaper,
  sIdx: number,
  idSuffix: string = String(Date.now())
): GeneratedPaper {
  const next: GeneratedPaper = JSON.parse(JSON.stringify(paper));
  const section = next.sections?.[sIdx];
  if (!section) return next;

  const lowerTitle = section.title.toLowerCase();
  const isMcq = lowerTitle.includes('multiple') || lowerTitle.includes('mcq');
  const isShort = !isMcq && lowerTitle.includes('short');

  const blueprintMarks = next.sectionBlueprints?.[sIdx]?.perQuestionMarks;
  const existingMarks = Number(section.questions?.[0]?.marks);
  const defaultMarks =
    (Number.isFinite(blueprintMarks) && blueprintMarks! > 0 ? blueprintMarks : undefined) ??
    (Number.isFinite(existingMarks) && existingMarks > 0 ? existingMarks : undefined) ??
    (isMcq ? 1 : isShort ? 2 : 4);

  const newQ: PaperQuestion = {
    id: `q_${idSuffix}`,
    type: isMcq ? 'mcq' : isShort ? 'short' : 'long',
    question: 'New question text goes here (click edit to modify or regenerate)',
    marks: defaultMarks,
    options: isMcq ? ['Option A', 'Option B', 'Option C', 'Option D'] : undefined,
  };

  section.questions.push(newQ);
  const bp = next.sectionBlueprints?.[sIdx];
  if (bp) {
    const wasAllAttempted = bp.attemptCount >= bp.questionCount;
    bp.questionCount = section.questions.length;
    if (wasAllAttempted) {
      bp.attemptCount = section.questions.length;
    }
  }
  next.totalMarks = computeEffectivePaperMarks(next);
  return next;
}

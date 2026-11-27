/**
 * paperNormalization.ts — Pure normalization and chunk-merging helpers for generated exam papers.
 */
import { GeneratedPaper, PaperDifficulty, PaperQuestion, PaperSectionBlueprint } from '../../types';
import { cleanOptionText, parseMcqAnswerKey, sanitizeSingleQuestion } from '../paperLayout';
import { cleanAndParseJson } from '../jsonHelpers';
import { sanitizeStringFields } from '../latexSanitizer';
import { computeEffectivePaperMarks } from './paperEdits';

export interface PaperStructureCounts {
  mcqCount: number;
  mcqMarksPerQuestion: number;
  shortQuestionCount: number;
  shortAttemptCount: number;
  shortMarksPerQuestion: number;
  longQuestionCount: number;
  longAttemptCount: number;
  longMarksPerQuestion: number;
  gradeName: string;
  subjectName: string;
  chapterName: string;
  totalMarks: number;
  durationMinutes: number;
}

const LETTERS = ['A', 'B', 'C', 'D'] as const;

export function normalizeQuestionKey(text: string): string {
  return String(text || '')
    .toLowerCase()
    .replace(/\$+/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function deduplicateQuestions(questions: PaperQuestion[]): PaperQuestion[] {
  const seen = new Set<string>();
  const unique: PaperQuestion[] = [];
  for (const q of questions) {
    const key = normalizeQuestionKey(q.question);
    if (!key) {
      unique.push(q);
      continue;
    }
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(q);
    }
  }
  return unique;
}

export function normalizeMcqQuestion(q: PaperQuestion, idx: number, marksPerMcq: number): PaperQuestion {
  const rawAnswer = q.correctAnswer;
  const sanitized = sanitizeSingleQuestion({
    ...q,
    type: 'mcq',
    id: q.id || `mcq_${idx + 1}`,
    marks: q.marks || marksPerMcq,
  });

  const opts = Array.isArray(sanitized.options) ? sanitized.options.map(cleanOptionText).filter(Boolean) : [];
  while (opts.length < 4) {
    opts.push(opts.length === 3 ? 'None of the above' : `Option ${LETTERS[opts.length]}`);
  }
  const finalOpts = opts.slice(0, 4);

  const resolved = parseMcqAnswerKey(rawAnswer ?? sanitized.correctAnswer, finalOpts);

  return {
    ...sanitized,
    type: 'mcq',
    options: finalOpts,
    correctAnswer: resolved.letter,
    marks: marksPerMcq,
  };
}

export function buildBlueprintsForPaper(
  paper: GeneratedPaper,
  counts: PaperStructureCounts
): PaperSectionBlueprint[] {
  const blueprints: PaperSectionBlueprint[] = [];
  const sections = Array.isArray(paper.sections) ? paper.sections : [];
  const attemptShort = Math.min(counts.shortAttemptCount, counts.shortQuestionCount);
  const attemptLong = Math.min(counts.longAttemptCount, counts.longQuestionCount);

  sections.forEach((sec) => {
    const title = (sec.title || '').toLowerCase();
    if (title.includes('multiple') || title.includes('mcq') || title.includes('section a')) {
      const count = sec.questions?.length || counts.mcqCount;
      blueprints.push({
        questionCount: count,
        attemptCount: count,
        perQuestionMarks: counts.mcqMarksPerQuestion,
      });
    } else if (title.includes('short') || title.includes('section b')) {
      const count = sec.questions?.length || counts.shortQuestionCount;
      blueprints.push({
        questionCount: count,
        attemptCount: Math.min(attemptShort, count),
        perQuestionMarks: counts.shortMarksPerQuestion,
      });
    } else if (title.includes('long') || title.includes('detailed') || title.includes('section c')) {
      const count = sec.questions?.length || counts.longQuestionCount;
      blueprints.push({
        questionCount: count,
        attemptCount: Math.min(attemptLong, count),
        perQuestionMarks: counts.longMarksPerQuestion,
      });
    } else {
      const count = sec.questions?.length || 1;
      blueprints.push({
        questionCount: count,
        attemptCount: count,
        perQuestionMarks: sec.questions?.[0]?.marks || 1,
      });
    }
  });

  return blueprints;
}

export function normalizeGeneratedPaper(
  rawJson: string,
  counts: PaperStructureCounts
): GeneratedPaper {
  const parsed = cleanAndParseJson(rawJson);
  const cleaned = sanitizeStringFields(parsed) as GeneratedPaper;

  if (!cleaned || typeof cleaned !== 'object' || !Array.isArray(cleaned.sections) || cleaned.sections.length === 0) {
    throw new Error('Model returned an empty or malformed exam paper without sections.');
  }

  cleaned.title = cleaned.title || `${counts.subjectName} — ${counts.chapterName}`;
  cleaned.gradeLevel = cleaned.gradeLevel || counts.gradeName;
  cleaned.subject = cleaned.subject || counts.subjectName;
  cleaned.chapterName = cleaned.chapterName || counts.chapterName;
  cleaned.durationMinutes = cleaned.durationMinutes || counts.durationMinutes;

  cleaned.sections = cleaned.sections
    .filter((sec) => sec && Array.isArray(sec.questions) && sec.questions.length > 0)
    .map((sec, sIdx) => {
      const titleLower = (sec.title || '').toLowerCase();
      const isMcqSec = titleLower.includes('mcq') || titleLower.includes('multiple') || (sIdx === 0 && counts.mcqCount > 0);
      const isLongSec = titleLower.includes('long') || titleLower.includes('detailed') || titleLower.includes('section c');
      const fallbackType: PaperQuestion['type'] = isMcqSec ? 'mcq' : isLongSec ? 'long' : 'short';
      const fallbackMarks =
        fallbackType === 'mcq'
          ? counts.mcqMarksPerQuestion
          : fallbackType === 'long'
            ? counts.longMarksPerQuestion
            : counts.shortMarksPerQuestion;

      let questions = sec.questions.map((q, qIdx) => {
        const qType = q.type || fallbackType;
        if (qType === 'mcq') {
          return normalizeMcqQuestion(q, qIdx, counts.mcqMarksPerQuestion);
        }
        const sanitized = sanitizeSingleQuestion({
          ...q,
          type: qType,
          id: q.id || `${qType}_${sIdx + 1}_${qIdx + 1}`,
          marks: q.marks || fallbackMarks,
        });
        return {
          ...sanitized,
          marks: q.marks || fallbackMarks,
        };
      });

      questions = deduplicateQuestions(questions);
      if (isMcqSec && counts.mcqCount > 0 && questions.length > counts.mcqCount) {
        questions = questions.slice(0, counts.mcqCount);
      }

      return {
        ...sec,
        questions,
      };
    });

  if (cleaned.sections.length === 0) {
    throw new Error('Generated exam paper had zero questions across all sections.');
  }

  cleaned.totalMarks = counts.totalMarks || cleaned.totalMarks;
  cleaned.sectionBlueprints = buildBlueprintsForPaper(cleaned, counts);
  return cleaned;
}

export function mergeChunkedPaperParts(
  mcqQuestions: PaperQuestion[],
  subjectiveSections: GeneratedPaper['sections'],
  counts: PaperStructureCounts
): GeneratedPaper {
  const normalizedMcqs = deduplicateQuestions(
    mcqQuestions.map((q, i) => normalizeMcqQuestion(q, i, counts.mcqMarksPerQuestion))
  ).slice(0, counts.mcqCount);

  const sections: GeneratedPaper['sections'] = [];
  if (normalizedMcqs.length > 0) {
    sections.push({
      title: 'Section A — Multiple Choice Questions (MCQs)',
      instruction: `Each question carries ${counts.mcqMarksPerQuestion} ${counts.mcqMarksPerQuestion === 1 ? 'mark' : 'marks'}.`,
      questions: normalizedMcqs,
    });
  }

  for (const sec of subjectiveSections) {
    if (sec && Array.isArray(sec.questions) && sec.questions.length > 0) {
      sections.push({
        ...sec,
        questions: deduplicateQuestions(sec.questions),
      });
    }
  }

  const assembled: GeneratedPaper = {
    title: `${counts.subjectName} Assessment — ${counts.chapterName}`,
    gradeLevel: counts.gradeName,
    subject: counts.subjectName,
    chapterName: counts.chapterName,
    totalMarks: counts.totalMarks,
    durationMinutes: counts.durationMinutes,
    sections,
  };
  assembled.sectionBlueprints = buildBlueprintsForPaper(assembled, counts);
  assembled.totalMarks = computeEffectivePaperMarks(assembled) || counts.totalMarks;
  return assembled;
}

/**
 * Normalize an AI-revised exam paper so every question, MCQ answer key,
 * sectionBlueprint attemptCount, and totalMarks stay mathematically synced.
 */
export function normalizeRevisedPaper(
  rawJson: string,
  previousPaper: GeneratedPaper
): GeneratedPaper {
  const parsed = cleanAndParseJson(rawJson);
  const cleaned = sanitizeStringFields(parsed) as GeneratedPaper;
  if (!cleaned || typeof cleaned !== 'object' || !Array.isArray(cleaned.sections) || cleaned.sections.length === 0) {
    throw new Error('Model returned an empty or malformed revised exam paper.');
  }

  cleaned.title = cleaned.title || previousPaper.title;
  cleaned.gradeLevel = cleaned.gradeLevel || previousPaper.gradeLevel;
  cleaned.subject = cleaned.subject || previousPaper.subject;
  cleaned.chapterName = cleaned.chapterName || previousPaper.chapterName;
  cleaned.durationMinutes = Number(cleaned.durationMinutes) || previousPaper.durationMinutes;

  const blueprints: PaperSectionBlueprint[] = [];
  cleaned.sections = cleaned.sections
    .filter((sec) => sec && Array.isArray(sec.questions) && sec.questions.length > 0)
    .map((sec, sIdx) => {
      const prevBp = previousPaper.sectionBlueprints?.[sIdx];
      const titleLower = (sec.title || '').toLowerCase();
      const inferredType: PaperQuestion['type'] =
        titleLower.includes('mcq') || titleLower.includes('multiple') || titleLower.includes('section a')
          ? 'mcq'
          : titleLower.includes('long') || titleLower.includes('detailed') || titleLower.includes('section c')
            ? 'long'
            : 'short';
      const defaultMarks = prevBp?.perQuestionMarks || sec.questions[0]?.marks || (inferredType === 'mcq' ? 1 : inferredType === 'long' ? 4 : 2);

      const normalizedQuestions = deduplicateQuestions(
        sec.questions.map((q, qIdx) => {
          const qType = q.type || inferredType;
          const qMarks = Number(q.marks) > 0 ? Number(q.marks) : defaultMarks;
          if (qType === 'mcq') {
            return normalizeMcqQuestion(q, qIdx, qMarks);
          }
          const sanitized = sanitizeSingleQuestion({
            ...q,
            type: qType,
            id: q.id || `${qType}_${sIdx + 1}_${qIdx + 1}`,
            marks: qMarks,
          });
          return { ...sanitized, marks: qMarks };
        })
      );

      const attemptMatch = String(sec.instruction || '').match(/attempt\s+(?:any\s+)?(\d+)/i);
      const attemptCount = attemptMatch
        ? Math.min(normalizedQuestions.length, Math.max(1, Number(attemptMatch[1])))
        : prevBp
          ? (prevBp.attemptCount >= prevBp.questionCount ? normalizedQuestions.length : Math.min(prevBp.attemptCount, normalizedQuestions.length))
          : normalizedQuestions.length;

      blueprints.push({
        questionCount: normalizedQuestions.length,
        attemptCount,
        perQuestionMarks: Number(normalizedQuestions[0]?.marks) || defaultMarks,
      });

      return { ...sec, questions: normalizedQuestions };
    });

  cleaned.sectionBlueprints = blueprints;
  cleaned.totalMarks = computeEffectivePaperMarks(cleaned) || previousPaper.totalMarks;
  return cleaned;
}

export function isPdfContextRejection(err: Error): boolean {
  const msg = err.message.toLowerCase();
  return (
    msg.includes('does not support pdf') ||
    msg.includes('pdf') && (msg.includes('unsupported') || msg.includes('invalid') || msg.includes('unable to process') || msg.includes('too large'))
  );
}

export function buildMcqChunkPrompt(
  subjectName: string,
  gradeName: string,
  chapterName: string,
  batchCount: number,
  batchNumber: number,
  totalBatches: number,
  difficulty: PaperDifficulty,
  slos: string[],
  existingQuestions: string[]
): string {
  const recentStems = existingQuestions.slice(-45).map((q, i) => {
    const compact = q.replace(/\s+/g, ' ').trim();
    return `${i + 1}. ${compact.length > 110 ? compact.slice(0, 107) + '...' : compact}`;
  });
  const avoidList =
    recentStems.length > 0
      ? `\nDo NOT repeat these already-generated questions:\n${recentStems.join('\n')}`
      : '';

  return `Generate batch ${batchNumber} of ${totalBatches} containing EXACTLY ${batchCount} unique Multiple Choice Questions (MCQs) in Section A.
Subject: ${subjectName}
Grade: ${gradeName}
Chapter: ${chapterName}
Difficulty: ${difficulty}

SLOs / Syllabus scope:
${slos.map((s) => `- ${s}`).join('\n')}
${avoidList}

Each MCQ must have 4 distinct options (no A)/B)/C)/D) prefix inside option text) and correctAnswer set to "A", "B", "C", or "D".`;
}

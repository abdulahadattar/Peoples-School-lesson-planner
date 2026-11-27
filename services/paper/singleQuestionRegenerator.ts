import { Part } from '@google/genai';
import { curriculumData } from '../../curriculum';
import { GeneratedPaper, PaperQuestion } from '../../types';
import { sanitizeStringFields } from '../latexSanitizer';
import { cleanQuestionText, sanitizeSingleQuestion } from '../paperLayout';
import { requestJsonWithRetry, downloadPdfAsPart, LogCallback } from '../geminiService';
import { cleanAndParseJson } from '../jsonHelpers';
import { loadSloChapter } from '../sloData';
import { singleQuestionSchema } from './schema';
import { getChapterSLOs } from './helpers';
import { buildNoPdfSyllabusGuidance } from './curriculumFallback';
import {
  isPdfContextRejection,
  normalizeMcqQuestion,
  normalizeQuestionKey,
} from './paperNormalization';

interface ResolvedChapterContext {
  gradeId: string;
  subjectId: string;
  chapterId: string;
}

function resolveChapterIdsFromPaper(paper: GeneratedPaper): ResolvedChapterContext | null {
  const targetGrade = String(paper.gradeLevel || '').trim().toLowerCase();
  const targetSubject = String(paper.subject || '').trim().toLowerCase();
  const targetChapter = String(paper.chapterName || '').trim().toLowerCase();

  const cls =
    curriculumData.classes.find(
      (c) =>
        c.name.toLowerCase() === targetGrade ||
        c.shortName.toLowerCase() === targetGrade ||
        c.id.toLowerCase() === targetGrade
    ) ||
    curriculumData.classes.find((c) => {
      const num = targetGrade.replace(/\D/g, '');
      return num ? c.id === `class${num}` : false;
    });

  if (!cls) return null;

  const subject =
    cls.subjects.find(
      (s) => s.name.toLowerCase() === targetSubject || s.id.toLowerCase() === targetSubject
    ) ||
    cls.subjects.find((s) => targetSubject.includes(s.name.toLowerCase()) || s.name.toLowerCase().includes(targetSubject));

  if (!subject) return null;

  const chapter =
    subject.chapters.find(
      (ch) => ch.name.toLowerCase() === targetChapter || ch.id.toLowerCase() === targetChapter
    ) ||
    subject.chapters.find(
      (ch) => targetChapter && (ch.name.toLowerCase().includes(targetChapter) || targetChapter.includes(ch.name.toLowerCase()))
    ) ||
    subject.chapters[0];

  if (!chapter) return null;
  return { gradeId: cls.id, subjectId: subject.id, chapterId: chapter.id };
}

function collectPaperExclusionContext(
  paper: GeneratedPaper,
  targetQuestion: PaperQuestion
): { exclusionLines: string[]; existingKeys: Set<string>; targetSectionTitle: string } {
  const exclusionLines: string[] = [];
  const existingKeys = new Set<string>();
  let targetSectionTitle = '';

  const targetKey = normalizeQuestionKey(targetQuestion.question);
  if (targetKey) existingKeys.add(targetKey);

  (paper.sections || []).forEach((sec) => {
    const containsTarget = (sec.questions || []).some(
      (q) => q === targetQuestion || (q.id && targetQuestion.id && q.id === targetQuestion.id)
    );
    if (containsTarget && !targetSectionTitle) {
      targetSectionTitle = sec.title;
    }

    (sec.questions || []).forEach((q, idx) => {
      const isSameTarget =
        q === targetQuestion || (Boolean(q.id) && q.id === targetQuestion.id);
      const cleanStem = cleanQuestionText(q.question || '');
      const key = normalizeQuestionKey(cleanStem);
      if (key) existingKeys.add(key);

      if (!isSameTarget && cleanStem) {
        const compact = cleanStem.replace(/\s+/g, ' ').slice(0, 140);
        exclusionLines.push(`- [${sec.title} Q${idx + 1}] ${compact}`);
      }
    });
  });

  return { exclusionLines, existingKeys, targetSectionTitle };
}

export async function regenerateSingleQuestion(
  paper: GeneratedPaper,
  targetQuestion: PaperQuestion,
  customInstruction?: string,
  logCallback?: LogCallback
): Promise<PaperQuestion> {
  const log = (msg: string) => {
    console.log(`[paperService.regen] ${msg}`);
    logCallback?.(msg);
  };

  let slosText = '';
  let contextParts: Part[] = [];
  const resolved = resolveChapterIdsFromPaper(paper);

  if (resolved) {
    try {
      const sloChapter = await loadSloChapter(resolved.gradeId, resolved.subjectId, resolved.chapterId);
      const chapterSlos =
        sloChapter?.slos && sloChapter.slos.length > 0
          ? sloChapter.slos.map((s: any, i: number) => `${s.id || `SLO_${i + 1}`}: ${s.text || ''}`)
          : getChapterSLOs(resolved.gradeId, resolved.subjectId, resolved.chapterId);

      slosText = chapterSlos.map((s) => `- ${s}`).join('\n');

      if (sloChapter?.pdf_url) {
        const pdfPart = await downloadPdfAsPart(sloChapter.pdf_url);
        if (pdfPart) {
          contextParts = [pdfPart];
        }
      }
    } catch {
      slosText = buildNoPdfSyllabusGuidance(
        resolved.gradeId,
        resolved.subjectId,
        resolved.chapterId,
        paper.subject,
        paper.chapterName
      );
    }
  }

  const { exclusionLines, existingKeys, targetSectionTitle } = collectPaperExclusionContext(
    paper,
    targetQuestion
  );

  const systemInstruction = `You are an expert examination paper setter for ${paper.subject} (${paper.gradeLevel}).
Generate ONE brand-new replacement question matching:
- Subject: ${paper.subject}
- Class/Grade: ${paper.gradeLevel}
- Chapter/Unit: ${paper.chapterName || 'Standard curriculum'}
${targetSectionTitle ? `- Section: ${targetSectionTitle}` : ''}
- Question Type: ${targetQuestion.type.toUpperCase()}
- Marks: ${targetQuestion.marks}

CRITICAL RULES:
1. The question MUST belong strictly to chapter "${paper.chapterName || paper.subject}" and fit ${targetQuestion.marks} marks.
2. NEVER repeat, rephrase, or closely mirror ANY existing question on this paper (listed below). Choose a distinct concept/numerical/SLO from the chapter.
3. Never include question numbers ("1.", "Q1:") or mark labels inside 'question'.
4. If MCQ: provide exactly 4 distinct options without A)/B)/C)/D) prefixes, and set 'correctAnswer' strictly to "A", "B", "C", or "D" matching the factually and mathematically accurate option.
5. If Short or Long question: omit 'options' and 'correctAnswer'.
6. Use standard LaTeX delimiters ($...$ inline) ONLY for real math/chemistry formulas and units. Never wrap plain prose words in dollar signs.
7. Strictly output valid JSON matching the single question structure.`;

  const buildPrompt = (extraNote?: string) => {
    const exclusionBlock =
      exclusionLines.length > 0
        ? `\nEXISTING QUESTIONS ON PAPER — DO NOT DUPLICATE OR PARAPHRASE ANY OF THESE:\n${exclusionLines.join('\n')}\n`
        : '';
    const sloBlock = slosText ? `\nCHAPTER LEARNING TARGETS:\n${slosText}\n` : '';

    return `Replace this question:
"${cleanQuestionText(targetQuestion.question)}"
${
  targetQuestion.options && targetQuestion.options.length > 0
    ? `Previous options:\n${targetQuestion.options.map((o, i) => `(${String.fromCharCode(65 + i)}) ${o}`).join('\n')}`
    : ''
}
${sloBlock}${exclusionBlock}
${customInstruction?.trim() ? `Teacher instruction: "${customInstruction.trim()}"` : 'Generate a fresh, syllabus-accurate alternative from a different topic or angle in this chapter.'}
${extraNote ? `\nIMPORTANT: ${extraNote}` : ''}
Return ONLY the single replacement question JSON object.`;
  };

  const runRegenCall = async (prompt: string, parts?: Part[]): Promise<PaperQuestion> => {
    return requestJsonWithRetry<PaperQuestion>({
      operationName: 'replacing question',
      firstAttemptLog: 'Generating replacement question...',
      retryLabel: 'Retrying replacement question',
      systemInstruction,
      userPrompt: prompt,
      schema: singleQuestionSchema,
      temperature: 0.5,
      contextParts: parts && parts.length > 0 ? parts : undefined,
      log,
      parse: (raw) => {
        const parsed = cleanAndParseJson(raw);
        const sanitizedFields = sanitizeStringFields(parsed) as PaperQuestion;
        const base: PaperQuestion = {
          ...sanitizedFields,
          id: targetQuestion.id || `q_${Date.now()}`,
          type: targetQuestion.type,
          marks: targetQuestion.marks,
        };
        if (targetQuestion.type === 'mcq') {
          return normalizeMcqQuestion(base, 0, targetQuestion.marks || 1);
        }
        return {
          ...sanitizeSingleQuestion(base),
          id: base.id,
          type: targetQuestion.type,
          marks: targetQuestion.marks,
        };
      },
      failMessage: (lastError) => `Failed to regenerate question: ${lastError.message}`,
    });
  };

  let replacement: PaperQuestion;
  try {
    replacement = await runRegenCall(buildPrompt(), contextParts);
  } catch (err) {
    const errObj = err instanceof Error ? err : new Error(String(err));
    if (contextParts.length > 0 && isPdfContextRejection(errObj)) {
      replacement = await runRegenCall(buildPrompt(), undefined);
    } else {
      throw errObj;
    }
  }

  const nextKey = normalizeQuestionKey(replacement.question);
  if (nextKey && existingKeys.has(nextKey)) {
    log('Replacement matched an existing question; selecting a distinct question...');
    try {
      const retry = await runRegenCall(
        buildPrompt(
          `Your previous draft ("${replacement.question}") duplicated an existing question. Pick a completely different concept from "${paper.chapterName || paper.subject}".`
        ),
        undefined
      );
      if (retry.question?.trim()) {
        replacement = retry;
      }
    } catch {
      // Keep valid replacement if retry fails
    }
  }

  return replacement;
}

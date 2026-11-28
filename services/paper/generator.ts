import { Part } from '@google/genai';
import { GeneratedPaper, PaperQuestion, PaperDifficulty } from '../../types';
import { requestJsonWithRetry, downloadPdfAsPart, LogCallback } from '../geminiService';
import { loadSloChapter } from '../sloData';
import { paperSchema } from './schema';
import {
  getGradeName,
  getSubjectName,
  getChapterName,
  getChapterSLOs,
  buildDifficultyDescription,
  buildSectionRules,
} from './helpers';
import { buildNoPdfSyllabusGuidance } from './curriculumFallback';
import {
  PaperStructureCounts,
  buildBlueprintsForPaper,
  buildMcqChunkPrompt,
  deduplicateQuestions,
  isPdfContextRejection,
  mergeChunkedPaperParts,
  normalizeGeneratedPaper,
  normalizeMcqQuestion,
  normalizeRevisedPaper,
} from './paperNormalization';

const MAX_MCQS_PER_PASS = 20;

export async function generateExamPaper(
  gradeId: string,
  subjectId: string,
  chapterId: string,
  totalMarks: number,
  mcqCount: number,
  shortQuestionCount: number,
  shortAttemptCount: number,
  longQuestionCount: number,
  longAttemptCount: number,
  durationMinutes: number,
  difficulty: PaperDifficulty = 'medium',
  logCallback?: LogCallback,
  shortMarksPerQuestion: number = 2,
  longMarksPerQuestion: number = 4,
  mcqMarksPerQuestion: number = 1
): Promise<GeneratedPaper> {
  const log = (msg: string) => {
    console.log(`[paperService] ${msg}`);
    logCallback?.(msg);
  };
  const gradeName = getGradeName(gradeId);
  const subjectName = getSubjectName(gradeId, subjectId);
  const chapterName = getChapterName(gradeId, subjectId, chapterId);
  let slos = getChapterSLOs(gradeId, subjectId, chapterId);

  const attemptShort = Math.min(shortAttemptCount, shortQuestionCount);
  const attemptLong = Math.min(longAttemptCount, longQuestionCount);
  const mcqMarks = mcqCount * mcqMarksPerQuestion;
  const shortMarks = attemptShort * shortMarksPerQuestion;
  const longMarks = attemptLong * longMarksPerQuestion;
  const totalQuestionMarks = mcqMarks + shortMarks + longMarks;
  const validatedTotalMarks = totalQuestionMarks > 0 ? totalQuestionMarks : totalMarks;

  if (totalMarks !== validatedTotalMarks) {
    log(`Note: Synchronized paper marks to ${validatedTotalMarks} to match question section breakdown.`);
  }

  let contextParts: Part[] = [];
  try {
    const chapter = await loadSloChapter(gradeId, subjectId, chapterId);
    if (chapter?.slos && chapter.slos.length > 0) {
      slos = chapter.slos.map((s: any, idx: number) => `${s.id || `SLO_${idx + 1}`}: ${s.text || ''}`);
    }
    log(`Reading chapter: ${chapter ? chapter.chapter_name : chapterName}`);
    if (chapter?.pdf_url) {
      const pdfPart = await downloadPdfAsPart(chapter.pdf_url);
      if (pdfPart) {
        contextParts = [pdfPart];
        log('Chapter textbook loaded.');
      } else {
        log('Using syllabus topics for this chapter.');
      }
    } else {
      log('Using syllabus topics for this chapter.');
    }
  } catch (err) {
    console.warn('Chapter resource lookup issue:', err);
  }

  const counts: PaperStructureCounts = {
    mcqCount,
    mcqMarksPerQuestion,
    shortQuestionCount,
    shortAttemptCount: attemptShort,
    shortMarksPerQuestion,
    longQuestionCount,
    longAttemptCount: attemptLong,
    longMarksPerQuestion,
    gradeName,
    subjectName,
    chapterName,
    totalMarks: validatedTotalMarks,
    durationMinutes,
  };

  const isMcqOnly = shortQuestionCount === 0 && longQuestionCount === 0;
  const sectionRules = buildSectionRules(
    isMcqOnly,
    mcqCount,
    mcqMarksPerQuestion,
    mcqMarks,
    shortQuestionCount,
    shortMarksPerQuestion,
    attemptShort,
    shortMarks,
    longQuestionCount,
    longMarksPerQuestion,
    attemptLong,
    longMarks
  );

  const systemInstruction = `You are an expert exam paper generator for ${subjectName}. Your task is to generate a well-structured exam paper as a JSON object aligned with the Sindh Textbook Board (STBB) / ZUEB curriculum and Student Learning Outcomes (SLOs).

**Critical Instructions:**
1.  **Curriculum-Aligned:** All questions must cover the chapter "${chapterName}" for ${gradeName} based on provided SLOs and standard textbook curriculum (even when no external PDF is attached).
2.  **Bloom's Taxonomy:** Include questions across Knowledge, Understanding, and Application.
3.  **Clear Instructions:** Provide clear instructions for each section.
4.  **Mark Distribution:** Ensure the total marks match exactly ${validatedTotalMarks} marks.${sectionRules}
5.  **No per-question marks in question text:** Never place mark values or labels inside individual questions.
6.  **Clean Question Text:** NEVER write question numbers or prefixes (like "1.", "Q1:", "(a)") in the 'question' field.
7.  **Clean MCQ Options:** For MCQs, the 'options' array MUST contain exactly 4 clean choice texts WITHOUT prefixes (do NOT write "A)", "(A)", "a.", "○ A)").
8.  **MCQ Answer Key ('correctAnswer'):** For every MCQ, set 'correctAnswer' to "A", "B", "C", or "D" matching the 1st, 2nd, 3rd, or 4th entry in 'options'. Omit for Short/Long questions.
9.  **MANDATORY JSON OUTPUT:** Output ONLY valid JSON matching the schema. No extra markdown or commentary.
10. **CLEAN MATH & SCRIPT:** Use inline '$...$' (NOT '$$...$$') for equations inside questions, numbers/values (write '$3$ and $2$', never '$$3$$'), and ALL MCQ options; reserve '$$...$$' strictly for multi-line display/matrices. Close every '{}' brace and every '\\left' with matching '\\right' (e.g. '\\left| x \\right|'). Write exclusively in standard English for non-language subjects — never emit foreign/Arabic characters or half-finished symbols.`;

  const difficultyText = buildDifficultyDescription(difficulty);
  const sloText = slos.length > 0 ? slos.map((s) => `- ${s}`).join('\n') : buildNoPdfSyllabusGuidance(gradeId, subjectId, chapterId, subjectName, chapterName);
  const syllabusGuidance = contextParts.length === 0
    ? `\n**Built-In Syllabus Reference:**\n${buildNoPdfSyllabusGuidance(gradeId, subjectId, chapterId, subjectName, chapterName)}\n`
    : '';

  const markUnit = (m: number) => `${m} ${m === 1 ? 'mark' : 'marks'}`;
  const userPrompt = `Generate an exam paper for the following:

**Subject:** ${subjectName}
**Grade:** ${gradeName}
**Chapter:** ${chapterName}
**Total Marks:** ${validatedTotalMarks}
**Duration:** ${durationMinutes} minutes
**Difficulty:** ${difficultyText}

**Student Learning Outcomes (SLOs) for this chapter:**
${sloText}
${syllabusGuidance}
**Paper Structure Requirements:**
1. Section A - Multiple Choice Questions (MCQs): ${mcqCount > 0 ? `exactly ${mcqCount} questions, ${markUnit(mcqMarksPerQuestion)} each, all attempted` : 'none (omit Section A)'}
${shortQuestionCount > 0 ? `2. Section B - Short Questions: generate ${shortQuestionCount} short questions, ${markUnit(shortMarksPerQuestion)} each; students attempt any ${attemptShort} of them` : '2. Section B - Short Questions: none (omit Section B)'}
${longQuestionCount > 0 ? `3. Section C - Long Questions: generate ${longQuestionCount} long questions, ${markUnit(longMarksPerQuestion)} each; students attempt any ${attemptLong} of them` : '3. Section C - Long Questions: none (omit Section C)'}

Set each section's "instruction" field to the marking rule for that section${shortQuestionCount > 0 ? ` (e.g. "Answer any ${attemptShort} of the ${shortQuestionCount} questions. Each question carries ${markUnit(shortMarksPerQuestion)}.")` : ''}.`;

  const topUpMissingMcqs = async (paper: GeneratedPaper, parts?: Part[]): Promise<GeneratedPaper> => {
    if (mcqCount <= 0) return paper;
    const mcqSecIdx = paper.sections.findIndex(
      (s) => s.title.toLowerCase().includes('mcq') || s.title.toLowerCase().includes('multiple') || s.questions.every((q) => q.type === 'mcq')
    );
    if (mcqSecIdx < 0) return paper;

    let currentMcqs = deduplicateQuestions(paper.sections[mcqSecIdx].questions);
    for (let attempt = 1; attempt <= 2 && currentMcqs.length < mcqCount; attempt++) {
      const missing = mcqCount - currentMcqs.length;
      log(`MCQ count check: generated ${currentMcqs.length}/${mcqCount}, topping up ${missing} unique MCQs...`);
      const topUpPrompt = buildMcqChunkPrompt(
        subjectName,
        gradeName,
        chapterName,
        missing,
        attempt,
        2,
        difficulty,
        slos,
        currentMcqs.map((q) => q.question)
      );
      try {
        const extraPaper = await requestJsonWithRetry<GeneratedPaper>({
          operationName: `generating ${missing} replacement MCQs`,
          systemInstruction,
          userPrompt: topUpPrompt,
          schema: paperSchema,
          temperature: 0.35,
          contextParts: parts && parts.length > 0 ? parts : undefined,
          log,
          parse: (raw) => normalizeGeneratedPaper(raw, { ...counts, mcqCount: missing, shortQuestionCount: 0, longQuestionCount: 0 }),
        });
        const extraMcqs = extraPaper.sections.flatMap((s) => s.questions).filter((q) => q.type === 'mcq');
        currentMcqs = deduplicateQuestions([...currentMcqs, ...extraMcqs]).map((q, idx) =>
          normalizeMcqQuestion(q, idx, mcqMarksPerQuestion)
        );
      } catch (topUpErr) {
        log(`Top-up batch skipped: ${topUpErr instanceof Error ? topUpErr.message : String(topUpErr)}`);
        break;
      }
    }

    const updatedSections = paper.sections.map((s, idx) =>
      idx === mcqSecIdx ? { ...s, questions: currentMcqs.slice(0, mcqCount) } : s
    );
    const updatedPaper: GeneratedPaper = { ...paper, sections: updatedSections };
    updatedPaper.sectionBlueprints = buildBlueprintsForPaper(updatedPaper, counts);
    return updatedPaper;
  };

  const runSinglePass = async (parts?: Part[]) => {
    const paper = await requestJsonWithRetry<GeneratedPaper>({
      operationName: 'generating exam paper',
      systemInstruction,
      userPrompt,
      schema: paperSchema,
      temperature: 0.3,
      contextParts: parts && parts.length > 0 ? parts : undefined,
      log,
      parse: (raw) => normalizeGeneratedPaper(raw, counts),
      failMessage: (lastError) => `Failed to generate exam paper: ${lastError.message}`,
    });
    return topUpMissingMcqs(paper, parts);
  };

  const runChunkedGeneration = async (parts?: Part[]): Promise<GeneratedPaper> => {
    const batchCount = Math.ceil(mcqCount / MAX_MCQS_PER_PASS);
    log('Drafting exam paper sections...');
    const allMcqs: PaperQuestion[] = [];
    for (let b = 0; b < batchCount; b++) {
      const remaining = mcqCount - allMcqs.length;
      const chunkSize = Math.min(MAX_MCQS_PER_PASS, remaining);
      const chunkPrompt = buildMcqChunkPrompt(
        subjectName,
        gradeName,
        chapterName,
        chunkSize,
        b + 1,
        batchCount,
        difficulty,
        slos,
        allMcqs.map((q) => q.question)
      );
      const chunkPaper = await requestJsonWithRetry<GeneratedPaper>({
        operationName: `generating MCQ batch ${b + 1}/${batchCount}`,
        systemInstruction,
        userPrompt: chunkPrompt,
        schema: paperSchema,
        temperature: 0.35,
        contextParts: parts && parts.length > 0 ? parts : undefined,
        log,
        parse: (raw) => normalizeGeneratedPaper(raw, { ...counts, mcqCount: chunkSize, shortQuestionCount: 0, longQuestionCount: 0 }),
      });
      const extracted = chunkPaper.sections.flatMap((s) => s.questions).filter((q) => q.type === 'mcq');
      allMcqs.push(...extracted);
    }

    let subjectiveSections: GeneratedPaper['sections'] = [];
    if (shortQuestionCount > 0 || longQuestionCount > 0) {
      const subjPrompt = `Generate ONLY the subjective sections for ${gradeName} ${subjectName} (${chapterName}, Difficulty: ${difficulty}).
${shortQuestionCount > 0 ? `- Section B (Short Questions): ${shortQuestionCount} questions, ${markUnit(shortMarksPerQuestion)} each, attempt any ${attemptShort}.` : ''}
${longQuestionCount > 0 ? `- Section C (Long Questions): ${longQuestionCount} questions, ${markUnit(longMarksPerQuestion)} each, attempt any ${attemptLong}.` : ''}
SLOs:\n${sloText}`;
      const subjPaper = await requestJsonWithRetry<GeneratedPaper>({
        operationName: 'generating subjective sections',
        systemInstruction,
        userPrompt: subjPrompt,
        schema: paperSchema,
        temperature: 0.3,
        contextParts: parts && parts.length > 0 ? parts : undefined,
        log,
        parse: (raw) => normalizeGeneratedPaper(raw, { ...counts, mcqCount: 0 }),
      });
      subjectiveSections = subjPaper.sections.filter((s) => !s.title.toLowerCase().includes('mcq'));
    }

    const assembled = mergeChunkedPaperParts(allMcqs, subjectiveSections, counts);
    return topUpMissingMcqs(assembled, parts);
  };

  const usedChunkedInitially = mcqCount > 25;
  const isNonRetryableInfraError = (error: Error): boolean => {
    const msg = error.message.toLowerCase();
    return (
      msg.includes('is not configured on the server') ||
      msg.includes('api key not set') ||
      msg.includes('returned an html page instead of json') ||
      msg.includes('invalid non-json response') ||
      msg.includes('<!doctype')
    );
  };

  try {
    if (usedChunkedInitially) {
      return await runChunkedGeneration(contextParts);
    }
    return await runSinglePass(contextParts);
  } catch (err) {
    const errObj = err instanceof Error ? err : new Error(String(err));
    if (contextParts.length > 0 && isPdfContextRejection(errObj)) {
      log('Continuing using chapter syllabus topics...');
      return usedChunkedInitially ? runChunkedGeneration(undefined) : runSinglePass(undefined);
    }
    if (!usedChunkedInitially && mcqCount > 15 && !isNonRetryableInfraError(errObj)) {
      log('Retrying section-by-section...');
      return runChunkedGeneration(undefined);
    }
    throw errObj;
  }
}

export async function reviseExamPaper(
  currentPaper: GeneratedPaper,
  revisionPrompt: string,
  logCallback?: LogCallback
): Promise<GeneratedPaper> {
  const log = (msg: string) => {
    console.log(`[paperService.revise] ${msg}`);
    logCallback?.(msg);
  };

  const currentPaperJson = JSON.stringify(currentPaper, null, 2);

  const systemInstruction = `You are an expert exam paper editor for ${currentPaper.subject}. A teacher has provided feedback to revise an existing exam paper. Your task is to modify the paper according to the teacher's instructions while keeping it well-structured and balanced.

**Critical Instructions:**
1. Follow the teacher's revision instructions exactly.
2. Maintain proper question numbering across all sections.
3. Keep the total marks consistent (or update if the teacher changes the structure).
4. Ensure questions are properly formatted with MCQ options where applicable.
5. **CLEAN MATH & SCRIPT:** Wrap genuine mathematical equations/units in inline '$...$' (never '$$...$$' for simple numbers, short expressions, or MCQ options). Pair every '{}' and '\\left...\\right', keep ordinary prose outside '$...$', and never include stray non-English characters.
6. **MANDATORY JSON OUTPUT:** Output ONLY valid JSON matching the schema. No extra text or markdown.`;

  const userPrompt = `Here is the current exam paper:

${currentPaperJson}

---

**Teacher's revision instructions:**
${revisionPrompt}

Please return the complete revised exam paper as a JSON object.`;

  return requestJsonWithRetry<GeneratedPaper>({
    operationName: 'updating exam paper',
    firstAttemptLog: 'Updating paper...',
    retryLabel: 'Retrying paper update',
    systemInstruction,
    userPrompt,
    schema: paperSchema,
    temperature: 0.3,
    log,
    parse: (raw) => {
      const normalized = normalizeRevisedPaper(raw, currentPaper);
      log(`Updated ${normalized.sections?.length || 0} sections (${normalized.totalMarks} marks).`);
      return normalized;
    },
    failMessage: (lastError) => `Failed to revise exam paper: ${lastError.message}`,
  });
}

export { regenerateSingleQuestion } from './singleQuestionRegenerator';

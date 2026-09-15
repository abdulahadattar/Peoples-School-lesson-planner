import { Part, Type } from "@google/genai";
import { GeneratedPaper, PaperSection, PaperQuestion, PaperSectionBlueprint, PaperDifficulty } from "../types";
import { sanitizeStringFields } from './latexSanitizer';
import { sanitizeSingleQuestion } from './paperLayout';
import { curriculumData } from "../curriculum";
import { requestJsonWithRetry, downloadPdfAsPart, LogCallback } from "./geminiService";
import { cleanAndParseJson } from './jsonHelpers';
import { loadSloChapter } from './sloData';

const getGradeName = (gradeId: string): string => {
  const cls = curriculumData.classes.find((c) => c.id === gradeId);
  return cls?.name || gradeId;
};

const getSubjectName = (gradeId: string, subjectId: string): string => {
  const cls = curriculumData.classes.find((c) => c.id === gradeId);
  const subject = cls?.subjects.find((s) => s.id === subjectId);
  return subject?.name || subjectId;
};

const getChapterName = (
  gradeId: string,
  subjectId: string,
  chapterId: string
): string => {
  const cls = curriculumData.classes.find((c) => c.id === gradeId);
  const subject = cls?.subjects.find((s) => s.id === subjectId);
  const chapter = subject?.chapters.find((ch) => ch.id === chapterId);
  return chapter?.name || chapterId;
};

const getChapterSLOs = (
  gradeId: string,
  subjectId: string,
  chapterId: string
): string[] => {
  const cls = curriculumData.classes.find((c) => c.id === gradeId);
  const subject = cls?.subjects.find((s) => s.id === subjectId);
  const chapter = subject?.chapters.find((ch) => ch.id === chapterId);
  return chapter?.slos.map((s) => `${s.id}: ${s.text}`) || [];
};

/**
 * Generate a full exam paper JSON via the Gemini API.
 */
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
  const slos = getChapterSLOs(gradeId, subjectId, chapterId);

  // Students attempt every MCQ but only a chosen subset of the listed short
  // and long questions — marks are earned by what is attempted.
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

  const isMcqOnly = shortQuestionCount === 0 && longQuestionCount === 0;

  let sectionRules = '';
  if (isMcqOnly) {
    sectionRules = `
    - Section A (MCQs Only): Generate exactly ${mcqCount} high-quality Multiple Choice Questions covering all concepts/SLOs of the whole chapter. Each question carries ${mcqMarksPerQuestion} mark. Total = ${mcqMarks} marks.
    - Do NOT generate Section B or Section C. Output only Section A in the sections array.`;
  } else {
    sectionRules = `
    - Section A (MCQs): ${mcqCount} questions x ${mcqMarksPerQuestion} mark each = ${mcqMarks} marks (all are attempted).
    ${shortQuestionCount > 0 ? `- Section B (Short Questions): generate exactly ${shortQuestionCount} short questions x ${shortMarksPerQuestion} marks each; students attempt any ${attemptShort} of them = ${shortMarks} marks.` : ''}
    ${longQuestionCount > 0 ? `- Section C (Long Questions): generate exactly ${longQuestionCount} long questions x ${longMarksPerQuestion} marks each; students attempt any ${attemptLong} of them = ${longMarks} marks.` : ''}
    ${shortQuestionCount - attemptShort > 0 || longQuestionCount - attemptLong > 0 ? `- The optional (non-attempted) questions (${shortQuestionCount - attemptShort > 0 ? `${shortQuestionCount - attemptShort} short optional` : ''}${shortQuestionCount - attemptShort > 0 && longQuestionCount - attemptLong > 0 ? ', ' : ''}${longQuestionCount - attemptLong > 0 ? `${longQuestionCount - attemptLong} long optional` : ''}) still appear on the paper for student choice.` : ''}`;
  }

  const systemInstruction = `You are an expert exam paper generator for ${subjectName}. Your task is to generate a well-structured exam paper as a JSON object. The paper should be aligned with the Sindh Textbook Board curriculum and the Student Learning Outcomes (SLOs) provided.

**Critical Instructions:**
1.  **SLO-Aligned:** All questions must be directly based on the provided SLOs and the chapter content.
2.  **Bloom's Taxonomy:** Include questions at different cognitive levels (Knowledge, Understanding, Application, Analysis).
3.  **Clear Instructions:** Provide clear instructions for each section.
4.  **Mark Distribution:** Ensure the total marks match exactly ${validatedTotalMarks} marks.${sectionRules}
5.  **No per-question marks in question text:** Never place mark values or labels inside individual questions. Marks appear ONLY in each section's instruction line.
6.  **Clean Question Text:** NEVER write question numbers or prefixes (like "1.", "Q1:", "Question 1:", "(a)") in the 'question' field. The system automatically numbers every question. Write ONLY the question content.
7.  **Clean MCQ Options:** For MCQs, the 'options' array MUST contain exactly 4 clean choice texts WITHOUT prefixes (do NOT write "A)", "(A)", "a.", "○ A)"). The renderer automatically prefixes choices with circles and letters. Never put options inside the 'question' text.
8.  **MANDATORY JSON OUTPUT:** The output must ONLY be a valid JSON object matching the provided schema. Do not add any extra text or markdown.
9.  **EQUATIONS — ONLY for real math, NEVER for text:** Wrap mathematical equations, formulas and expressions in LaTeX delimiters, and NOTHING else:
    - Inline equations use single dollar signs: $E = mc^2$, $PV = nRT$, $F = ma$
    - Display equations use double dollar signs: $$\\frac{3}{2}kT$$
    - Includes fractions (3/2) → $\\frac{3}{2}$, powers v^2 → $v^2$, Greek letters rho → $\\rho$, units like $g/cm^3$, $kg/m^3$, $10^{23}$
    - Example option: "$P = \\frac{1}{3} \\rho v^2$"
    - FORBIDDEN — ordinary words, names and emphasis must NEVER go inside dollar signs. Wrong: "define $biology$", "$carbon$ cycle", "$Newton's$ law", "the $first$ law". Keep those as plain text.`;

  const paperSchema = {
    type: Type.OBJECT,
    properties: {
      title: { type: Type.STRING, description: `Paper title: ${subjectName} - ${chapterName}` },
      gradeLevel: { type: Type.STRING, description: gradeName },
      subject: { type: Type.STRING, description: subjectName },
      chapterName: { type: Type.STRING, description: chapterName },
      totalMarks: { type: Type.INTEGER, description: `${totalMarks}` },
      durationMinutes: { type: Type.INTEGER, description: `${durationMinutes}` },
      sections: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            instruction: { type: Type.STRING },
            questions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  type: { type: Type.STRING, enum: ["mcq", "short", "long"] },
                  question: { type: Type.STRING },
                  options: { type: Type.ARRAY, items: { type: Type.STRING } },
                  marks: { type: Type.INTEGER },
                  topic: { type: Type.STRING },
                },
                required: ["id", "type", "question", "marks"],
              },
            },
          },
          required: ["title", "instruction", "questions"],
        },
      },
    },
    required: [
      "title",
      "gradeLevel",
      "subject",
      "chapterName",
      "totalMarks",
      "durationMinutes",
      "sections",
    ],
  };

  const difficultyText =
    difficulty === 'easy' ? 'Easy — favour Knowledge & Understanding questions with direct recall and simple calculations' :
    difficulty === 'hard' ? 'Hard — weight towards Application, Analysis & Evaluation with multi-step problems and unfamiliar contexts' :
    'Medium — a balanced mix of Knowledge, Understanding and Application questions';

  const sloText =
    slos.length > 0 ? slos.map((s) => `- ${s}`).join("\n") : "General chapter content";

  const userPrompt = `Generate an exam paper for the following:

**Subject:** ${subjectName}
**Grade:** ${gradeName}
**Chapter:** ${chapterName}
**Total Marks:** ${totalMarks}
**Duration:** ${durationMinutes} minutes
**Difficulty:** ${difficultyText}

**Student Learning Outcomes (SLOs) for this chapter:**
${sloText}

**Paper Structure Requirements:**
1. Section A - Multiple Choice Questions (MCQs): exactly ${mcqCount} questions, 1 mark each, all attempted
2. Section B - Short Questions: generate ${shortQuestionCount} short questions, 2 marks each; students attempt any ${attemptShort} of them
3. Section C - Long Questions: generate ${longQuestionCount} long questions, 4 marks each; students attempt any ${attemptLong} of them

Set each section's "instruction" field to the marking rule for that section (e.g. "Answer any ${attemptShort} of the ${shortQuestionCount} questions. Each question carries 2 marks."). Do NOT write mark values next to individual questions.

Ensure questions cover all major topics from the chapter and align with the SLOs provided. Make the difficulty appropriate for ${gradeName} students.`;

  // Download chapter PDF for grounding
  let contextParts: Part[] = [];
  try {
    const chapter = await loadSloChapter(gradeId, subjectId, chapterId);
    log(`Found chapter: ${chapter ? chapter.chapter_name : 'null'}, pdf_url: ${chapter?.pdf_url || 'none'}`);
    if (chapter?.pdf_url) {
      log(`Downloading chapter PDF: ${chapter.pdf_url}`);
      const pdfPart = await downloadPdfAsPart(chapter.pdf_url);
      if (pdfPart) {
        contextParts = [pdfPart];
        log(`✓ PDF context loaded (${((pdfPart.inlineData?.data?.length || 0) * 0.75 / 1024).toFixed(0)}KB) — will be sent with API request`);
      } else {
        log(`✗ Could not download PDF, proceeding without book context.`);
      }
    } else {
      log(`No PDF URL found for chapter ${chapterId} in SLO data`);
    }
  } catch (err) {
    log(`Error loading PDF context: ${err instanceof Error ? err.message : String(err)}`);
  }

  return requestJsonWithRetry<GeneratedPaper>({
    operationName: 'generating exam paper',
    systemInstruction,
    userPrompt,
    schema: paperSchema,
    temperature: 0.3,
    contextParts: contextParts.length > 0 ? contextParts : undefined,
    log,
    parse: (raw) => {
      const parsed = cleanAndParseJson(raw);
      const cleaned = sanitizeStringFields(parsed) as GeneratedPaper;
      // Sanitize every question in every section to eliminate hallucinated numbering & prefixes
      if (Array.isArray(cleaned.sections)) {
        cleaned.sections.forEach(sec => {
          if (Array.isArray(sec.questions)) {
            sec.questions = sec.questions.map(q => sanitizeSingleQuestion(q));
          }
        });
      }
      // Attach the marking blueprint (single source of truth for the printed
      // section marks line) — index-aligned with the three sections.
      if (Array.isArray(cleaned.sections)) {
        const blueprints: PaperSectionBlueprint[] = [];
        cleaned.sections.forEach(sec => {
          const title = sec.title.toLowerCase();
          if (title.includes('multiple') || title.includes('mcq') || title.includes('section a')) {
            blueprints.push({
              questionCount: sec.questions?.length || mcqCount,
              attemptCount: sec.questions?.length || mcqCount,
              perQuestionMarks: mcqMarksPerQuestion,
            });
          } else if (title.includes('short') || title.includes('section b')) {
            blueprints.push({
              questionCount: sec.questions?.length || shortQuestionCount,
              attemptCount: Math.min(attemptShort, sec.questions?.length || shortQuestionCount),
              perQuestionMarks: shortMarksPerQuestion,
            });
          } else if (title.includes('long') || title.includes('detailed') || title.includes('section c')) {
            blueprints.push({
              questionCount: sec.questions?.length || longQuestionCount,
              attemptCount: Math.min(attemptLong, sec.questions?.length || longQuestionCount),
              perQuestionMarks: longMarksPerQuestion,
            });
          } else {
            blueprints.push({
              questionCount: sec.questions?.length || 1,
              attemptCount: sec.questions?.length || 1,
              perQuestionMarks: sec.questions?.[0]?.marks || 1,
            });
          }
        });
        cleaned.sectionBlueprints = blueprints;
      }
      return cleaned;
    },
    failMessage: (lastError) => `Failed to generate exam paper: ${lastError.message}`,
  });
}

/**
 * Revise an existing exam paper based on teacher feedback.
 * The teacher can ask to add, remove, or modify questions.
 */
export async function reviseExamPaper(
  currentPaper: GeneratedPaper,
  revisionPrompt: string,
  logCallback?: LogCallback
): Promise<GeneratedPaper> {
  const log = (msg: string) => {
    console.log(`[paperService.revise] ${msg}`);
    logCallback?.(msg);
  };

  // Serialize the current paper as context
  const currentPaperJson = JSON.stringify(currentPaper, null, 2);

  const systemInstruction = `You are an expert exam paper editor for ${currentPaper.subject}. A teacher has provided feedback to revise an existing exam paper. Your task is to modify the paper according to the teacher's instructions while keeping it well-structured and balanced.

**Critical Instructions:**
1. Follow the teacher's revision instructions exactly.
2. Maintain proper question numbering across all sections.
3. Keep the total marks consistent (or update if the teacher changes the structure).
4. Ensure questions are properly formatted with MCQ options where applicable.
5. **EQUATIONS — ONLY for real math, NEVER for text:** Wrap mathematical equations in LaTeX delimiters ($...$ inline, $$...$$ display). Ordinary words, names and emphasis must NEVER be wrapped in dollar signs — only genuine formulas, expressions, powers and units like $g/cm^3$.
6. **MANDATORY JSON OUTPUT:** Output ONLY valid JSON matching the schema. No extra text or markdown.`;

  const paperSchema = {
    type: Type.OBJECT,
    properties: {
      title: { type: Type.STRING },
      gradeLevel: { type: Type.STRING },
      subject: { type: Type.STRING },
      chapterName: { type: Type.STRING },
      totalMarks: { type: Type.INTEGER },
      durationMinutes: { type: Type.INTEGER },
      sections: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            instruction: { type: Type.STRING },
            questions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  type: { type: Type.STRING, enum: ['mcq', 'short', 'long'] },
                  question: { type: Type.STRING },
                  options: { type: Type.ARRAY, items: { type: Type.STRING } },
                  marks: { type: Type.INTEGER },
                  topic: { type: Type.STRING },
                },
                required: ['id', 'type', 'question', 'marks'],
              },
            },
          },
          required: ['title', 'instruction', 'questions'],
        },
      },
    },
    required: ['title', 'gradeLevel', 'subject', 'chapterName', 'totalMarks', 'durationMinutes', 'sections'],
  };

  const userPrompt = `Here is the current exam paper:

${currentPaperJson}

---

**Teacher's revision instructions:**
${revisionPrompt}

Please return the complete revised exam paper as a JSON object.`;

  return requestJsonWithRetry<GeneratedPaper>({
    operationName: 'revising exam paper',
    firstAttemptLog: 'Sending revision request to AI...',
    retryLabel: 'Retrying revision',
    systemInstruction,
    userPrompt,
    schema: paperSchema,
    temperature: 0.3,
    log,
    parse: (raw) => {
      const parsed = cleanAndParseJson(raw);
      const cleaned = sanitizeStringFields(parsed) as GeneratedPaper;
      if (Array.isArray(cleaned.sections)) {
        cleaned.sections.forEach(sec => {
          if (Array.isArray(sec.questions)) {
            sec.questions = sec.questions.map(q => sanitizeSingleQuestion(q));
          }
        });
      }
      log(`Revised paper received: ${cleaned.sections?.length || 0} sections`);
      return cleaned;
    },
    failMessage: (lastError) => `Failed to revise exam paper: ${lastError.message}`,
  });
}

/**
 * Regenerate a single question within an exam paper without altering other questions.
 */
export async function regenerateSingleQuestion(
  paper: GeneratedPaper,
  targetQuestion: PaperQuestion,
  customInstruction?: string,
  logCallback?: LogCallback
): Promise<PaperQuestion> {
  const log = (msg: string) => {
    console.log(`[paperService] ${msg}`);
    logCallback?.(msg);
  };

  const systemInstruction = `You are an expert examination paper setter for Peoples Higher Secondary School Jamshoro (PHSSJ) under the Ziauddin University Examination Board (ZUEB) curriculum.
Generate ONE single replacement question matching:
- Subject: ${paper.subject}
- Class/Grade: ${paper.gradeLevel}
- Chapter/Topic: ${paper.chapterName || 'Standard curriculum'}
- Question Type: ${targetQuestion.type.toUpperCase()}
- Marks: ${targetQuestion.marks}

RULES:
1. Generate an entirely new, syllabus-accurate question.
2. If MCQ: provide exactly 4 clear options (A, B, C, D) in the 'options' array.
3. If Short or Long question: do NOT supply options.
4. Use standard LaTeX delimiters ($...$ inline) ONLY for mathematical equations, powers, and scientific formulas. Never wrap plain text in dollar signs.
5. Strictly output JSON matching the provided schema.`;

  const questionSchema = {
    type: Type.OBJECT,
    properties: {
      id: { type: Type.STRING },
      type: { type: Type.STRING, enum: ['mcq', 'short', 'long'] },
      question: { type: Type.STRING },
      options: { type: Type.ARRAY, items: { type: Type.STRING } },
      marks: { type: Type.INTEGER },
      topic: { type: Type.STRING },
    },
    required: ['id', 'type', 'question', 'marks'],
  };

  const userPrompt = `Replace this question:
"${targetQuestion.question}"
${targetQuestion.options && targetQuestion.options.length > 0 ? `Current options:\n${targetQuestion.options.map((o, i) => `(${String.fromCharCode(65 + i)}) ${o}`).join('\n')}` : ''}

${customInstruction ? `Teacher's specific preference for the replacement: "${customInstruction}"` : 'Please generate an alternative question with appropriate cognitive depth.'}

Provide only the single replacement question JSON object.`;

  return requestJsonWithRetry<PaperQuestion>({
    operationName: 'regenerating question',
    firstAttemptLog: `Regenerating ${targetQuestion.type} question...`,
    retryLabel: 'Retrying question regeneration',
    systemInstruction,
    userPrompt,
    schema: questionSchema,
    temperature: 0.4,
    log,
    parse: (raw) => {
      const parsed = cleanAndParseJson(raw);
      const cleaned = sanitizeSingleQuestion(sanitizeStringFields(parsed) as PaperQuestion);
      if (!cleaned.id) {
        cleaned.id = targetQuestion.id || `q_${Date.now()}`;
      }
      cleaned.type = targetQuestion.type;
      cleaned.marks = targetQuestion.marks;
      log(`✓ Single question regenerated successfully.`);
      return cleaned;
    },
    failMessage: (lastError) => `Failed to regenerate question: ${lastError.message}`,
  });
}


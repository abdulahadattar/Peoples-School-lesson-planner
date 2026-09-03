import { Part, Type } from "@google/genai";
import { GeneratedPaper, PaperSection, PaperQuestion } from "../types";
import { curriculumData } from "../curriculum";
import { withKeyRotation, DEFAULT_MODEL, downloadPdfAsPart, LogCallback } from "./geminiService";
import { cleanAndParseJson } from './jsonHelpers';

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
 * Direct REST API call to Gemini — bypasses the @google/genai SDK which has
 * known timeout bugs with gemma-4-26b-a4b-it (see googleapis/js-genai#1277).
 * Discovered: gemma-4-26b-a4b-it hangs when generationConfig has temperature
 * but no responseSchema — the model waits for schema-based output indefinitely.
 */
async function callGeminiAPI(
  apiKey: string,
  model: string,
  systemInstruction: string,
  userPrompt: string,
  schema: any,
  temperature = 0.3,
  contextParts?: Part[],
  logCallback?: LogCallback
): Promise<string> {
  const log = (msg: string) => {
    console.log(`[paperService.callGeminiAPI] ${msg}`);
    logCallback?.(msg);
  };
  // Build parts: context files (PDFs) first, then the text prompt
  const parts: any[] = [];
  if (contextParts && contextParts.length > 0) {
    for (const part of contextParts) {
      parts.push(part);
    }
    log(`Attached ${contextParts.length} context PDF part(s) to request.`);
  } else {
    log(`No PDF context attached to this request.`);
  }
  parts.push({ text: userPrompt });

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [{ parts }],
        systemInstruction: {
          parts: [{ text: systemInstruction }],
        },
        generationConfig: {
          temperature,
          responseMimeType: "application/json",
          responseSchema: schema,
        },
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  if (data.candidates && data.candidates[0] && data.candidates[0].content) {
    return data.candidates[0].content.parts[0].text;
  }

  throw new Error("No content in API response");
}

export async function generateExamPaper(
  gradeId: string,
  subjectId: string,
  chapterId: string,
  totalMarks: number,
  mcqCount: number,
  shortQuestionCount: number,
  longQuestionCount: number,
  durationMinutes: number,
  logCallback?: LogCallback
): Promise<GeneratedPaper> {
  const log = (msg: string) => {
    console.log(`[paperService] ${msg}`);
    logCallback?.(msg);
  };
  const gradeName = getGradeName(gradeId);
  const subjectName = getSubjectName(gradeId, subjectId);
  const chapterName = getChapterName(gradeId, subjectId, chapterId);
  const slos = getChapterSLOs(gradeId, subjectId, chapterId);

  const mcqMarks = mcqCount * 1;
  const shortMarks = shortQuestionCount * 2;
  const longMarks = longQuestionCount * 4;
  const totalQuestionMarks = mcqMarks + shortMarks + longMarks;

  if (totalQuestionMarks !== totalMarks) {
    throw new Error(
      `Mark distribution mismatch. Questions total ${totalQuestionMarks} marks but you selected ${totalMarks} marks. Adjust counts to match.`
    );
  }

  const systemInstruction = `You are an expert exam paper generator for ${subjectName}. Your task is to generate a well-structured exam paper as a JSON object. The paper should be aligned with the Sindh Textbook Board curriculum and the Student Learning Outcomes (SLOs) provided.

**Critical Instructions:**
1.  **SLO-Aligned:** All questions must be directly based on the provided SLOs and the chapter content.
2.  **Bloom's Taxonomy:** Include questions at different cognitive levels (Knowledge, Understanding, Application, Analysis).
3.  **Clear Instructions:** Provide clear instructions for each section.
4.  **Mark Distribution:** Ensure the total marks match exactly ${totalMarks} marks.
    - Section A (MCQs): ${mcqCount} questions x 1 mark each = ${mcqMarks} marks
    - Section B (Short Questions): ${shortQuestionCount} questions x 2 marks each = ${shortMarks} marks
    - Section C (Long Questions): ${longQuestionCount} questions x 4 marks each = ${longMarks} marks
5.  **MANDATORY JSON OUTPUT:** The output must ONLY be a valid JSON object matching the provided schema. Do not add any extra text or markdown.
6.  **EQUATIONS:** Wrap ALL mathematical equations, formulas, and expressions in LaTeX delimiters:
    - Inline equations: use single dollar signs, e.g. $E = mc^2$, $PV = nRT$, $F = ma$
    - Display equations: use double dollar signs, e.g. $$\frac{3}{2}kT$$
    - This includes fractions like (3/2) → $\frac{3}{2}$, powers like v^2 → $v^2$, Greek letters like rho → $\rho$
    - Example option: "$P = \frac{1}{3} \rho v^2$"`;

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

  const sloText =
    slos.length > 0 ? slos.map((s) => `- ${s}`).join("\n") : "General chapter content";

  const userPrompt = `Generate an exam paper for the following:

**Subject:** ${subjectName}
**Grade:** ${gradeName}
**Chapter:** ${chapterName}
**Total Marks:** ${totalMarks}
**Duration:** ${durationMinutes} minutes

**Student Learning Outcomes (SLOs) for this chapter:**
${sloText}

**Paper Structure Requirements:**
1. Section A - Multiple Choice Questions (MCQs): ${mcqCount} questions, 1 mark each
2. Section B - Short Questions: ${shortQuestionCount} questions, 2 marks each
3. Section C - Long Questions: ${longQuestionCount} questions, 4 marks each

Ensure questions cover all major topics from the chapter and align with the SLOs provided. Make the difficulty appropriate for ${gradeName} students.`;

  // Download chapter PDF for grounding
  let contextParts: Part[] = [];
  try {
    const gradeNum = gradeId.replace('class', '');
    const grade = `Grade ${parseInt(gradeNum, 10)}`;
    const chapterNum = parseInt(chapterId.replace('ch', ''), 10);
    const sloPath = `/curriculum/slos/${grade}/${subjectId.toLowerCase()}.json`;
    log(`Fetching SLO data from: ${sloPath}`);
    const sloResponse = await fetch(sloPath);
    log(`SLO response status: ${sloResponse.status}`);
    if (sloResponse.ok) {
      const sloData = await sloResponse.json();
      const chapter = sloData.chapters?.find((c: any) => c.chapter_number === chapterNum);
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
        log(`No PDF URL found for chapter ${chapterNum} in SLO data`);
      }
    } else {
      log(`SLO data not found at ${sloPath} (status ${sloResponse.status})`);
    }
  } catch (err) {
    log(`Error loading PDF context: ${err instanceof Error ? err.message : String(err)}`);
  }

  const MAX_RETRIES = 2;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        log(`Retrying (attempt ${attempt + 1}/${MAX_RETRIES + 1})...`);
      }
      const response = await withKeyRotation(async (apiKey) => {
        log(`Calling Gemini API with model: ${DEFAULT_MODEL}`);
        return callGeminiAPI(
          apiKey,
          DEFAULT_MODEL,
          systemInstruction,
          userPrompt,
          paperSchema,
          0.3,
          contextParts.length > 0 ? contextParts : undefined,
          logCallback
        );
      });

      const parsed = cleanAndParseJson(response);
      return parsed as GeneratedPaper;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(`Error generating exam paper (attempt ${attempt + 1}):`, error);
      log(`ERROR (attempt ${attempt + 1}): ${lastError.message}`);

      // Retry on parse errors
      if ((lastError.message.includes("parse") || lastError.message.includes("JSON") || lastError.message.includes("Unexpected")) && attempt < MAX_RETRIES) {
        log("Response was malformed, requesting new response...");
        continue;
      }

      if (attempt === MAX_RETRIES) {
        throw new Error(`Failed to generate exam paper: ${lastError.message}`);
      }
    }
  }

  throw new Error(`Failed to generate exam paper: ${lastError?.message || 'Unknown error'}`);
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
5. **EQUATIONS:** Wrap ALL mathematical equations in LaTeX delimiters: $...$ for inline, $$...$$ for display.
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

  const MAX_RETRIES = 2;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) log(`Retrying revision (attempt ${attempt + 1}/${MAX_RETRIES + 1})...`);
      else log('Sending revision request to AI...');

      const response = await withKeyRotation(async (apiKey) => {
        log(`Calling Gemini API with model: ${DEFAULT_MODEL}`);
        return callGeminiAPI(
          apiKey,
          DEFAULT_MODEL,
          systemInstruction,
          userPrompt,
          paperSchema,
          0.3,
          undefined,
          logCallback
        );
      });

      const parsed = cleanAndParseJson(response);
      log(`Revised paper received: ${parsed.sections?.length || 0} sections`);
      return parsed as GeneratedPaper;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(`Error revising exam paper (attempt ${attempt + 1}):`, error);
      log(`ERROR (attempt ${attempt + 1}): ${lastError.message}`);

      if ((lastError.message.includes('parse') || lastError.message.includes('JSON') || lastError.message.includes('Unexpected')) && attempt < MAX_RETRIES) {
        log('Response was malformed, requesting new response...');
        continue;
      }

      if (attempt === MAX_RETRIES) {
        throw new Error(`Failed to revise exam paper: ${lastError.message}`);
      }
    }
  }

  throw new Error(`Failed to revise exam paper: ${lastError?.message || 'Unknown error'}`);
}

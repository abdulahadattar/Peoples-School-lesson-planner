import { GoogleGenAI, Type } from "@google/genai";
import { GeneratedPaper, PaperSection, PaperQuestion } from '../types';
import { curriculumData } from '../curriculum';

function cleanAndParseJson(text: string): any {
  let cleanText = text.replace(/```json\s*/g, '').replace(/```\s*$/g, '');
  const firstBrace = cleanText.indexOf('{');
  const lastBrace = cleanText.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1) {
    cleanText = cleanText.substring(firstBrace, lastBrace + 1);
  }
  try {
    return JSON.parse(cleanText);
  } catch (error) {
    throw new Error(`Failed to parse JSON response: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

const getGradeName = (gradeId: string): string => {
  const cls = curriculumData.classes.find(c => c.id === gradeId);
  return cls?.name || gradeId;
};

const getSubjectName = (gradeId: string, subjectId: string): string => {
  const cls = curriculumData.classes.find(c => c.id === gradeId);
  const subject = cls?.subjects.find(s => s.id === subjectId);
  return subject?.name || subjectId;
};

const getChapterName = (gradeId: string, subjectId: string, chapterId: string): string => {
  const cls = curriculumData.classes.find(c => c.id === gradeId);
  const subject = cls?.subjects.find(s => s.id === subjectId);
  const chapter = subject?.chapters.find(ch => ch.id === chapterId);
  return chapter?.name || chapterId;
};

const getChapterSLOs = (gradeId: string, subjectId: string, chapterId: string): string[] => {
  const cls = curriculumData.classes.find(c => c.id === gradeId);
  const subject = cls?.subjects.find(s => s.id === subjectId);
  const chapter = subject?.chapters.find(ch => ch.id === chapterId);
  return chapter?.slos.map(s => `${s.id}: ${s.text}`) || [];
};

export async function generateExamPaper(
  gradeId: string,
  subjectId: string,
  chapterId: string,
  totalMarks: number,
  mcqCount: number,
  shortQuestionCount: number,
  longQuestionCount: number,
  durationMinutes: number
): Promise<GeneratedPaper> {
  const apiKey = import.meta.env.VITE_API_KEY as string | undefined;
  const ai = new GoogleGenAI({ apiKey: apiKey || '' });

  if (!apiKey) {
    throw new Error("API_KEY environment variable not set. Create a .env.local file with VITE_API_KEY=your_key");
  }

  const gradeName = getGradeName(gradeId);
  const subjectName = getSubjectName(gradeId, subjectId);
  const chapterName = getChapterName(gradeId, subjectId, chapterId);
  const slos = getChapterSLOs(gradeId, subjectId, chapterId);

  const mcqMarks = mcqCount * 1;
  const shortMarks = shortQuestionCount * 2;
  const longMarks = longQuestionCount * 4;
  const totalQuestionMarks = mcqMarks + shortMarks + longMarks;

  if (totalQuestionMarks !== totalMarks) {
    throw new Error(`Mark distribution mismatch. Questions total ${totalQuestionMarks} marks but you selected ${totalMarks} marks. Adjust counts to match.`);
  }

  if (totalQuestionMarks !== totalMarks) {
    throw new Error(`Question marks total (${totalQuestionMarks}) does not match declared totalMarks (${totalMarks}).`);
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
5.  **MANDATORY JSON OUTPUT:** The output must ONLY be a valid JSON object matching the provided schema. Do not add any extra text or markdown.`;

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

  const sloText = slos.length > 0 ? slos.map(s => `- ${s}`).join('\n') : 'General chapter content';

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

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-flash-lite-latest',
      contents: { parts: [{ text: userPrompt }] },
      config: {
        systemInstruction,
        temperature: 0.3,
        responseMimeType: "application/json",
        responseSchema: paperSchema,
      },
    });

    const parsed = cleanAndParseJson(response.text);
    return parsed as GeneratedPaper;
  } catch (error) {
    console.error("Error generating exam paper:", error);
    if (error instanceof Error) {
      throw new Error(`Failed to generate exam paper: ${error.message}`);
    }
    throw new Error("Unknown error during paper generation.");
  }
}

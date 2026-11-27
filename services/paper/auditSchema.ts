/**
 * auditSchema.ts — Compact Gemini JSON schema for the PDF + Word Exam Paper Auditor.
 * Uses a structured diff payload (only items needing fixes) so even 50-MCQ papers
 * audit well inside request timeouts without re-echoing clean questions.
 */
import { Type } from '@google/genai';

export const paperAuditSchema = {
  type: Type.OBJECT,
  properties: {
    passed: {
      type: Type.BOOLEAN,
      description: 'True only if PDF & Word layout, spelling, scientific facts, math equations, and ALL MCQ answer keys are completely accurate.',
    },
    summary: {
      type: Type.STRING,
      description: 'Plain-language 1-sentence summary of the verification result (zero technical jargon).',
    },
    headerFix: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING },
        sectionFixes: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              sectionIndex: { type: Type.INTEGER },
              title: { type: Type.STRING },
              instruction: { type: Type.STRING },
            },
            required: ['sectionIndex'],
          },
        },
      },
    },
    questionFixes: {
      type: Type.ARRAY,
      description: 'List ONLY questions that contain a spelling/grammar error, hallucination, duplicate, broken math/chemistry formatting, leftover prefix, or wrong MCQ correctAnswer.',
      items: {
        type: Type.OBJECT,
        properties: {
          sectionIndex: { type: Type.INTEGER },
          questionIndex: { type: Type.INTEGER },
          issueCategory: {
            type: Type.STRING,
            enum: [
              'answer_key',
              'factual_hallucination',
              'spelling_grammar',
              'latex_math',
              'formatting_layout',
              'duplicate',
              'syllabus',
              'count_marks',
            ],
          },
          reason: {
            type: Type.STRING,
            description: 'Short plain-language explanation of what was wrong and corrected.',
          },
          fixedQuestion: { type: Type.STRING },
          fixedOptions: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'Exactly 4 clean option texts (no A)/B)/C)/D) prefix).',
          },
          fixedCorrectAnswer: {
            type: Type.STRING,
            enum: ['A', 'B', 'C', 'D'],
            description: 'Verified correct MCQ option letter (A, B, C, or D).',
          },
        },
        required: ['sectionIndex', 'questionIndex', 'issueCategory', 'reason'],
      },
    },
    layoutWarnings: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Any layout or visual formatting warnings noticed in the PDF or Word builds that require teacher review.',
    },
  },
  required: ['passed', 'summary', 'questionFixes', 'layoutWarnings'],
};

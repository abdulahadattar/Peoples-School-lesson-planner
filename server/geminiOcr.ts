import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type { DocumentOcrExtraction } from '../src/types.ts';

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured on the server.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function extractDocumentWithGemini(params: {
  imageBase64: string;
  mimeType: string;
  fileName: string;
  folderHint?: string;
}): Promise<DocumentOcrExtraction> {
  const ai = getAiClient();
  const cleanBase64 = params.imageBase64.replace(/^data:image\/[a-zA-Z0-9+]+;base64,/, '');

  const promptText = [
    'You are an expert school records archivist analyzing a high-contrast greyscale scan of a school or government identity document.',
    `Original file name: "${params.fileName}"${params.folderHint ? ` inside folder "${params.folderHint}"` : ''}.`,
    'Classify the documentType accurately:',
    '- "b_form": NADRA Child Registration Certificate (CRC / B-Form / Form-B). Extract fatherName, fatherCnic (format XXXXX-XXXXXXX-X if visible), and EVERY child listed in the table inside children[].',
    '- "father_cnic": NADRA National Identity Card (CNIC / NICOP) of father/guardian. Extract fatherName and fatherCnic (format XXXXX-XXXXXXX-X).',
    '- "marksheet": School marksheet, transcript, progress report, or board result card. Extract studentName, grNumberDetected (if printed), className, fatherName, and academicDetails.',
    '- "admission_form": School admission or registration form. Extract all visible student and father details.',
    '- "other_document": Any other text document.',
    'Do not hallucinate fields that are not clearly visible on the document; omit or leave empty string if unreadable.',
    'Normalize CNIC and B-Form numbers into 13 digits with dashes (XXXXX-XXXXXXX-X) when all 13 digits are readable.',
    'Normalize dates to YYYY-MM-DD when full day/month/year is visible.',
  ].join('\n');

  const responseSchema = {
    type: Type.OBJECT,
    properties: {
      documentType: {
        type: Type.STRING,
        description:
          'One of: b_form, father_cnic, marksheet, admission_form, other_document',
      },
      studentName: { type: Type.STRING },
      grNumberDetected: { type: Type.STRING },
      className: { type: Type.STRING },
      fatherName: { type: Type.STRING },
      fatherCnic: { type: Type.STRING },
      dateOfBirth: { type: Type.STRING },
      bFormNumber: { type: Type.STRING },
      children: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            fullName: { type: Type.STRING },
            bFormNumber: { type: Type.STRING },
            dateOfBirth: { type: Type.STRING },
            gender: { type: Type.STRING },
          },
          required: ['fullName'],
        },
      },
      academicDetails: {
        type: Type.OBJECT,
        properties: {
          examName: { type: Type.STRING },
          year: { type: Type.STRING },
          totalMarks: { type: Type.STRING },
          obtainedMarks: { type: Type.STRING },
          percentage: { type: Type.STRING },
          grade: { type: Type.STRING },
        },
      },
      confidence: {
        type: Type.NUMBER,
        description: 'Extraction confidence between 0 and 1',
      },
      summary: {
        type: Type.STRING,
        description: 'Concise 1-sentence summary of what was read on this page',
      },
    },
    required: ['documentType', 'children', 'confidence', 'summary'],
  };

  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: params.mimeType === 'image/png' ? 'image/png' : 'image/jpeg',
                data: cleanBase64,
              },
            },
            { text: promptText },
          ],
        },
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema,
        },
      });

      const raw = (response.text ?? '{}').trim();
      const parsed = JSON.parse(raw) as Partial<DocumentOcrExtraction>;

      const validTypes = [
        'b_form',
        'father_cnic',
        'marksheet',
        'admission_form',
        'other_document',
      ] as const;
      const docType = validTypes.includes(parsed.documentType as typeof validTypes[number])
        ? (parsed.documentType as DocumentOcrExtraction['documentType'])
        : 'other_document';

      return {
        documentType: docType,
        studentName: parsed.studentName?.trim() || undefined,
        grNumberDetected: parsed.grNumberDetected?.trim() || undefined,
        className: parsed.className?.trim() || undefined,
        fatherName: parsed.fatherName?.trim() || undefined,
        fatherCnic: parsed.fatherCnic?.trim() || undefined,
        dateOfBirth: parsed.dateOfBirth?.trim() || undefined,
        bFormNumber: parsed.bFormNumber?.trim() || undefined,
        children: Array.isArray(parsed.children)
          ? parsed.children
              .filter((c) => c && typeof c.fullName === 'string' && c.fullName.trim().length > 0)
              .map((c) => ({
                fullName: c.fullName.trim(),
                bFormNumber: c.bFormNumber?.trim() || undefined,
                dateOfBirth: c.dateOfBirth?.trim() || undefined,
                gender: c.gender?.trim() || undefined,
              }))
          : [],
        academicDetails: parsed.academicDetails,
        confidence:
          typeof parsed.confidence === 'number'
            ? Math.max(0, Math.min(1, parsed.confidence))
            : 0.75,
        summary: parsed.summary?.trim() || 'Extracted document text fields.',
      };
    } catch (error) {
      lastError = error;
      const msg = error instanceof Error ? error.message : String(error);
      const isRetryable =
        msg.includes('429') ||
        msg.includes('503') ||
        msg.includes('RESOURCE_EXHAUSTED') ||
        msg.includes('UNAVAILABLE');
      if (!isRetryable || attempt === 2) {
        break;
      }
      await sleep(750 * Math.pow(2, attempt));
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

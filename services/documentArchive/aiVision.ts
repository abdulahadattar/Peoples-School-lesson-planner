import { cleanAndParseJson } from '../jsonHelpers.js';
import {
  GEMINI_PROXY_MODEL_CHAIN,
  isModelNotFoundOrUnsupported,
  withPromiseTimeout,
} from '../routes/proxyHelpers.js';
import { addJobLog } from './store.js';

export const EXTRACTION_SCHEMA = {
  type: 'OBJECT',
  properties: {
    classification: {
      type: 'STRING',
      enum: [
        'STUDENT_PHOTO', 'B_FORM', 'FATHER_CNIC_FRONT', 'FATHER_CNIC_BACK',
        'STUDENT_PROFILE_FORM', 'MARKS_CERTIFICATE', 'BIRTH_CERTIFICATE',
        'SCHOOL_LEAVING_CERTIFICATE', 'ADMISSION_FORM', 'IGNORED_NOISE', 'OTHER_UNCLASSIFIED',
      ],
      description: 'The type of educational or civil document.',
    },
    suggestedRotation: {
      type: 'INTEGER',
      description: '0 if upright. If sideways or upside down, specify clockwise rotation (90, 180, 270).',
    },
    confidence: { type: 'NUMBER', description: 'Confidence between 0.0 and 1.0' },
    studentNameEnglish: { type: 'STRING', description: 'Student name in clean English title case' },
    studentNameUrdu: { type: 'STRING', description: 'Student name in Urdu if present' },
    studentNameSindhi: { type: 'STRING', description: 'Student name in Sindhi script if present' },
    fatherNameEnglish: { type: 'STRING', description: 'Father name in clean English title case.' },
    fatherNameUrdu: { type: 'STRING', description: 'Father name in Urdu if present' },
    fatherNameSindhi: { type: 'STRING', description: 'Father name in Sindhi script if present' },
    cardholderNameEnglish: { type: 'STRING', description: 'On CNIC (FATHER_CNIC_FRONT), cardholder is the student father.' },
    cardholderFatherNameEnglish: { type: 'STRING', description: 'On CNIC (FATHER_CNIC_FRONT), Father Name on card is student paternal grandfather.' },
    applicantName: { type: 'STRING', description: 'On NADRA B-Form / CRC certificate, applicant is the Father / Guardian.' },
    applicantCnic: { type: 'STRING', description: 'On NADRA B-Form / CRC certificate, applicant CNIC.' },
    childCitizenNumber: { type: 'STRING', description: '13-digit CITIZEN NUMBER of child on B-Form / CRC.' },
    children: {
      type: 'ARRAY',
      description: 'On multi-child NADRA B-Form, extract all children listed in table rows.',
      items: {
        type: 'OBJECT',
        properties: {
          entryNo: { type: 'INTEGER', description: 'Row serial number (1, 2, 3...)' },
          childNameEnglish: { type: 'STRING', description: 'Child name in clean English title case' },
          childNameSindhi: { type: 'STRING', description: 'Child name in Sindhi script' },
          childNameUrdu: { type: 'STRING', description: 'Child name in Urdu script' },
          bFormNo: { type: 'STRING', description: '13-digit NADRA B-Form' },
          dob: { type: 'STRING', description: 'Date of birth DD-MM-YYYY' },
          gender: { type: 'STRING', enum: ['Male', 'Female'] },
          fatherNameEnglish: { type: 'STRING', description: 'Father name if written in row' },
          fatherNameSindhi: { type: 'STRING', description: 'Father name in Sindhi script' },
          fatherCnic: { type: 'STRING', description: 'Father CNIC if written in row' },
          hasTickMark: { type: 'BOOLEAN', description: 'True if there is a mark next to child row' },
        },
      },
    },
    hasEnglishText: { type: 'BOOLEAN', description: 'True if names printed in English Latin letters.' },
    caste: { type: 'STRING', description: 'Leave empty unless explicit caste word is literally printed in name field.' },
    paternalGrandfatherName: { type: 'STRING', description: "On Father's CNIC, father of cardholder (paternal grandfather)." },
    bFormNo: { type: 'STRING', description: '13-digit NADRA B-Form or Child Registration CITIZEN NUMBER.' },
    fatherCnic: { type: 'STRING', description: '13-digit NADRA CNIC of Father or Guardian' },
    dob: { type: 'STRING', description: 'Date of birth DD-MM-YYYY' },
    gender: { type: 'STRING', enum: ['Male', 'Female', 'Unknown'] },
    grNo: { type: 'STRING', description: 'G.R. / Admission number if written on document' },
    classAdmitted: { type: 'STRING', description: 'Class admitted' },
    previousSchool: { type: 'STRING', description: 'Name of previous school' },
    marksheetDetails: {
      type: 'OBJECT',
      properties: {
        examName: { type: 'STRING' },
        seatNo: { type: 'STRING' },
        board: { type: 'STRING' },
        totalMarks: { type: 'NUMBER' },
        obtainedMarks: { type: 'NUMBER' },
        grade: { type: 'STRING' },
        passingYear: { type: 'STRING' },
      },
    },
  },
  required: ['classification', 'confidence', 'suggestedRotation'],
};

const SYSTEM_INSTRUCTION_TEXT =
  'You are an expert Pakistani educational document archivist for Peoples Higher Secondary School Jamshoro (Sindh). Accurately classify documents, detect orientation, and extract student info. Support English, Urdu, and Sindhi.';

export interface GeminiVisionResponse {
  ok: boolean;
  error?: string;
  result: any;
  modelUsed: string;
  keyAttempts: number;
  durationMs: number;
}

let globalKeyCursor = 0;

export async function callGeminiVision(
  imageBuffer: Buffer,
  prompt: string,
  schema: any,
  serverKeys: string[],
  jobId?: string,
  filename?: string,
  grNo?: string
): Promise<GeminiVisionResponse> {
  const startTime = Date.now();
  const base64Data = imageBuffer.toString('base64');
  const modelsToTry = [...GEMINI_PROXY_MODEL_CHAIN];
  const totalBudgetMs = 60000;
  const deadline = startTime + totalBudgetMs;

  let lastError = serverKeys.length === 0 ? 'No server Gemini API keys configured' : '';
  let keyAttempts = 0;
  const { GoogleGenAI } = await import('@google/genai');

  for (const model of modelsToTry) {
    const isGemma = model.toLowerCase().startsWith('gemma-');
    const startKeyIdx = (globalKeyCursor++) % Math.max(1, serverKeys.length);
    for (let i = 0; i < serverKeys.length; i++) {
      const keyIdx = (startKeyIdx + i) % serverKeys.length;
      if (Date.now() >= deadline) {
        lastError = `Budget of ${totalBudgetMs}ms exhausted before trying ${model}`;
        break;
      }
      const key = serverKeys[keyIdx];
      if (!key) continue;
      keyAttempts++;
      const maskedKey = `${key.slice(0, 6)}...${key.slice(-4)}`;
      const remaining = deadline - Date.now();
      const attemptTimeout = Math.max(6000, Math.min(25000, remaining));

      try {
        const ai = new GoogleGenAI({
          apiKey: key,
          httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
        });
        const effectivePrompt = isGemma
          ? `${SYSTEM_INSTRUCTION_TEXT}\n\n${prompt}\n\nRespond ONLY with valid JSON matching keys: classification (one of ${EXTRACTION_SCHEMA.properties.classification.enum.join(', ')}), suggestedRotation (0|90|180|270), confidence (0..1), studentNameEnglish, fatherNameEnglish, grNo, bFormNo, fatherCnic, dob, gender, classAdmitted, previousSchool, children.`
          : prompt;

        const config: Record<string, any> = isGemma
          ? { temperature: 0.1 }
          : {
              temperature: 0.1,
              responseMimeType: 'application/json',
              responseSchema: schema,
              systemInstruction: SYSTEM_INSTRUCTION_TEXT,
            };

        const response = await withPromiseTimeout(
          ai.models.generateContent({
            model,
            contents: [
              {
                role: 'user',
                parts: [
                  { inlineData: { mimeType: 'image/jpeg', data: base64Data } },
                  { text: effectivePrompt },
                ],
              },
            ],
            config,
          }),
          attemptTimeout,
          `Vision ${model}`
        );

        const text = response?.text;
        if (text && text.trim()) {
          let parsed: any;
          try {
            parsed = cleanAndParseJson(text);
          } catch {
            lastError = `[${model}] Key #${i + 1} returned unparseable JSON`;
            continue;
          }
          if (!parsed || typeof parsed !== 'object' || !parsed.classification) {
            lastError = `[${model}] Key #${i + 1} missing classification field in JSON`;
            continue;
          }
          const durationMs = Date.now() - startTime;
          if (jobId) {
            addJobLog(
              jobId,
              'success',
              'AI_VISION',
              `AI Classification: ${parsed.classification} (${Math.round((parsed.confidence || 0.8) * 100)}% conf) using ${model}`,
              { filename, grNo, details: `Model: ${model} | Key #${i + 1} (${maskedKey}) | Time: ${durationMs}ms`, executionTimeMs: durationMs }
            );
          }
          return { ok: true, result: parsed, modelUsed: model, keyAttempts, durationMs };
        }
        lastError = `[${model}] Key #${i + 1} (${maskedKey}) returned empty text`;
      } catch (err: any) {
        const status = Number(err?.status || err?.code) || 0;
        const msg = err?.message || String(err);
        lastError = `[${model}] Key #${i + 1} (${maskedKey})${status ? ` HTTP ${status}` : ''}: ${msg.slice(0, 180)}`;
        if (isModelNotFoundOrUnsupported(status, msg) || (status === 400 && /invalid_argument|schema|systeminstruction|responsemimetype/i.test(msg))) {
          break;
        }
      }
    }
  }

  const durationMs = Date.now() - startTime;
  if (jobId) {
    addJobLog(
      jobId,
      'error',
      'AI_VISION',
      `AI classification failed for ${filename || 'scan'}: ${lastError || 'All models exhausted'}. Saved as unclassified for manual review.`,
      { filename, grNo, details: lastError, executionTimeMs: durationMs }
    );
  }

  return {
    ok: false,
    error: lastError || 'All AI models exhausted',
    result: { classification: 'OTHER_UNCLASSIFIED', confidence: 0, suggestedRotation: 0 },
    modelUsed: 'none',
    keyAttempts,
    durationMs,
  };
}

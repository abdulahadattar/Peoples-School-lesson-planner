import { cleanAndParseJson } from '../jsonHelpers.js';
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

export async function callGeminiVision(
  imageBuffer: Buffer,
  prompt: string,
  schema: any,
  serverKeys: string[],
  jobId?: string,
  filename?: string,
  grNo?: string
): Promise<{ result: any; modelUsed: string; keyAttempts: number; durationMs: number }> {
  const startTime = Date.now();
  const base64Data = imageBuffer.toString('base64');
  const modelsToTry = [
    'gemini-3.5-flash-lite',
    'gemma-4-26b-a4b-it',
    'gemini-3.1-flash-lite',
    'gemini-3.5-flash',
    'gemini-flash-latest',
  ];
  const totalBudgetMs = 60000;
  const deadline = startTime + totalBudgetMs;

  const requestBody = JSON.stringify({
    contents: [
      {
        parts: [
          { inlineData: { mimeType: 'image/jpeg', data: base64Data } },
          { text: prompt },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: 'application/json',
      responseSchema: schema,
    },
    systemInstruction: {
      parts: [
        {
          text: 'You are an expert Pakistani educational document archivist for Peoples Higher Secondary School Jamshoro (Sindh). Accurately classify documents, detect orientation, and extract student info. Support English, Urdu, and Sindhi.',
        },
      ],
    },
  });

  let lastError = '';
  let keyAttempts = 0;

  for (const model of modelsToTry) {
    for (let i = 0; i < serverKeys.length; i++) {
      if (Date.now() >= deadline) {
        lastError = `Budget of ${totalBudgetMs}ms exhausted before trying ${model}`;
        break;
      }
      const key = serverKeys[i];
      if (!key) continue;
      keyAttempts++;
      const maskedKey = `${key.slice(0, 6)}...${key.slice(-4)}`;
      const remaining = deadline - Date.now();
      const attemptTimeout = Math.max(5000, Math.min(25000, remaining));

      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
          body: requestBody,
          signal: AbortSignal.timeout(attemptTimeout),
        });

        if (res.ok) {
          const data = (await res.json()) as any;
          const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            let parsed;
            try {
              parsed = cleanAndParseJson(text);
            } catch (e) {
              parsed = { classification: 'OTHER_UNCLASSIFIED', confidence: 0 };
            }
            const durationMs = Date.now() - startTime;
            if (jobId) {
              addJobLog(
                jobId,
                'success',
                'AI_VISION',
                `AI Classification: ${parsed.classification || 'UNKNOWN'} (${Math.round((parsed.confidence || 0.8) * 100)}% conf) using ${model}`,
                { filename, grNo, details: `Model: ${model} | Key #${i + 1} (${maskedKey}) | Time: ${durationMs}ms`, executionTimeMs: durationMs }
              );
            }
            return { result: parsed, modelUsed: model, keyAttempts, durationMs };
          }
        } else {
          const errBody = await res.text();
          lastError = `[${model}] Key #${i + 1} (${maskedKey}) HTTP ${res.status}: ${errBody.slice(0, 180)}`;
          if (res.status === 404) break;
        }
      } catch (err: any) {
        lastError = `[${model}] Key #${i + 1} network error: ${err.message}`;
      }
    }
  }

  const durationMs = Date.now() - startTime;
  if (jobId) {
    addJobLog(jobId, 'warn', 'AI_VISION', `All AI models exhausted for ${filename}. Saving as unclassified document.`, { filename, grNo, details: lastError, executionTimeMs: durationMs });
  }

  return {
    result: { classification: 'OTHER_UNCLASSIFIED', confidence: 0 },
    modelUsed: 'none',
    keyAttempts,
    durationMs,
  };
}

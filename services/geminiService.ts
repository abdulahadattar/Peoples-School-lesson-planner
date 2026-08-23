import { Part, Type } from "@google/genai";
import { LessonPlan, SLO } from "../types";

/**
 * Google API keys follow the pattern AIzaSy followed by 33 chars.
 * Invalid keys (e.g., AQ.Ab8R... format) hang or return errors.
 */
function isValidApiKey(key: string): boolean {
  return /^AIzaSy[A-Za-z0-9_-]{33}$/.test(key);
}

/**
 * Build the list of available API keys from the environment.
 * Supports both a single VITE_API_KEY and a rotating pool via VITE_API_KEYS (comma-separated).
 * Invalid/expired keys are filtered out to prevent hanging.
 */
function getApiKeyPool(): string[] {
  const keys: string[] = [];

  const single = import.meta.env.VITE_API_KEY;
  if (single && isValidApiKey(single)) {
    keys.push(single);
  }

  const multi = import.meta.env.VITE_API_KEYS;
  if (multi) {
    const allKeys = multi
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);

    const validKeys = allKeys.filter(isValidApiKey);
    const invalidKeys = allKeys.filter((k) => !isValidApiKey(k));

    if (invalidKeys.length > 0) {
      console.warn("[geminiService] Skipping invalid/expired API keys:", invalidKeys.length, "keys");
    }

    keys.push(...validKeys);
  }

  // Deduplicate while preserving order
  return [...new Set(keys)];
}

// Module-level round-robin index across the key pool
let keyPool: string[] = getApiKeyPool();
let keyIndex = 0;

const COOLDOWN_MS = 3 * 60 * 60 * 1000;
const cooldownKeys: Map<string, number> = new Map();

function isKeyInCooldown(key: string): boolean {
  const expiry = cooldownKeys.get(key);
  if (!expiry) return false;
  if (Date.now() >= expiry) {
    cooldownKeys.delete(key);
    return false;
  }
  return true;
}

function addKeyToCooldown(key: string): void {
  cooldownKeys.set(key, Date.now() + COOLDOWN_MS);
}

/**
 * Returns the next API key in round-robin order.
 */
export function getApiKey(): string {
  if (keyPool.length === 0) {
    keyPool = getApiKeyPool();
  }
  if (keyPool.length === 0) {
    throw new Error(
      "API key not set. Configure VITE_API_KEY or VITE_API_KEYS in your .env.local / Vercel env vars."
    );
  }
  const key = keyPool[keyIndex % keyPool.length];
  keyIndex = (keyIndex + 1) % keyPool.length;
  return key;
}

/**
 * Refreshes the key pool from the environment.
 */
export function refreshApiKeyPool(): void {
  keyPool = getApiKeyPool();
  keyIndex = 0;
  cooldownKeys.clear();
}

export const DEFAULT_MODEL = "gemini-3.5-flash-lite";

function isAuthOrQuotaError(error: any): boolean {
  if (error?.message) {
    const message = error.message.toLowerCase();
    return (
      message.includes("401") ||
      message.includes("403") ||
      message.includes("unauthenticated") ||
      message.includes("permission denied") ||
      message.includes("quota exceeded") ||
      message.includes("rate limit") ||
      message.includes("resource exhausted")
    );
  }
  if (error?.code) {
    return error.code === 401 || error.code === 403 || error.code === 429;
  }
  return false;
}

/**
 * Detects API key errors that are permanent and will never succeed on retry.
 * Examples: Google API key has been "suspended", "disabled", or is "invalid".
 */
export function isKeyPermanentlyBlocked(error: unknown): boolean {
  if (error?.message) {
    const message = error.message.toLowerCase();
    return (
      message.includes("suspended") ||
      message.includes("disabled") ||
      message.includes("invalid api key") ||
      message.includes("api key has been")
    );
  }
  return false;
}

/**
 * Calls the Gemini API directly via REST to avoid SDK timeout bugs.
 * Automatically rotates API keys on 401/403/quota errors.
 * Includes a 30-second timeout per attempt.
 */
export async function withKeyRotation<T>(operation: (apiKey: string) => Promise<T>): Promise<T> {
  if (keyPool.length === 0) {
    keyPool = getApiKeyPool();
  }
  if (keyPool.length === 0) {
    throw new Error(
      "API key not set. Configure VITE_API_KEY or VITE_API_KEYS in your .env.local / Vercel env vars."
    );
  }

  let lastError: unknown;
  let attempts = 0;
  let anyKeyAttempted = false;

  while (attempts < keyPool.length) {
    const currentKey = keyPool[keyIndex % keyPool.length];
    keyIndex = (keyIndex + 1) % keyPool.length;
    attempts++;

    if (isKeyInCooldown(currentKey)) {
      continue;
    }

    anyKeyAttempted = true;

    try {
      const result = await Promise.race([
        operation(currentKey),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("API call timed out after 30 seconds")), 30000)
        ),
      ]);
      return result;
    } catch (error) {
      lastError = error;
      const msg = (error as Error)?.message || String(error);

      if (msg.includes("timed out")) {
        console.warn(`[geminiService.withKeyRotation] Timeout on API key (prefix: ${currentKey.slice(0, 7)}...). Rotating to next key.`);
      } else if (isKeyPermanentlyBlocked(error)) {
        console.warn(`[geminiService.withKeyRotation] API key blocked (suspended/disabled/invalid), cooling down for 3h before retry:`, msg.slice(0, 80));
        addKeyToCooldown(currentKey);
      } else if (isAuthOrQuotaError(error)) {
        console.warn(`[geminiService.withKeyRotation] API key failed (auth/quota), rotating to next key:`, msg.slice(0, 80));
      } else {
        throw error;
      }
    }
  }

  if (!anyKeyAttempted) {
    const soonest = Math.min(...cooldownKeys.values());
    const waitMs = Math.max(0, soonest - Date.now());
    const waitMin = Math.round(waitMs / 60000);
    throw new Error(
      `All configured Google API keys are currently in cooldown (suspended/disabled). ` +
      `Earliest retry in ~${waitMin} minutes. ` +
      `Please verify your API keys at https://console.cloud.google.com/apis/credentials.`
    );
  }

  throw lastError;
}

/**
 * Direct REST API call to Gemini — bypasses the buggy @google/genai SDK.
 */
async function callGeminiAPI(
  apiKey: string,
  model: string,
  systemInstruction: string,
  userPrompt: string,
  schema: any,
  temperature = 0.2,
  logCallback?: LogCallback
): Promise<string> {
  const log = (msg: string) => {
    console.log(`[geminiService.callGeminiAPI] ${msg}`);
    logCallback?.(msg);
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  log(`Initiating fetch to: ${url}`);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: userPrompt }] }],
      generationConfig: {
        temperature,
        responseMimeType: "application/json",
        responseSchema: schema,
      },
      systemInstruction: {
        parts: [{ text: systemInstruction }],
      },
    }),
  });

  log(`Received HTTP response. Status: ${response.status} ${response.statusText}`);

  if (!response.ok) {
    const errorText = await response.text();
    log(`ERROR: API request failed. Response body: ${errorText.slice(0, 200)}`);
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }

  log("Parsing response JSON...");
  const data = await response.json();

  if (data.candidates && data.candidates[0] && data.candidates[0].content) {
    const text = data.candidates[0].content.parts[0].text;
    log(`Extracted content from response (${text.length} chars).`);
    return text;
  }

  log("ERROR: No content found in API response candidates.");
  throw new Error("No content in API response");
}

function cleanAndParseJson(text: string): any {
  let cleanText = text.replace(/```json\s*/g, "").replace(/```\s*$/g, "");
  const firstBrace = cleanText.indexOf("{");
  const lastBrace = cleanText.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1) {
    cleanText = cleanText.substring(firstBrace, lastBrace + 1);
  }
  return JSON.parse(cleanText);
}

function parseLessonPlanJson(jsonText: string, gradeLevel: string, subject: string): LessonPlan {
  try {
    const parsed = cleanAndParseJson(jsonText);
    if (!parsed.title || !parsed.objective || !Array.isArray(parsed.activities) || !parsed.homework) {
      throw new Error("Parsed JSON is missing required fields.");
    }
    return {
      ...parsed,
      gradeLevel,
      subject,
    };
  } catch (e) {
    console.error("Error parsing lesson plan JSON:", e);
    if (e instanceof Error) {
      throw new Error(`Failed to parse lesson plan JSON: ${e.message}`);
    }
    throw new Error("Failed to parse the lesson plan JSON generated by the model.");
  }
}

export type LogCallback = (message: string) => void;

export async function generateLessonPlan(
  slo: SLO,
  unitSlos: SLO[],
  contextFileParts?: Part[],
  subjectName?: string,
  logCallback?: LogCallback
): Promise<LessonPlan> {
  const log = (msg: string) => {
    console.log(`[geminiService] ${msg}`);
    logCallback?.(msg);
  };

  const gradeNum = parseInt(slo.grade?.replace(/Grade\s+|Class\s+/i, "") || "9", 10);
  const gradeLevelContext = isNaN(gradeNum) ? `${slo.grade}` : `${slo.grade} (${gradeNum <= 10 ? "Foundational" : "Advanced"})`;
  const subject = subjectName || "General";

  log(`Generating lesson plan for SLO: ${slo.SLO_ID} | Subject: ${subject} | Grade: ${slo.grade}`);

  const systemInstruction = `You are a ${subject} Teacher at Peoples Higher Secondary School Jamshoro, creating a detailed lesson plan for your own use and for school records. Your task is to generate a comprehensive 40-minute lesson plan as a JSON object using the 4As instructional model. The tone should be professional, direct, and suitable for a Pakistani secondary school context.

**The 4As Lesson Plan Structure (Peoples Higher Secondary School Jamshoro Template):**

**A - ACTIVITY (Activating Prior Knowledge)** [5-10 minutes]:
- Engage students with a brief, interactive activity related to the lesson topic
- Connect new content to students' existing knowledge and experiences
- Include specific teacher instructions and expected student responses
- Use questioning techniques, brainstorming, or quick demonstrations

**A - ANALYSIS (Acquiring New Knowledge)** [10-15 minutes]:
- Process the activity and introduce the main concepts
- Present new information clearly with examples relevant to Pakistani students
- Include key definitions, formulas, or principles
- Use questioning and discussion to check understanding
- Provide clear explanations with local context where appropriate

**A - ABSTRACTION (Applying Knowledge - Generalization)** [10-15 minutes]:
- Guide students to generalize and internalize the concept
- Help students identify patterns, principles, or rules
- Connect the lesson to real-life applications in Pakistan
- Summarize key points and clarify misconceptions
- Ensure students can articulate the concept in their own words

**A - APPLICATION (Assessing Knowledge)** [5-10 minutes]:
- Provide a practical task, problem, or assessment activity
- Students apply what they learned to new situations
- Include evaluation criteria or success indicators
- Could be a written exercise, oral questioning, group task, or individual work
- Check for mastery of the lesson objective

**Critical Instructions:**
1.  **Grounded Content:** Base the entire lesson plan ONLY on the attached PDF content if provided. If no PDF, use your knowledge of the ${subject} curriculum for ${slo.grade} as per Sindh Textbook Board (STBB) standards.
2.  **NO SOURCE REFERENCES:** Never mention "the PDF," "textbook," or any source. Present content directly as lesson material.
3.  **Teacher-Centric Tone:** Write in direct instructional style. Use active verbs. Avoid "The teacher will..." or "Students will..." Instead use imperative forms: "Begin by...", "Ask students to...", "Demonstrate...", "Guide learners to...".
4.  **Specific Instructions:** For each activity, provide clear step-by-step teacher actions and anticipated student responses.
5.  **Local Context:** Make examples and applications relevant to Pakistani students, using familiar contexts, names, and scenarios where appropriate.
6.  **Time Allocation:** Each of the 4 activities must have a duration. Total must equal exactly 40 minutes.
7.  **Homework:** Provide a meaningful homework assignment reinforcing the lesson objective, appropriate for Pakistani students.
8.  **MANDATORY JSON OUTPUT:** Output ONLY valid JSON matching the schema. No extra text or markdown.
9.  **Grade Appropriateness:** Content must match ${gradeLevelContext} cognitive level.
`;

  const lessonPlanSchema = {
    type: Type.OBJECT,
    properties: {
      title: { type: Type.STRING, description: "A concise, specific topic for a 40-minute lesson derived from the main SLO." },
      objective: { type: Type.STRING, description: "A clear restatement of the user's provided SLO, framed as a student learning objective." },
      materials: { type: Type.ARRAY, description: "A list of necessary resources, including textbook pages if possible.", items: { type: Type.STRING } },
      activities: {
        type: Type.ARRAY,
        description: "An array of four activities following the 4As framework: Activity (Activating Prior Knowledge), Analysis (Acquiring New Knowledge), Abstraction (Applying Knowledge/Generalization), and Application (Assessing Knowledge).",
        items: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING, enum: ['Activity', 'Analysis', 'Abstraction', 'Application'], description: "The 4As phase name." },
            duration: { type: Type.INTEGER, description: "Duration of this activity in minutes." },
            description: { type: Type.STRING, description: "Detailed teacher instructions and expected student responses for this phase." },
            teacherActions: { type: Type.STRING, description: "Specific actions the teacher should take during this phase." },
          },
          required: ['name', 'duration', 'description', 'teacherActions', 'studentResponses'],
        },
      },
      homework: { type: Type.STRING, description: "A brief but meaningful homework assignment that reinforces the lesson's objective." }
    },
    required: ['title', 'objective', 'materials', 'activities', 'homework'],
  };

  const contextText = unitSlos
    .filter((s) => s.uniqueId !== slo.uniqueId)
    .map((s) => `- ${s.SLO_ID}: ${s.SLO_Text}`)
    .join("\n");

  const userPrompt = `Generate a lesson plan for the following SLO in ${subject}:
**${slo.SLO_ID}: ${slo.SLO_Text}**

For context, here are other SLOs from the same unit:
${contextText || "None"}

Use the attached PDF(s) as the primary reference for content, examples, and activities.`;

  const userPromptLength = userPrompt.length;
  const contextPartCount = contextFileParts?.length ?? 0;
  log(`Built user prompt (${userPromptLength} chars). Context PDF parts attached: ${contextPartCount}.`);

  try {
    log("Calling Gemini API via withKeyRotation...");
    const result = await withKeyRotation(async (apiKey) => {
      log(`Sending request to model: ${DEFAULT_MODEL}`);
      return callGeminiAPI(apiKey, DEFAULT_MODEL, systemInstruction, userPrompt, lessonPlanSchema, 0.2, log);
    });

    log(`Received API response (${result.length} chars). Parsing JSON...`);
    const lessonPlan = parseLessonPlanJson(result, gradeLevelContext, subject);
    log(`Successfully parsed lesson plan: "${lessonPlan.title}"`);
    return lessonPlan;
  } catch (error) {
    console.error("Error generating lesson plan:", error);
    log(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
    if (error instanceof Error) {
      if (error.message.includes("does not support pdf input") || error.message.includes("Cannot read ")) {
        throw new Error("PDF_CONTEXT_NOT_SUPPORTED: The current AI model does not support PDF file input.");
      }
      throw error;
    }
    throw new Error("Unknown error during generation.");
  }
}

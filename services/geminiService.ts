import { Part, Type } from "@google/genai";
import { LessonPlan, SLO, WeeklyLessonPlan } from "../types";
import { cleanAndParseJson } from './jsonHelpers';
import { sanitizeStringFields } from './latexSanitizer';

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

/**
 * Model fallback hierarchy. Every request tries the first model with ALL
 * healthy keys; if every key fails on it, it moves to the next model, and so
 * on. Only when all models × all keys fail does the request fail (and the
 * round-robin index has advanced, so the next request starts from a fresh key).
 */
export const MODEL_CHAIN: string[] = [
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
  "gemma-4-31b-it",
];

function isAuthOrQuotaError(error: any): boolean {
  if (error?.message) {
    const message = error.message.toLowerCase();
    return (
      message.includes("401") ||
      message.includes("403") ||
      message.includes("429") ||
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
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    message.includes("suspended") ||
    message.includes("disabled") ||
    message.includes("invalid api key") ||
    message.includes("api key has been")
  );
}

/**
 * Calls the model API via REST, trying every model in MODEL_CHAIN with every
 * healthy key:
 *
 *   for each model (gemini-3.5-flash-lite → gemini-3.1-flash-lite → gemma-4-31b-it)
 *     for each key (round-robin, skipping cooled-down keys)
 *       attempt operation(key, model)
 *
 * - Key-level failures (timeout / auth / quota / blocked) rotate to the next
 *   key on the SAME model; a key that fails auth/quota on EVERY model is
 *   marked unhealthy and put in cooldown.
 * - Model-level failures (model not found, PDF input unsupported, etc.) skip
 *   the remaining keys and fall through to the next model.
 * - When all models × all keys fail, the round-robin index has advanced, so
 *   the next request starts from a fresh key (automatic key rotation).
 */
export async function withKeyRotation<T>(operation: (apiKey: string, model: string) => Promise<T>): Promise<T> {
  if (keyPool.length === 0) {
    keyPool = getApiKeyPool();
  }
  if (keyPool.length === 0) {
    throw new Error(
      "API key not set. Configure VITE_API_KEY or VITE_API_KEYS in your .env.local / Vercel env vars."
    );
  }

  let lastError: unknown;
  let anyKeyAttempted = false;
  // Health tracker: consecutive auth/quota failures per key across the model
  // chain. A key that fails on every model is unhealthy — cooldown it.
  const keyFailures = new Map<string, number>();

  for (const model of MODEL_CHAIN) {
    let attempts = 0;
    let modelAttempted = false;

    while (attempts < keyPool.length) {
      const currentKey = keyPool[keyIndex % keyPool.length];
      keyIndex = (keyIndex + 1) % keyPool.length;
      attempts++;

      if (isKeyInCooldown(currentKey)) {
        continue;
      }

      modelAttempted = true;
      anyKeyAttempted = true;

      try {
        const result = await Promise.race([
          operation(currentKey, model),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("API call timed out after 30 seconds")), 30000)
          ),
        ]);
        keyFailures.delete(currentKey);
        return result;
      } catch (error) {
        lastError = error;
        const msg = (error as Error)?.message || String(error);

        if (msg.includes("timed out")) {
          console.warn(`[geminiService.withKeyRotation] Timeout on API key (prefix: ${currentKey.slice(0, 7)}...) with ${model}. Rotating to next key.`);
        } else if (isKeyPermanentlyBlocked(error)) {
          console.warn(`[geminiService.withKeyRotation] API key blocked (suspended/disabled/invalid), cooling down for 3h before retry:`, msg.slice(0, 80));
          addKeyToCooldown(currentKey);
          keyFailures.delete(currentKey);
        } else if (isAuthOrQuotaError(error)) {
          const failures = (keyFailures.get(currentKey) ?? 0) + 1;
          if (failures >= MODEL_CHAIN.length) {
            console.warn(`[geminiService.withKeyRotation] API key unhealthy — auth/quota failure on all ${MODEL_CHAIN.length} models, cooling down for 3h:`, msg.slice(0, 80));
            addKeyToCooldown(currentKey);
            keyFailures.delete(currentKey);
          } else {
            keyFailures.set(currentKey, failures);
            console.warn(`[geminiService.withKeyRotation] API key failed (auth/quota) with ${model}, rotating to next key:`, msg.slice(0, 80));
          }
        } else {
          // Model-level or unknown failure — no point exhausting the remaining
          // keys on this model; fall through to the next model in the chain.
          console.warn(`[geminiService.withKeyRotation] Model ${model} failed (${msg.slice(0, 120)}). Trying next model.`);
          break;
        }
      }
    }

    // All keys were in cooldown for this model — move to the next model.
    if (!modelAttempted) continue;
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

  const detail = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`All models (${MODEL_CHAIN.join(', ')}) failed after exhausting every API key: ${detail}`);
}

/**
 * Direct REST API call to Gemini — bypasses the buggy @google/genai SDK.
 * Shared by every generator (lesson plans, exam papers, revisions) so the
 * request shape lives in exactly one place.
 */
export async function callGeminiAPI(
  apiKey: string,
  model: string,
  systemInstruction: string,
  userPrompt: string,
  schema: any,
  temperature = 0.2,
  logCallback?: LogCallback,
  contextParts?: Part[]
): Promise<string> {
  const log = (msg: string) => {
    console.log(`[geminiService.callGeminiAPI] ${msg}`);
    logCallback?.(msg);
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  log(`Initiating fetch to: ${url}`);

  // Build parts: context files (PDFs) first, then the text prompt
  const parts: any[] = [];
  if (contextParts && contextParts.length > 0) {
    for (const part of contextParts) {
      parts.push(part);
    }
    log(`Attached ${contextParts.length} context PDF part(s) to request.`);
  }
  parts.push({ text: userPrompt });

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      contents: [{ parts }],
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

export interface RetryRequestOptions<T> {
  /** Used in the console.error prefix, e.g. "generating exam paper". */
  operationName: string;
  systemInstruction: string;
  userPrompt: string;
  schema: unknown;
  temperature?: number;
  contextParts?: Part[];
  log: (msg: string) => void;
  /** Turn the raw API response text into the typed result. */
  parse: (raw: string) => T;
  /** Logged before the first attempt (optional). */
  firstAttemptLog?: string;
  /** Retry prefix, e.g. "Retrying revision" (default "Retrying"). */
  retryLabel?: string;
  /** Return a fatal message to throw immediately (never retried). */
  abortIf?: (err: Error) => string | null;
  /** Wrap the final error message (default: rethrow lastError as-is). */
  failMessage?: (lastError: Error) => string;
}

/**
 * Call Gemini with key rotation and the shared retry policy: up to 3 attempts,
 * retrying only on parse errors (the AI may return valid JSON next time).
 * The one retry loop every generator used to hand-roll.
 */
export async function requestJsonWithRetry<T>(options: RetryRequestOptions<T>): Promise<T> {
  const MAX_RETRIES = 2;
  const retryLabel = options.retryLabel ?? "Retrying";
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        options.log(`${retryLabel} (attempt ${attempt + 1}/${MAX_RETRIES + 1})...`);
      } else if (options.firstAttemptLog) {
        options.log(options.firstAttemptLog);
      }

      const response = await withKeyRotation(async (apiKey, model) => {
        options.log(`Sending request to model: ${model}`);
        return callGeminiAPI(
          apiKey,
          model,
          options.systemInstruction,
          options.userPrompt,
          options.schema,
          options.temperature ?? 0.2,
          options.log,
          options.contextParts
        );
      });

      return options.parse(response);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(`Error ${options.operationName} (attempt ${attempt + 1}):`, error);
      options.log(`ERROR (attempt ${attempt + 1}): ${lastError.message}`);

      const fatal = options.abortIf?.(lastError);
      if (fatal) throw new Error(fatal);

      // Parse errors are retried — the model may return valid JSON next time
      const isParseError =
        lastError.message.includes("parse") ||
        lastError.message.includes("JSON") ||
        lastError.message.includes("Unexpected");
      if (isParseError && attempt < MAX_RETRIES) {
        options.log("Response was malformed, requesting new response...");
        continue;
      }

      if (attempt === MAX_RETRIES) {
        throw options.failMessage ? new Error(options.failMessage(lastError)) : lastError;
      }
    }
  }

  throw lastError ?? new Error(`Unknown error during ${options.operationName}.`);
}

/**
 * Fix control characters inside JSON string values.
 * Walks the string tracking whether we're inside quotes, and escapes
 * any literal newlines/tabs/carriage returns found inside strings.
 */
function parseLessonPlanJson(jsonText: string, gradeLevel: string, subject: string): LessonPlan {
  try {
    const parsed = cleanAndParseJson(jsonText);
    if (!parsed.title || !parsed.objective || !Array.isArray(parsed.activities) || !parsed.homework) {
      throw new Error("Parsed JSON is missing required fields.");
    }
    // Repair AI math mistakes (prose in $...$, bare LaTeX, stray $) so the
    // lesson plan can never render broken equations.
    const cleaned = sanitizeStringFields(parsed) as Record<string, unknown>;
    return {
      ...(cleaned as unknown as LessonPlan),
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

/**
 * Build the dev-only proxy URL for GitHub raw content (bypasses CORS in the
 * Vite dev server). Returns null for non-GitHub or already-proxied URLs.
 */
function toProxyUrl(url: string): string | null {
  if (!url.includes('github.com') || url.startsWith('/pdf-proxy')) return null;
  const ghMatch = url.match(/raw\.githubusercontent\.com\/(.+)/);
  return ghMatch ? `/pdf-proxy/${ghMatch[1]}` : `/pdf-proxy/${url}`;
}

/**
 * Fetch a URL with a timeout, returning null on failure instead of throwing.
 */
async function fetchWithTimeout(url: string, ms: number): Promise<Response | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(blob);
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
  });
}

/**
 * Verify a blob is a PDF (magic bytes or content-type).
 */
function isPdfBlob(blob: Blob, contentType: string): Promise<boolean> {
  return blob.slice(0, 5).text().then(header =>
    header.startsWith('%PDF') || contentType.includes('pdf')
  );
}

/**
 * Download a PDF and convert it to a Gemini Part.
 *
 * Tries the dev-only Vite proxy first (fast in development), then falls back
 * to fetching the URL directly. The direct fallback keeps PDF downloads
 * working on static hosting such as Vercel, where the proxy does not exist.
 * raw.githubusercontent.com serves CORS headers, so direct fetch works in
 * browsers.
 */
export async function downloadPdfAsPart(url: string): Promise<Part | null> {
  const candidates = [toProxyUrl(url), url].filter((u): u is string => Boolean(u));

  for (const candidate of candidates) {
    const response = await fetchWithTimeout(candidate, 60000);
    if (!response || !response.ok) continue;

    try {
      const blob = await response.blob();
      if (!(await isPdfBlob(blob, response.headers.get('content-type') || ''))) continue;

      const base64 = await blobToBase64(blob);
      console.log(`[geminiService] PDF downloaded successfully: ${(base64.length * 0.75 / 1024).toFixed(0)}KB from ${url}`);
      return { inlineData: { mimeType: 'application/pdf', data: base64 } };
    } catch (err) {
      console.error(`[geminiService] PDF encoding error for ${url}:`, err);
      return null;
    }
  }

  console.warn(`[geminiService] PDF download failed for ${url}`);
  return null;
}

/**
 * Generate a lesson plan JSON via the Gemini API for a single SLO.
 */
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
9.  **EQUATIONS — ONLY for real math, NEVER for text:** Wrap mathematical equations, formulas and expressions in LaTeX delimiters, and NOTHING else:
    - Inline equations use single dollar signs: $E = mc^2$, $PV = nRT$, $F = ma$
    - Display equations use double dollar signs: $$\frac{3}{2}kT$$
    - Includes fractions (3/2) → $\frac{3}{2}$, powers v^2 → $v^2$, Greek letters rho → $\rho$
    - Example: "The equation $P = \frac{1}{3} \rho v^2$ relates pressure to density and velocity."
    - FORBIDDEN — ordinary words, names, biological/Latin terms and emphasis must NEVER go inside dollar signs. Wrong: "$Bios$ means life", "study of $cells$", "the plant $Brassica\ campestris$", "define $biology$". Keep those as plain text; use *asterisks* for emphasis or italics.
10.  **Grade Appropriateness:** Content must match ${gradeLevelContext} cognitive level.
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
            description: { type: Type.STRING, description: "Concise explanation of this phase in 2-4 sentences. Include formulas with variable breakdowns, worked examples, and diagrams/tables described in text. Written in third person." },
          },
          required: ['name', 'duration', 'description'],
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

  const hasPdf = contextFileParts && contextFileParts.length > 0;

  const userPrompt = `You are generating EXACTLY ONE lesson plan for EXACTLY ONE Student Learning Outcome (SLO). Do NOT create lesson plans for any other SLOs.

**TARGET SLO (the ONLY one to plan for):**
${slo.SLO_ID}: ${slo.SLO_Text}

${hasPdf ? `The attached PDF is the ${subject} textbook chapter for ${slo.grade}. Use its content as the GROUND TRUTH for this lesson plan — base examples, definitions, and activities on what the textbook actually covers for this specific topic.` : `Use your knowledge of the ${subject} curriculum for ${slo.grade} as per STBB standards.`}

For awareness of what else exists in this chapter (DO NOT plan for these, just know they exist):
${contextText || "None"}

Generate a single 40-minute lesson plan focused ONLY on the target SLO above.`;

  const userPromptLength = userPrompt.length;
  const contextPartCount = contextFileParts?.length ?? 0;
  log(`Built user prompt (${userPromptLength} chars). Context PDF parts attached: ${contextPartCount}.`);

  return requestJsonWithRetry<LessonPlan>({
    operationName: "generating lesson plan",
    firstAttemptLog: "Calling Gemini API via withKeyRotation...",
    systemInstruction,
    userPrompt,
    schema: lessonPlanSchema,
    temperature: 0.2,
    contextParts: contextFileParts,
    log,
    parse: (raw) => {
      log(`Received API response (${raw.length} chars). Parsing JSON...`);
      const lessonPlan = parseLessonPlanJson(raw, gradeLevelContext, subject);
      log(`Successfully parsed lesson plan: "${lessonPlan.title}"`);
      return lessonPlan;
    },
    abortIf: (err) => {
      if (err.message.includes("does not support pdf input") || err.message.includes("Cannot read ")) {
        return "PDF_CONTEXT_NOT_SUPPORTED: The current AI model does not support PDF file input.";
      }
      return null;
    },
  });
}

const weeklyLessonPlanSchema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING, description: "Weekly overview title, e.g. 'Weekly Lesson Plan - Chapter X'" },
    objective: { type: Type.STRING, description: "Overall chapter learning objective for the week" },
    materials: { type: Type.ARRAY, description: "Resources needed for the week", items: { type: Type.STRING } },
    dailyBreakdown: {
      type: Type.ARRAY,
      description: "Exactly 5 entries, one for each day Monday through Friday",
      items: {
        type: Type.OBJECT,
        properties: {
          day: { type: Type.STRING, enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], description: "Day of the week" },
          topic: { type: Type.STRING, description: "Topic to cover on this day" },
          objective: { type: Type.STRING, description: "Day-specific learning objective" },
          activities: {
            type: Type.ARRAY,
            description: "3-4 activities for the day following 4As where applicable",
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING, description: "Activity phase name" },
                duration: { type: Type.INTEGER, description: "Duration in minutes" },
                description: { type: Type.STRING, description: "Brief description of the activity" },
              },
              required: ['name', 'duration', 'description'],
            },
          },
          homework: { type: Type.STRING, description: "Homework assigned at end of this day" },
        },
        required: ['day', 'topic', 'objective', 'activities', 'homework'],
      },
    },
  },
  required: ['title', 'objective', 'materials', 'dailyBreakdown'],
};

export async function generateWeeklyLessonPlan(
  slo: SLO,
  unitSlos: SLO[],
  contextFileParts?: Part[],
  subjectName?: string,
  logCallback?: LogCallback
): Promise<WeeklyLessonPlan> {
  const log = (msg: string) => {
    console.log(`[geminiService] ${msg}`);
    logCallback?.(msg);
  };

  const gradeNum = parseInt(slo.grade?.replace(/Grade\s+|Class\s+/i, "") || "9", 10);
  const gradeLevelContext = isNaN(gradeNum) ? `${slo.grade}` : `${slo.grade} (${gradeNum <= 10 ? "Foundational" : "Advanced"})`;
  const subject = subjectName || "General";

  log(`Generating weekly lesson plan for chapter: ${slo.Unit_Name} | Subject: ${subject} | Grade: ${slo.grade}`);

  const systemInstruction = `You are a ${subject} Teacher at Peoples Higher Secondary School Jamshoro, creating a detailed weekly lesson plan for your own use and for school records. Your task is to generate a structured weekly overview as a JSON object. The tone should be professional, direct, and suitable for a Pakistani secondary school context.

**Weekly Lesson Plan Structure:**

Create a 5-day weekly plan (Monday through Friday) that breaks down the chapter content across the school week. Each day should have:
- A focused topic derived from the chapter SLOs
- A clear day-specific objective
- 3-4 activities with time allocations
- A homework assignment

**Critical Instructions:**
1.  **Grounded Content:** Base the entire weekly plan ONLY on the attached PDF content if provided. If no PDF, use your knowledge of the ${subject} curriculum for ${slo.grade} as per Sindh Textbook Board (STBB) standards.
2.  **NO SOURCE REFERENCES:** Never mention "the PDF," "textbook," or any source. Present content directly as lesson material.
3.  **Teacher-Centric Tone:** Write in direct instructional style. Use active verbs.
4.  **Specific Instructions:** For each activity, provide clear step-by-step teacher actions.
5.  **Local Context:** Make examples and applications relevant to Pakistani students.
6.  **Time Allocation:** Activities per day should total approximately 40 minutes.
7.  **Homework:** Provide meaningful homework assignments.
8.  **MANDATORY JSON OUTPUT:** Output ONLY valid JSON matching the schema. No extra text or markdown.
9.  **Grade Appropriateness:** Content must match ${gradeLevelContext} cognitive level.
10. **5 DAYS ONLY:** The dailyBreakdown array must contain exactly 5 entries for Monday through Friday.
`;

  const contextText = unitSlos
    .filter((s) => s.uniqueId !== slo.uniqueId)
    .map((s) => `- ${s.SLO_ID}: ${s.SLO_Text}`)
    .join("\n");

  const hasPdf = contextFileParts && contextFileParts.length > 0;

  const userPrompt = `You are generating a WEEKLY lesson plan for a chapter. Create exactly 5 daily entries (Monday to Friday) covering all the SLOs in this chapter.

**CHAPTER:**
${slo.Unit_Name}

**TARGET SLO (primary focus):**
${slo.SLO_ID}: ${slo.SLO_Text}

${hasPdf ? `The attached PDF is the ${subject} textbook chapter for ${slo.grade}. Use its content as the GROUND TRUTH for this weekly lesson plan.` : `Use your knowledge of the ${subject} curriculum for ${slo.grade} as per STBB standards.`}

For awareness of what else exists in this chapter:
${contextText || "None"}

Generate a weekly lesson plan with exactly 5 days (Monday-Friday), each with its own topic, objective, activities, and homework.`;

  return requestJsonWithRetry<WeeklyLessonPlan>({
    operationName: "generating weekly lesson plan",
    firstAttemptLog: "Calling Gemini API for weekly plan via withKeyRotation...",
    systemInstruction,
    userPrompt,
    schema: weeklyLessonPlanSchema,
    temperature: 0.2,
    contextParts: contextFileParts,
    log,
    parse: (raw) => {
      log(`Received weekly plan API response (${raw.length} chars). Parsing JSON...`);
      const parsed = cleanAndParseJson(raw);
      if (!parsed.title || !parsed.objective || !Array.isArray(parsed.dailyBreakdown) || parsed.dailyBreakdown.length !== 5) {
        throw new Error("Parsed JSON is missing required fields or does not have 5 days.");
      }
      const cleaned = sanitizeStringFields(parsed) as Record<string, unknown>;
      return {
        ...(cleaned as unknown as WeeklyLessonPlan),
        subject,
        isWeekly: true,
      };
    },
    abortIf: (err) => {
      if (err.message.includes("does not support pdf input") || err.message.includes("Cannot read ")) {
        return "PDF_CONTEXT_NOT_SUPPORTED: The current AI model does not support PDF file input.";
      }
      return null;
    },
  });
}

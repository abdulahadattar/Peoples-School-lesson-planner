import { Part } from '@google/genai';
import { MODEL_CHAIN, RetryRequestOptions } from './types.js';
import {
  SERVER_PROXY_SENTINEL,
  KeyPoolHandle,
  defaultClientPool,
  createKeyPoolHandle,
  isKeyInCooldown,
  getApiKey,
  refreshApiKeyPool,
} from './keyPool.js';
import { buildSdkModelPayload, isModelOrSchemaFallbackError } from './gemmaCompat.js';

export { getApiKey, refreshApiKeyPool, isKeyInCooldown };

const ROTATABLE_HTTP_STATUSES = new Set([401, 403, 429, 500, 502, 503, 504]);

const PERMANENT_KEY_PHRASES = [
  'reported as leaked',
  'api_key_invalid',
  'api key not valid',
  'invalid api key',
  'api key has been',
  'has been suspended',
  'has been disabled',
  'permission_denied',
  'permission denied',
  'unauthenticated',
] as const;

const TRANSIENT_API_PHRASES = [
  'quota exceeded',
  'exceeded your current quota',
  'rate limit',
  'rate_limit',
  'too many requests',
  'resource exhausted',
  'resource_exhausted',
  'model is overloaded',
  'overloaded',
  'service unavailable',
  'high demand',
  'timed out',
] as const;

export class KeyRotationExhaustedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KeyRotationExhaustedError';
  }
}

export function extractHttpStatus(error: unknown): number {
  if (!error || typeof error !== 'object') {
    const msg = String(error || '');
    const m = msg.match(
      /(?:^|\b)(?:http|status(?:\s*code)?|server\s*proxy\s*error|api\s*error)\s*[:=]?\s*(400|401|403|404|429|500|502|503|504)\b/i
    );
    return m ? Number(m[1]) : 0;
  }

  const errObj = error as Record<string, any>;
  const directStatus = Number(
    errObj.status ?? errObj.statusCode ?? errObj.code ?? errObj.response?.status ?? 0
  );
  if (Number.isFinite(directStatus) && directStatus >= 100 && directStatus < 600) {
    return directStatus;
  }

  const msg = String(errObj.message || '');
  const match =
    msg.match(
      /(?:^|\b)(?:http|status(?:\s*code)?|server\s*proxy\s*error|api\s*error)\s*[:=]?\s*(400|401|403|404|429|500|502|503|504)\b/i
    ) ||
    msg.match(/"code"\s*:\s*(400|401|403|404|429|500|502|503|504)\b/) ||
    msg.match(/\b(401|403|429|500|502|503|504)\s+(?:unauthorized|forbidden|too many requests|internal server error|bad gateway|service unavailable|gateway timeout)\b/i) ||
    msg.match(/timed out\s*\((504)\)/i);

  return match ? Number(match[1]) : 0;
}

export function isKeyPermanentlyBlocked(error: unknown): boolean {
  const status = extractHttpStatus(error);
  const message =
    error instanceof Error
      ? error.message.toLowerCase()
      : String((error as any)?.message || error || '').toLowerCase();

  if (PERMANENT_KEY_PHRASES.some((phrase) => message.includes(phrase))) {
    return true;
  }
  if (status === 401) return true;
  if (status === 403 && !message.includes('quota exceeded') && !message.includes('rate limit')) {
    return true;
  }
  return false;
}

export function isAuthOrQuotaError(error: unknown): boolean {
  const status = extractHttpStatus(error);
  if (ROTATABLE_HTTP_STATUSES.has(status)) {
    return true;
  }

  const message =
    error instanceof Error
      ? error.message.toLowerCase()
      : String((error as any)?.message || error || '').toLowerCase();

  return (
    PERMANENT_KEY_PHRASES.some((phrase) => message.includes(phrase)) ||
    TRANSIENT_API_PHRASES.some((phrase) => message.includes(phrase))
  );
}

export interface KeyRotationOptions {
  models?: readonly string[];
  pool?: KeyPoolHandle;
  maxTotalAttempts?: number;
}

const DEFAULT_MAX_ROTATION_ATTEMPTS = 20;

export async function withKeyRotation<T>(
  operation: (apiKey: string, model: string) => Promise<T>,
  options: KeyRotationOptions = {}
): Promise<T> {
  const pool = options.pool ?? defaultClientPool;
  const models = options.models && options.models.length > 0 ? options.models : MODEL_CHAIN;
  const poolLen = pool.getPoolLength();

  if (poolLen === 0) {
    throw new Error(
      'API key not set. Configure VITE_API_KEY or VITE_API_KEYS in your .env.local / Vercel env vars.'
    );
  }

  const attemptCap =
    options.maxTotalAttempts ?? Math.max(poolLen + models.length, Math.min(poolLen * models.length, DEFAULT_MAX_ROTATION_ATTEMPTS));

  let lastError: unknown;
  let anyKeyAttempted = false;
  let totalAttempts = 0;

  for (const model of models) {
    if (totalAttempts >= attemptCap) break;

    let attemptsForModel = 0;
    while (attemptsForModel < poolLen && totalAttempts < attemptCap) {
      const currentKey = pool.getNextKey();
      attemptsForModel++;

      if (currentKey !== SERVER_PROXY_SENTINEL && pool.isInCooldown(currentKey)) {
        continue;
      }

      anyKeyAttempted = true;
      totalAttempts++;

      try {
        return await operation(currentKey, model);
      } catch (error: any) {
        lastError = error;
        const errMsg = error?.message || String(error);
        const status = extractHttpStatus(error);

        if (isModelOrSchemaFallbackError(status, errMsg)) {
          break;
        }

        if (currentKey === SERVER_PROXY_SENTINEL) {
          if (
            errMsg.includes('is not configured on the server') ||
            errMsg.includes('returned an HTML page instead of JSON')
          ) {
            throw error;
          }
          if (isAuthOrQuotaError(error)) {
            // Proxy already rotated server-side keys for this model; move to next fallback model.
            break;
          }
          throw error;
        }

        if (isKeyPermanentlyBlocked(error)) {
          pool.addToCooldown(currentKey, 'permanent');
          continue;
        }

        if (isAuthOrQuotaError(error)) {
          pool.addToCooldown(currentKey, 'transient');
          continue;
        }

        throw error;
      }
    }
  }

  if (!anyKeyAttempted) {
    pool.refresh();
    const refreshedLen = pool.getPoolLength();
    for (const model of models) {
      let tried = 0;
      while (tried < refreshedLen) {
        const emergencyKey = pool.getNextKey();
        tried++;
        anyKeyAttempted = true;
        try {
          return await operation(emergencyKey, model);
        } catch (error: any) {
          lastError = error;
          const errMsg = error?.message || String(error);
          const status = extractHttpStatus(error);
          if (isModelOrSchemaFallbackError(status, errMsg)) {
            break;
          }
          if (isKeyPermanentlyBlocked(error)) {
            pool.addToCooldown(emergencyKey, 'permanent');
            continue;
          }
          if (isAuthOrQuotaError(error)) {
            pool.addToCooldown(emergencyKey, 'transient');
            continue;
          }
          throw error;
        }
      }
    }
  }

  const finalMessage =
    lastError instanceof Error
      ? lastError.message
      : String(lastError || 'All API keys and models exhausted without a successful response.');
  throw new KeyRotationExhaustedError(finalMessage);
}

const serverPoolCache = new Map<string, KeyPoolHandle>();
const defaultServerPool = createKeyPoolHandle({ mode: 'server', includeServerFallback: false });

export function getServerKeyPoolHandle(env?: Record<string, string | undefined>): KeyPoolHandle {
  if (!env) return defaultServerPool;
  const cacheKey = JSON.stringify(Object.keys(env).sort().map((k) => [k, env[k]]));
  let handle = serverPoolCache.get(cacheKey);
  if (!handle) {
    handle = createKeyPoolHandle({ mode: 'server', includeServerFallback: false, env });
    serverPoolCache.set(cacheKey, handle);
  }
  return handle;
}

export async function withServerKeyRotation<T>(
  operation: (apiKey: string, model: string) => Promise<T>,
  models: readonly string[] = MODEL_CHAIN,
  env?: Record<string, string | undefined>
): Promise<T> {
  const pool = getServerKeyPoolHandle(env);
  pool.ensurePool();
  return withKeyRotation(operation, { pool, models });
}

export async function requestJsonWithRetry<T>(options: RetryRequestOptions<T>): Promise<T> {
  const {
    operationName,
    firstAttemptLog,
    retryLabel = 'Retrying',
    systemInstruction,
    userPrompt,
    schema,
    temperature = 0.3,
    contextParts,
    models,
    timeoutMs,
    log,
    parse,
    failMessage,
    abortIf,
  } = options;

  let lastError: Error | null = null;
  // Key/model fallback already runs inside withKeyRotation; outer attempts only retry malformed/empty responses.
  const maxAttempts = 2;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let raw: string;
    try {
      if (attempt === 1 && firstAttemptLog) {
        log?.(firstAttemptLog);
      } else if (attempt > 1) {
        log?.(`${retryLabel} (attempt ${attempt}/${maxAttempts})...`);
      }

      raw = await withKeyRotation(async (apiKey, model) => {
        if (apiKey === SERVER_PROXY_SENTINEL) {
          return executeServerProxyGenerate(model, systemInstruction, userPrompt, schema, temperature, contextParts, timeoutMs);
        }
        return executeClientSdkGenerate(apiKey, model, systemInstruction, userPrompt, schema, temperature, contextParts, timeoutMs);
      }, { models });
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      log?.(`Attempt ${attempt} failed: ${lastError.message}`);
      const abortReason = abortIf?.(lastError);
      if (abortReason) {
        throw new Error(abortReason);
      }
      // Do not multiply exhausted key/model rotations across outer retries.
      break;
    }

    try {
      if (!raw || typeof raw !== 'string') {
        throw new Error('Empty response from AI model');
      }
      return parse(raw);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      log?.(`Response parse attempt ${attempt} failed: ${lastError.message}`);
      const abortReason = abortIf?.(lastError);
      if (abortReason) {
        throw new Error(abortReason);
      }
      if (attempt < maxAttempts) {
        const delay = 800;
        log?.(`Waiting ${delay / 1000}s before retrying malformed response...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  const finalMsg = failMessage
    ? failMessage(lastError || new Error('Unknown error'))
    : `Failed ${operationName}: ${lastError?.message || 'Unknown error'}`;
  throw new Error(finalMsg);
}

const GEMINI_CLIENT_TIMEOUT_MS = 35_000;

async function withClientTimeout<T>(promise: Promise<T>, label: string, timeoutMs = GEMINI_CLIENT_TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out (504)`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function executeClientSdkGenerate(
  apiKey: string,
  model: string,
  systemInstruction: string,
  userPrompt: string,
  schema: any,
  temperature: number,
  contextParts?: Part[],
  timeoutMs?: number
): Promise<string> {
  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
  });

  const payload = buildSdkModelPayload(model, systemInstruction, userPrompt, schema, temperature, contextParts);

  const response = await withClientTimeout(
    ai.models.generateContent({
      model,
      contents: payload.contents,
      config: payload.config,
    }),
    `Gemini ${model}`,
    timeoutMs ?? GEMINI_CLIENT_TIMEOUT_MS
  );

  return response.text || '';
}

function looksLikeHtmlDocument(text: string, contentType = ''): boolean {
  if (/text\/html/i.test(contentType)) return true;
  return /^\s*(<!doctype\s+html|<html[\s>]|<head[\s>]|<body[\s>])/i.test(text);
}

async function executeServerProxyGenerate(
  model: string,
  systemInstruction: string,
  userPrompt: string,
  schema: any,
  temperature: number,
  contextParts?: Part[],
  timeoutMs?: number
): Promise<string> {
  const contents: any[] = [];
  if (contextParts && contextParts.length > 0) {
    contents.push(...contextParts);
  }
  contents.push(userPrompt);

  const res = await fetch('/api/gemini/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(timeoutMs ?? GEMINI_CLIENT_TIMEOUT_MS),
    body: JSON.stringify({
      model,
      contents,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: schema,
        temperature,
      },
    }),
  });

  const contentType = res.headers?.get?.('content-type') || '';
  const rawText = await res.text();

  if (!res.ok) {
    const detail = looksLikeHtmlDocument(rawText, contentType)
      ? 'Server proxy returned an HTML error page instead of JSON.'
      : rawText;
    const proxyErr = new Error(`Server proxy error ${res.status}: ${detail}`) as Error & { status?: number };
    proxyErr.status = res.status;
    throw proxyErr;
  }

  if (looksLikeHtmlDocument(rawText, contentType)) {
    const htmlErr = new Error(
      'Server endpoint returned an HTML page instead of JSON. Please refresh the page or verify the API server is running.'
    ) as Error & { status?: number };
    htmlErr.status = 502;
    throw htmlErr;
  }

  let data: { text?: string; error?: string };
  try {
    data = JSON.parse(rawText);
  } catch {
    const parseErr = new Error('Server proxy returned an invalid non-JSON response.') as Error & { status?: number };
    parseErr.status = 502;
    throw parseErr;
  }

  if (data.error && !data.text) {
    throw new Error(data.error);
  }
  return data.text || '';
}

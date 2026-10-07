import { Part } from '@google/genai';
import { LogCallback, MODEL_CHAIN, RetryRequestOptions } from './types';
import {
  getApiKeyPool,
  isKeyInCooldown,
  addKeyToCooldown,
  getApiKey,
  refreshApiKeyPool,
  getKeyPoolLength,
  getNextKey,
} from './keyPool';

export { getApiKey, refreshApiKeyPool, isKeyInCooldown };

function isAuthOrQuotaError(error: any): boolean {
  if (error?.message) {
    const message = error.message.toLowerCase();
    return (
      message.includes('401') ||
      message.includes('403') ||
      message.includes('429') ||
      message.includes('500') ||
      message.includes('503') ||
      message.includes('504') ||
      message.includes('unauthenticated') ||
      message.includes('permission denied') ||
      message.includes('quota exceeded') ||
      message.includes('quota') ||
      message.includes('rate limit') ||
      message.includes('resource exhausted') ||
      message.includes('overloaded') ||
      message.includes('service unavailable')
    );
  }
  if (error?.code) {
    return [401, 403, 429, 500, 503, 504].includes(Number(error.code));
  }
  return false;
}

export function isKeyPermanentlyBlocked(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    message.includes('reported as leaked') ||
    message.includes('api key not valid') ||
    message.includes('invalid api key') ||
    message.includes('api key has been') ||
    message.includes('suspended') ||
    message.includes('disabled') ||
    message.includes('permission_denied') ||
    message.includes('permission denied')
  );
}

export async function withKeyRotation<T>(operation: (apiKey: string, model: string) => Promise<T>): Promise<T> {
  const poolLen = getKeyPoolLength();
  if (poolLen === 0) {
    throw new Error(
      'API key not set. Configure VITE_API_KEY or VITE_API_KEYS in your .env.local / Vercel env vars.'
    );
  }

  let lastError: unknown;
  let anyKeyAttempted = false;
  const keyFailures = new Map<string, number>();

  for (const model of MODEL_CHAIN) {
    let attempts = 0;
    let modelAttempted = false;
    let modelNotFoundOrUnsupported = false;

    while (attempts < poolLen) {
      const currentKey = getNextKey();
      attempts++;

      if (isKeyInCooldown(currentKey)) {
        continue;
      }

      modelAttempted = true;
      anyKeyAttempted = true;

      try {
        const result = await operation(currentKey, model);
        keyFailures.delete(currentKey);
        return result;
      } catch (error: any) {
        lastError = error;
        const errMsg = error?.message?.toLowerCase() || '';

        if (isKeyPermanentlyBlocked(error)) {
          addKeyToCooldown(currentKey);
          continue;
        }

        if (
          errMsg.includes('404') ||
          errMsg.includes('not found') ||
          errMsg.includes('is not supported for generatecontent') ||
          errMsg.includes('unsupported model')
        ) {
          modelNotFoundOrUnsupported = true;
          break;
        }

        if (isAuthOrQuotaError(error)) {
          const failures = (keyFailures.get(currentKey) || 0) + 1;
          keyFailures.set(currentKey, failures);
          if (failures >= 2) {
            addKeyToCooldown(currentKey);
          }
          continue;
        }

        throw error;
      }
    }

    if (modelNotFoundOrUnsupported) {
      continue;
    }

    if (!modelAttempted) {
      continue;
    }
  }

  if (!anyKeyAttempted) {
    refreshApiKeyPool();
    const emergencyKey = getApiKey();
    return operation(emergencyKey, MODEL_CHAIN[0]);
  }

  throw lastError || new Error('All API keys and models exhausted without a successful response.');
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
    log,
    parse,
    failMessage,
  } = options;

  let lastError: Error | null = null;
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      if (attempt === 1 && firstAttemptLog) {
        log?.(firstAttemptLog);
      } else if (attempt > 1) {
        log?.(`${retryLabel} (attempt ${attempt}/${maxAttempts})...`);
      }

      const raw = await withKeyRotation(async (apiKey, model) => {
        if (apiKey === 'server-proxy') {
          return executeServerProxyGenerate(model, systemInstruction, userPrompt, schema, temperature, contextParts);
        }
        return executeClientSdkGenerate(apiKey, model, systemInstruction, userPrompt, schema, temperature, contextParts);
      });

      if (!raw || typeof raw !== 'string') {
        throw new Error('Empty response from AI model');
      }

      return parse(raw);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      log?.(`Attempt ${attempt} failed: ${lastError.message}`);

      if (attempt < maxAttempts) {
        const delay = attempt * 1000;
        log?.(`Waiting ${delay / 1000}s before next attempt...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  const finalMsg = failMessage
    ? failMessage(lastError || new Error('Unknown error'))
    : `Failed ${operationName}: ${lastError?.message || 'Unknown error'}`;
  throw new Error(finalMsg);
}

async function executeClientSdkGenerate(
  apiKey: string,
  model: string,
  systemInstruction: string,
  userPrompt: string,
  schema: any,
  temperature: number,
  contextParts?: Part[]
): Promise<string> {
  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey });

  const contents: any[] = [];
  if (contextParts && contextParts.length > 0) {
    contents.push(...contextParts);
  }
  contents.push(userPrompt);

  const response = await ai.models.generateContent({
    model,
    contents,
    config: {
      systemInstruction,
      responseMimeType: 'application/json',
      responseSchema: schema,
      temperature,
    },
  });

  return response.text || '';
}

async function executeServerProxyGenerate(
  model: string,
  systemInstruction: string,
  userPrompt: string,
  schema: any,
  temperature: number,
  contextParts?: Part[]
): Promise<string> {
  const contents: any[] = [];
  if (contextParts && contextParts.length > 0) {
    contents.push(...contextParts);
  }
  contents.push(userPrompt);

  const res = await fetch('/api/gemini/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Server proxy error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  return data.text || '';
}

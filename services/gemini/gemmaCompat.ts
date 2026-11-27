/**
 * Compatibility helpers for Gemma models and Gemini schema/model fallback errors.
 * Gemma endpoints reject responseSchema, responseMimeType, and systemInstruction with HTTP 400.
 */

export function isGemmaModel(model: string): boolean {
  return /^(models\/)?gemma-/i.test((model || '').trim());
}

export function isModelOrSchemaFallbackError(status: number, message: string): boolean {
  if (status === 404) return true;
  const lower = String(message || '').toLowerCase();
  if (
    lower.includes('404') ||
    lower.includes('not found') ||
    lower.includes('is not supported for generatecontent') ||
    lower.includes('unsupported model')
  ) {
    return true;
  }

  const isBadArg = status === 400 || lower.includes('invalid_argument') || lower.includes('bad request');
  if (!isBadArg) return false;

  return (
    lower.includes('responseschema') ||
    lower.includes('response_schema') ||
    lower.includes('responsemimetype') ||
    lower.includes('response_mime_type') ||
    lower.includes('systeminstruction') ||
    lower.includes('system_instruction') ||
    lower.includes('json mode') ||
    lower.includes('developer instruction') ||
    lower.includes('structured output') ||
    lower.includes('not enabled for this model')
  );
}

function summarizeSchema(schema: any, depth = 0): string {
  if (!schema || typeof schema !== 'object' || depth > 4) return 'any';
  const typeStr = String(schema.type || 'object').toLowerCase();
  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    return schema.enum.map((v: unknown) => JSON.stringify(v)).join('|');
  }
  if (typeStr === 'array') {
    return `[${summarizeSchema(schema.items, depth + 1)}]`;
  }
  if (typeStr === 'object' && schema.properties && typeof schema.properties === 'object') {
    const entries = Object.entries(schema.properties).map(([k, v]) => `${k}: ${summarizeSchema(v, depth + 1)}`);
    return `{ ${entries.join(', ')} }`;
  }
  return typeStr;
}

export function foldInstructionAndSchemaForGemma(
  userPrompt: string,
  systemInstruction?: string,
  schema?: unknown
): string {
  const sections: string[] = [];
  if (systemInstruction && systemInstruction.trim()) {
    sections.push(`INSTRUCTIONS:\n${systemInstruction.trim()}`);
  }
  if (userPrompt && userPrompt.trim()) {
    sections.push(userPrompt.trim());
  }
  if (schema) {
    sections.push(
      `OUTPUT FORMAT (STRICT VALID JSON ONLY — NO MARKDOWN OR EXTRA TEXT):\n${summarizeSchema(schema)}`
    );
  }
  return sections.join('\n\n');
}

export interface SdkModelPayload {
  contents: any[];
  config: Record<string, any>;
}

export function buildSdkModelPayload(
  model: string,
  systemInstruction: string,
  userPrompt: string,
  schema: unknown,
  temperature: number,
  contextParts?: any[]
): SdkModelPayload {
  const prefixParts = Array.isArray(contextParts) && contextParts.length > 0 ? [...contextParts] : [];

  if (isGemmaModel(model)) {
    const foldedPrompt = foldInstructionAndSchemaForGemma(userPrompt, systemInstruction, schema);
    return {
      contents: [...prefixParts, foldedPrompt],
      config: { temperature },
    };
  }

  return {
    contents: [...prefixParts, userPrompt],
    config: {
      systemInstruction: systemInstruction || undefined,
      responseMimeType: 'application/json',
      responseSchema: schema,
      temperature,
    },
  };
}

export function sanitizeSdkCallForModel(
  model: string,
  contents: any,
  config?: Record<string, any>
): SdkModelPayload {
  const safeConfig: Record<string, any> = config ? { ...config } : {};
  if (!isGemmaModel(model)) {
    return {
      contents,
      config: safeConfig,
    };
  }

  const sysText =
    typeof safeConfig.systemInstruction === 'string'
      ? safeConfig.systemInstruction
      : safeConfig.systemInstruction?.parts?.map((p: any) => p?.text).filter(Boolean).join('\n') || '';
  const schema = safeConfig.responseSchema;
  const temperature = typeof safeConfig.temperature === 'number' ? safeConfig.temperature : 0.2;

  const extraPrompt = foldInstructionAndSchemaForGemma('', sysText, schema);
  let nextContents: any = contents;

  if (typeof contents === 'string') {
    nextContents = `${extraPrompt}\n\n${contents}`;
  } else if (Array.isArray(contents)) {
    const cloned = [...contents];
    if (cloned.length > 0 && typeof cloned[cloned.length - 1] === 'string') {
      cloned[cloned.length - 1] = `${extraPrompt}\n\n${cloned[cloned.length - 1]}`;
    } else if (cloned.length > 0 && cloned[cloned.length - 1]?.parts && Array.isArray(cloned[cloned.length - 1].parts)) {
      const lastMsg = { ...cloned[cloned.length - 1], parts: [...cloned[cloned.length - 1].parts, { text: `\n\n${extraPrompt}` }] };
      cloned[cloned.length - 1] = lastMsg;
    } else {
      cloned.push(extraPrompt);
    }
    nextContents = cloned;
  }

  return {
    contents: nextContents,
    config: { temperature },
  };
}

export function buildRestModelBody(
  model: string,
  systemInstruction: string | undefined,
  userPrompt: string | undefined,
  schema: unknown,
  temperature: number | undefined,
  contextParts?: any[]
): Record<string, any> {
  const parts: any[] = [];
  if (Array.isArray(contextParts) && contextParts.length > 0) {
    parts.push(...contextParts);
  }

  if (isGemmaModel(model)) {
    const folded = foldInstructionAndSchemaForGemma(userPrompt || '', systemInstruction, schema);
    if (folded) parts.push({ text: folded });
    return {
      contents: [{ parts }],
      generationConfig: {
        temperature: temperature ?? 0.2,
      },
    };
  }

  if (userPrompt) parts.push({ text: userPrompt });
  return {
    contents: [{ parts }],
    generationConfig: {
      temperature: temperature ?? 0.2,
      ...(schema ? { responseMimeType: 'application/json', responseSchema: schema } : {}),
    },
    ...(systemInstruction ? { systemInstruction: { parts: [{ text: systemInstruction }] } } : {}),
  };
}

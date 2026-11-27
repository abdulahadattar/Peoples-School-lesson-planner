/**
 * Shared security and timeout helpers for proxy routes (/pdf-proxy & /api/gemini).
 */

export const GEMINI_PROXY_MODEL_CHAIN = [
  'gemini-3.5-flash-lite',
  'gemma-4-26b-a4b-it',
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash',
  'gemini-flash-latest',
] as const;

export function buildModelTryOrder(requestedModel?: string): string[] {
  const list = requestedModel
    ? [requestedModel, ...GEMINI_PROXY_MODEL_CHAIN]
    : [...GEMINI_PROXY_MODEL_CHAIN];
  return Array.from(new Set(list.filter(Boolean)));
}

export function extractSafeGithubProxyPath(rawPath: unknown): string | null {
  if (typeof rawPath !== 'string') return null;
  const trimmed = rawPath.trim();
  if (!trimmed) return null;

  // Block embedded scheme URLs, protocol-relative //, credentials, or backslashes before stripping leading slash
  if (
    /^https?:\/\//i.test(trimmed) ||
    trimmed.startsWith('//') ||
    trimmed.includes('\\') ||
    trimmed.includes('@')
  ) {
    return null;
  }

  let cleaned = trimmed.replace(/^\/+/, '');
  if (!cleaned) return null;

  // Strip query string if someone passed raw req.originalUrl fragment
  cleaned = cleaned.split('?')[0].split('#')[0];

  if (/^https?:\/\//i.test(cleaned)) {
    return null;
  }

  let decoded: string;
  try {
    decoded = decodeURIComponent(cleaned);
  } catch {
    return null;
  }

  const segments = decoded.split('/').filter(Boolean);
  if (segments.length < 4) return null;
  if (segments.some((seg) => seg === '.' || seg === '..')) return null;

  return segments.map((seg) => encodeURIComponent(seg)).join('/');
}

import { isModelOrSchemaFallbackError } from '../gemini/gemmaCompat.js';

export function isModelNotFoundOrUnsupported(status: number, message: string): boolean {
  return isModelOrSchemaFallbackError(status, message);
}

export async function withPromiseTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)}s`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

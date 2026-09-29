/**
 * Shared Gemini key discovery + live API probing.
 *
 * Used by scripts/gemini-probe.mjs and scripts/test-all.mjs so the two can
 * never disagree about which keys exist or which models are real.
 */
import fs from 'fs';
import path from 'path';

export const API_ROOT = 'https://generativelanguage.googleapis.com/v1beta';

/** The models the application hardcodes in services/geminiService.ts. */
export const APP_MODEL_CHAIN = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-2.5-flash'];

/**
 * Env files that may hold a Gemini key. `.kilo/worktrees/*` is included
 * because the alpha worktree keeps the live AI-Studio keys there.
 */
export const ENV_FILES = [
  '.env.local',
  '.env',
  '.env.example',
  path.join('.kilo', 'worktrees', 'alpha', '.env.local'),
  path.join('.kilo', 'worktrees', 'alpha', '.env'),
];

export const KEY_VARS = [
  'GEMINI_API_KEY', 'GEMINI_API_KEYS',
  'VITE_API_KEY', 'VITE_API_KEYS', 'VITE_GOOGLE_API_KEY',
];

/** Parses every env file that could carry a Gemini key (masked values skipped). */
export function collectKeysFromEnvFiles(root) {
  const keys = new Set();
  for (const rel of ENV_FILES) {
    const file = path.join(root, rel);
    if (!fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, 'utf-8');
    for (const varName of KEY_VARS) {
      const re = new RegExp(`^${varName}\\s*=\\s*(.+)$`, 'gm');
      let m;
      while ((m = re.exec(text)) !== null) {
        const raw = m[1].trim().replace(/^["']|["']$/g, '');
        if (!raw || raw.startsWith('[')) continue; // "[SENSIBLE]" placeholder
        for (const part of raw.split(',')) {
          const k = part.trim();
          if (k && k.length >= 20) keys.add(k);
        }
      }
    }
  }
  return [...keys];
}

/** Keys may also come from the real environment (CI / Vercel). */
export function collectKeysFromProcessEnv() {
  const keys = new Set();
  for (const varName of [...KEY_VARS, 'TEST_GEMINI_API_KEY']) {
    const raw = process.env[varName];
    if (!raw) continue;
    for (const part of raw.split(',')) {
      const k = part.trim();
      if (k && k.length >= 20) keys.add(k);
    }
  }
  return [...keys];
}

/** Every key available to this checkout, de-duplicated, env taking priority. */
export function collectAllKeys(root) {
  return [...new Set([...collectKeysFromProcessEnv(), ...collectKeysFromEnvFiles(root)])];
}

/**
 * True when Google explicitly says the key itself is dead (leaked, invalid,
 * suspended) rather than merely throttled. Matches the wording in
 * services/geminiService.ts isKeyPermanentlyBlocked().
 */
export function isDeadKeyMessage(msg = '') {
  const m = String(msg).toLowerCase();
  return (
    m.includes('reported as leaked') ||
    m.includes('api key not valid') ||
    m.includes('suspended') ||
    m.includes('has been disabled') ||
    m.includes('permission_denied') ||
    m.includes('permission denied')
  );
}

/** True for transient conditions where a different key will succeed. */
export function isTransientApiError(msg = '') {
  const m = String(msg).toLowerCase();
  return (
    m.includes('429') ||
    m.includes('quota') ||
    m.includes('rate limit') ||
    m.includes('resource exhausted') ||
    m.includes('500') ||
    m.includes('502') ||
    m.includes('503') ||
    m.includes('504') ||
    m.includes('overloaded') ||
    m.includes('high demand') ||
    m.includes('service unavailable')
  );
}

/** Probes a key with ListModels. Cheap and definitive about key validity. */
export async function listModels(key) {
  const res = await fetch(`${API_ROOT}/models?key=${encodeURIComponent(key)}`, {
    signal: AbortSignal.timeout(15000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, status: res.status, error: body?.error?.message || `HTTP ${res.status}` };
  }
  const names = (body.models || [])
    .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map(m => m.name.replace(/^models\//, ''));
  return { ok: true, models: names };
}

/** Sends a real generateContent call to a single model. */
export async function tryGenerate(key, model, { body, timeout = 25000, headers = {} } = {}) {
  const res = await fetch(`${API_ROOT}/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key, ...headers },
    body: JSON.stringify(body ?? {
      contents: [{ parts: [{ text: 'Reply with the single word OK' }] }],
      generationConfig: { temperature: 0 },
    }),
    signal: AbortSignal.timeout(timeout),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, error: data?.error?.message || `HTTP ${res.status}` };
  return { ok: true, status: res.status, data };
}

/**
 * Finds the keys that actually work, trying each candidate in turn.
 * Returns { live: [{key, models}], dead: [{key, status, error}] }.
 */
export async function classifyKeys(keys) {
  const live = [];
  const dead = [];
  for (const key of keys) {
    const out = await listModels(key);
    if (out.ok) live.push({ key, models: out.models });
    else dead.push({ key, status: out.status, error: out.error, permanent: isDeadKeyMessage(out.error) });
  }
  return { live, dead };
}

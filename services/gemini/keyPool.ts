function isValidApiKey(key: string): boolean {
  if (!key || typeof key !== 'string') return false;
  const trimmed = key.trim();
  return /^[A-Za-z0-9_.-]{20,}$/.test(trimmed);
}

export function getApiKeyPool(): string[] {
  const keys: string[] = [];

  const env =
    typeof import.meta !== 'undefined' && import.meta.env
      ? import.meta.env
      : typeof process !== 'undefined' && process.env
      ? process.env
      : ({} as Record<string, string | undefined>);

  const single = env.VITE_API_KEY || (typeof process !== 'undefined' ? process.env?.GEMINI_API_KEY : undefined);
  if (single && isValidApiKey(single)) {
    keys.push(single);
  }

  const multi = env.VITE_API_KEYS || (typeof process !== 'undefined' ? process.env?.GEMINI_API_KEYS : undefined);
  if (multi) {
    const allKeys = multi
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean);

    const validKeys = allKeys.filter(isValidApiKey);
    const invalidKeys = allKeys.filter((k) => !isValidApiKey(k));

    if (invalidKeys.length > 0) {
      console.warn('[geminiService] Skipping invalid/expired API keys:', invalidKeys.length, 'keys');
    }

    keys.push(...validKeys);
  }

  const uniqueKeys = [...new Set(keys)];

  if (uniqueKeys.length === 0) {
    uniqueKeys.push('server-proxy');
  }

  return uniqueKeys;
}

let keyPool: string[] = getApiKeyPool();
let keyIndex = 0;

const COOLDOWN_MS = 3 * 60 * 60 * 1000;
const cooldownKeys: Map<string, number> = new Map();

export function isKeyInCooldown(key: string): boolean {
  const expiry = cooldownKeys.get(key);
  if (!expiry) return false;
  if (Date.now() >= expiry) {
    cooldownKeys.delete(key);
    return false;
  }
  return true;
}

export function addKeyToCooldown(key: string): void {
  cooldownKeys.set(key, Date.now() + COOLDOWN_MS);
}

export function getApiKey(): string {
  if (keyPool.length === 0) {
    keyPool = getApiKeyPool();
  }
  if (keyPool.length === 0) {
    throw new Error(
      'API key not set. Configure VITE_API_KEY or VITE_API_KEYS in your .env.local / Vercel env vars.'
    );
  }
  const key = keyPool[keyIndex % keyPool.length];
  keyIndex = (keyIndex + 1) % keyPool.length;
  return key;
}

export function refreshApiKeyPool(): void {
  keyPool = getApiKeyPool();
  keyIndex = 0;
  cooldownKeys.clear();
}

export function getKeyPoolLength(): number {
  if (keyPool.length === 0) {
    keyPool = getApiKeyPool();
  }
  return keyPool.length;
}

export function getNextKey(): string {
  if (keyPool.length === 0) {
    keyPool = getApiKeyPool();
  }
  const key = keyPool[keyIndex % keyPool.length];
  keyIndex = (keyIndex + 1) % keyPool.length;
  return key;
}

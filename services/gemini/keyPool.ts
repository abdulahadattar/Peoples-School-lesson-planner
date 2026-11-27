export const SERVER_PROXY_SENTINEL = 'server-proxy';
export const TRANSIENT_COOLDOWN_MS = 90_000;
export const PERMANENT_COOLDOWN_MS = 3 * 60 * 60 * 1000;

export type CooldownKind = 'transient' | 'permanent';

const CLIENT_SINGLE_VARS = ['VITE_API_KEY', 'VITE_GOOGLE_API_KEY'] as const;
const CLIENT_MULTI_VARS = ['VITE_API_KEYS'] as const;
const SERVER_DIRECT_VARS = [
  'GEMINI_API_KEY',
  'GEMINI_API_KEYS',
  'GOOGLE_API_KEY',
  'GOOGLE_API_KEYS',
  'VITE_API_KEY',
  'VITE_API_KEYS',
  'VITE_GOOGLE_API_KEY',
  'TEST_GEMINI_API_KEY',
] as const;
const NUMBERED_KEY_PREFIXES = ['GEMINI_API_KEY_', 'GOOGLE_API_KEY_', 'VITE_API_KEY_'] as const;

export function cleanApiKeyToken(raw: string): string {
  if (!raw || typeof raw !== 'string') return '';
  return raw.trim().replace(/^[\s"'`\[]+|[\s"'`\]]+$/g, '').trim();
}

export function isValidApiKey(key: string): boolean {
  if (!key || typeof key !== 'string') return false;
  const trimmed = key.trim();
  if (!trimmed || trimmed.startsWith('[')) return false;
  if (/^(redacted|your[-_]?api[-_]?key|placeholder|none|null|undefined)$/i.test(trimmed)) {
    return false;
  }
  return /^[A-Za-z0-9_.-]{20,}$/.test(trimmed);
}

export function parseApiKeyList(raw: string | undefined): { valid: string[]; invalidCount: number } {
  if (!raw || typeof raw !== 'string') {
    return { valid: [], invalidCount: 0 };
  }
  const tokens = raw
    .split(/[\n,]+/)
    .map((part) => cleanApiKeyToken(part))
    .filter(Boolean);

  const valid: string[] = [];
  let invalidCount = 0;

  for (const token of tokens) {
    if (isValidApiKey(token)) {
      valid.push(token);
    } else {
      invalidCount++;
    }
  }

  return { valid: Array.from(new Set(valid)), invalidCount };
}

export interface ApiKeyPoolOptions {
  env?: Record<string, string | undefined>;
  mode?: 'client' | 'server';
  includeServerFallback?: boolean;
}

function collectNumberedKeys(env: Record<string, string | undefined>, prefixes: readonly string[]): string[] {
  const keys: string[] = [];
  const names = Object.keys(env)
    .filter((k) => prefixes.some((prefix) => k.startsWith(prefix) && /^\d+$/.test(k.slice(prefix.length))))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  for (const name of names) {
    const parsed = parseApiKeyList(env[name]);
    keys.push(...parsed.valid);
  }
  return keys;
}

export function getApiKeyPool(options: ApiKeyPoolOptions = {}): string[] {
  const mode = options.mode ?? 'client';
  const includeServerFallback = options.includeServerFallback ?? mode === 'client';
  const keys: string[] = [];
  let invalidCount = 0;

  const pushRaw = (raw: string | undefined) => {
    if (!raw) return;
    const parsed = parseApiKeyList(raw);
    keys.push(...parsed.valid);
    invalidCount += parsed.invalidCount;
  };

  if (options.env) {
    const vars = mode === 'server' ? SERVER_DIRECT_VARS : [...CLIENT_SINGLE_VARS, ...CLIENT_MULTI_VARS, ...SERVER_DIRECT_VARS];
    for (const name of Array.from(new Set(vars))) {
      pushRaw(options.env[name]);
    }
    keys.push(...collectNumberedKeys(options.env, NUMBERED_KEY_PREFIXES));
  } else {
    const viteEnv =
      typeof import.meta !== 'undefined' && (import.meta as any).env
        ? ((import.meta as any).env as Record<string, string | undefined>)
        : undefined;
    const nodeEnv = typeof process !== 'undefined' && process.env ? process.env : undefined;

    if (mode === 'client' && viteEnv) {
      for (const name of [...CLIENT_SINGLE_VARS, ...CLIENT_MULTI_VARS]) {
        pushRaw(viteEnv[name]);
      }
      keys.push(...collectNumberedKeys(viteEnv, ['VITE_API_KEY_']));
    }

    if (nodeEnv) {
      const vars = mode === 'server' ? SERVER_DIRECT_VARS : [...CLIENT_SINGLE_VARS, ...CLIENT_MULTI_VARS, ...SERVER_DIRECT_VARS];
      for (const name of Array.from(new Set(vars))) {
        pushRaw(nodeEnv[name]);
      }
      keys.push(...collectNumberedKeys(nodeEnv, NUMBERED_KEY_PREFIXES));
    }
  }

  if (invalidCount > 0) {
    console.warn('[geminiService] Skipping invalid/expired API keys:', invalidCount, 'keys');
  }

  const uniqueKeys = Array.from(new Set(keys));
  if (uniqueKeys.length === 0 && includeServerFallback) {
    uniqueKeys.push(SERVER_PROXY_SENTINEL);
  }

  return uniqueKeys;
}

export interface KeyPoolHandle {
  ensurePool: () => string[];
  getPoolLength: () => number;
  getNextKey: () => string;
  isInCooldown: (key: string) => boolean;
  addToCooldown: (key: string, kind?: CooldownKind) => void;
  refresh: () => void;
  hasHealthyKey: () => boolean;
}

export function createKeyPoolHandle(options: ApiKeyPoolOptions = {}): KeyPoolHandle {
  let pool: string[] | null = null;
  let keyIndex = 0;
  const cooldownKeys = new Map<string, number>();

  const ensurePool = (): string[] => {
    if (pool === null) {
      pool = getApiKeyPool(options);
    }
    return pool;
  };

  const isInCooldown = (key: string): boolean => {
    const expiry = cooldownKeys.get(key);
    if (!expiry) return false;
    if (Date.now() >= expiry) {
      cooldownKeys.delete(key);
      return false;
    }
    return true;
  };

  const addToCooldown = (key: string, kind: CooldownKind = 'permanent'): void => {
    if (!key || key === SERVER_PROXY_SENTINEL) return;
    const duration = kind === 'transient' ? TRANSIENT_COOLDOWN_MS : PERMANENT_COOLDOWN_MS;
    cooldownKeys.set(key, Date.now() + duration);
  };

  const getNextKey = (): string => {
    const activePool = ensurePool();
    if (activePool.length === 0) {
      throw new Error(
        options.mode === 'server'
          ? 'GEMINI_API_KEY is not configured on the server.'
          : 'API key not set. Configure VITE_API_KEY or VITE_API_KEYS in your .env.local / Vercel env vars.'
      );
    }

    for (let i = 0; i < activePool.length; i++) {
      const candidate = activePool[keyIndex % activePool.length];
      keyIndex = (keyIndex + 1) % activePool.length;
      if (!isInCooldown(candidate)) {
        return candidate;
      }
    }

    // All keys are currently in cooldown; advance cursor and return next candidate.
    const fallback = activePool[keyIndex % activePool.length];
    keyIndex = (keyIndex + 1) % activePool.length;
    return fallback;
  };

  const refresh = (): void => {
    pool = getApiKeyPool(options);
    keyIndex = 0;
    cooldownKeys.clear();
  };

  const getPoolLength = (): number => ensurePool().length;

  const hasHealthyKey = (): boolean => ensurePool().some((k) => !isInCooldown(k));

  return {
    ensurePool,
    getPoolLength,
    getNextKey,
    isInCooldown,
    addToCooldown,
    refresh,
    hasHealthyKey,
  };
}

// Lazy default client key pool (not initialized at module load time)
const defaultClientPool = createKeyPoolHandle({ mode: 'client', includeServerFallback: true });

export function ensureKeyPool(): string[] {
  return defaultClientPool.ensurePool();
}

export function isKeyInCooldown(key: string): boolean {
  return defaultClientPool.isInCooldown(key);
}

export function addKeyToCooldown(key: string, kind: CooldownKind = 'permanent'): void {
  defaultClientPool.addToCooldown(key, kind);
}

export function getNextKey(): string {
  return defaultClientPool.getNextKey();
}

export function getApiKey(): string {
  return getNextKey();
}

export function refreshApiKeyPool(): void {
  defaultClientPool.refresh();
}

export function getKeyPoolLength(): number {
  return defaultClientPool.getPoolLength();
}

export function hasHealthyKey(): boolean {
  return defaultClientPool.hasHealthyKey();
}

export { defaultClientPool };

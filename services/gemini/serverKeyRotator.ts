/**
 * Unified server-side Gemini API key discovery and cooldown-aware round-robin rotation.
 * Delegates key parsing and error classification to the shared gemini/keyPool + client modules.
 */
import {
  getApiKeyPool,
  isValidApiKey,
  TRANSIENT_COOLDOWN_MS,
  PERMANENT_COOLDOWN_MS,
} from './keyPool.js';
import { isAuthOrQuotaError, isKeyPermanentlyBlocked } from './client.js';

export function isValidServerApiKey(key: string): boolean {
  return isValidApiKey(key);
}

export function collectServerGeminiKeys(env: Record<string, string | undefined> = process.env): string[] {
  return getApiKeyPool({
    env,
    mode: 'server',
    includeServerFallback: false,
  });
}

export function isPermanentKeyError(status: number, message: string): boolean {
  return isKeyPermanentlyBlocked({ status, message });
}

export function isTransientKeyError(status: number, message: string): boolean {
  return !isPermanentKeyError(status, message) && isAuthOrQuotaError({ status, message });
}

export class ServerKeyRotator {
  private cursor = 0;
  private readonly cooldownUntil = new Map<string, number>();

  getCandidateOrder(keys: string[], now = Date.now()): string[] {
    if (keys.length === 0) return [];
    const rotated: string[] = [];
    const start = this.cursor % keys.length;
    for (let i = 0; i < keys.length; i++) {
      rotated.push(keys[(start + i) % keys.length]);
    }
    this.cursor = (start + 1) % keys.length;

    const active = rotated.filter((k) => {
      const expiry = this.cooldownUntil.get(k);
      if (!expiry) return true;
      if (now >= expiry) {
        this.cooldownUntil.delete(k);
        return true;
      }
      return false;
    });

    return active.length > 0 ? active : rotated;
  }

  recordSuccess(key: string): void {
    this.cooldownUntil.delete(key);
  }

  recordFailure(key: string, status: number, message: string, now = Date.now()): void {
    if (isPermanentKeyError(status, message)) {
      this.cooldownUntil.set(key, now + PERMANENT_COOLDOWN_MS);
    } else if (isTransientKeyError(status, message)) {
      this.cooldownUntil.set(key, now + TRANSIENT_COOLDOWN_MS);
    }
  }

  isInCooldown(key: string, now = Date.now()): boolean {
    const expiry = this.cooldownUntil.get(key);
    if (!expiry) return false;
    if (now >= expiry) {
      this.cooldownUntil.delete(key);
      return false;
    }
    return true;
  }

  reset(): void {
    this.cursor = 0;
    this.cooldownUntil.clear();
  }
}

const defaultRotator = new ServerKeyRotator();

export function getServerKeyOrder(env: Record<string, string | undefined> = process.env): string[] {
  const keys = collectServerGeminiKeys(env);
  return defaultRotator.getCandidateOrder(keys);
}

export function recordServerKeySuccess(key: string): void {
  defaultRotator.recordSuccess(key);
}

export function recordServerKeyFailure(key: string, status: number, message: string): void {
  defaultRotator.recordFailure(key, status, message);
}

export function resetServerKeyRotator(): void {
  defaultRotator.reset();
}

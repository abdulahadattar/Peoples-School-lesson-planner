import { DEFAULT_SCHOOL_CONFIG, sanitizeSchoolConfig } from './defaults';
import type { SchoolConfig } from './types';

export const SCHOOL_CONFIG_STORAGE_KEY = 'phssj_school_config';

function readLocalStorageSnapshot(): SchoolConfig {
  try {
    if (typeof localStorage === 'undefined') {
      return DEFAULT_SCHOOL_CONFIG;
    }
    const raw = localStorage.getItem(SCHOOL_CONFIG_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.schoolName) {
        return sanitizeSchoolConfig(parsed);
      }
    }
  } catch {
    // ignore storage read failures
  }
  return DEFAULT_SCHOOL_CONFIG;
}

function writeLocalStorageSnapshot(config: SchoolConfig): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(SCHOOL_CONFIG_STORAGE_KEY, JSON.stringify(config));
    }
  } catch {
    // ignore storage write failures
  }
}

let cachedSnapshot: SchoolConfig = readLocalStorageSnapshot();
const storeListeners = new Set<(config: SchoolConfig) => void>();

export function getCachedSchoolConfig(): SchoolConfig {
  return cachedSnapshot;
}

export function setCachedSchoolConfig(
  next: Partial<SchoolConfig> | SchoolConfig,
  options: { persistLocal?: boolean } = {}
): SchoolConfig {
  const sanitized = sanitizeSchoolConfig(next);
  cachedSnapshot = sanitized;
  if (options.persistLocal !== false) {
    writeLocalStorageSnapshot(sanitized);
  }
  storeListeners.forEach((listener) => {
    try {
      listener(sanitized);
    } catch {
      // keep notifying remaining subscribers
    }
  });
  return sanitized;
}

export function subscribeSchoolConfigStore(
  listener: (config: SchoolConfig) => void
): () => void {
  storeListeners.add(listener);
  return () => {
    storeListeners.delete(listener);
  };
}

export function resetCachedSchoolConfigForTesting(): void {
  cachedSnapshot = DEFAULT_SCHOOL_CONFIG;
  storeListeners.clear();
}

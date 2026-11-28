import { db } from '../firebase';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { SchoolConfig } from './types';
import { DEFAULT_SCHOOL_CONFIG, sanitizeSchoolConfig } from './defaults';
import {
  SCHOOL_CONFIG_STORAGE_KEY,
  getCachedSchoolConfig,
  setCachedSchoolConfig,
} from './store';

const SETTINGS_DOC_PATH = 'settings';
const SETTINGS_DOC_ID = 'school_config';

function isOfflineError(err: unknown): boolean {
  if (!err) return false;
  const str = String((err as any)?.message || err).toLowerCase();
  const code = String((err as any)?.code || '').toLowerCase();
  return (
    code === 'unavailable' ||
    str.includes('client is offline') ||
    str.includes('failed to get document because the client is offline') ||
    str.includes('network') ||
    str.includes('offline')
  );
}

export async function getSchoolConfig(): Promise<SchoolConfig> {
  const localFallback = getCachedSchoolConfig();
  try {
    if (typeof localStorage !== 'undefined') {
      const local = localStorage.getItem(SCHOOL_CONFIG_STORAGE_KEY);
      if (local) {
        const parsed = JSON.parse(local);
        if (parsed && parsed.schoolName) {
          setCachedSchoolConfig(parsed, { persistLocal: false });
        }
      }
    }
  } catch {
    // keep cached fallback
  }

  try {
    const docRef = doc(db, SETTINGS_DOC_PATH, SETTINGS_DOC_ID);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data() as Partial<SchoolConfig>;
      if (data && data.schoolName) {
        return setCachedSchoolConfig(data);
      }
    }
  } catch (error) {
    if (!isOfflineError(error)) {
      console.warn('Could not fetch school config from Firestore, using cached state:', error);
    }
  }

  return getCachedSchoolConfig() || localFallback;
}

export async function saveSchoolConfig(config: Partial<SchoolConfig>, updatedBy: string = 'Admin'): Promise<SchoolConfig> {
  const current = getCachedSchoolConfig();
  const updated: SchoolConfig = setCachedSchoolConfig({
    ...current,
    ...config,
    updatedAt: Date.now(),
    updatedBy,
  });

  try {
    const docRef = doc(db, SETTINGS_DOC_PATH, SETTINGS_DOC_ID);
    await setDoc(docRef, updated, { merge: true });
  } catch (error) {
    if (!isOfflineError(error)) {
      console.warn('Failed to save school config to Firestore, saving locally:', error);
    }
  }

  return updated;
}

export async function resetSchoolConfigToDefaults(updatedBy: string = 'Admin'): Promise<SchoolConfig> {
  const resetConfig: SchoolConfig = setCachedSchoolConfig(
    sanitizeSchoolConfig({
      ...DEFAULT_SCHOOL_CONFIG,
      updatedAt: Date.now(),
      updatedBy: `${updatedBy} (Reset)`,
    })
  );

  try {
    const docRef = doc(db, SETTINGS_DOC_PATH, SETTINGS_DOC_ID);
    await setDoc(docRef, resetConfig);
  } catch (error) {
    if (!isOfflineError(error)) {
      console.warn('Failed to reset school config in Firestore, saving locally:', error);
    }
  }

  return resetConfig;
}

export function subscribeSchoolConfig(
  onUpdate: (config: SchoolConfig) => void,
  onError?: (err: unknown) => void
): () => void {
  try {
    const docRef = doc(db, SETTINGS_DOC_PATH, SETTINGS_DOC_ID);
    return onSnapshot(
      docRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as Partial<SchoolConfig>;
          if (data && data.schoolName) {
            const sanitized = setCachedSchoolConfig(data);
            onUpdate(sanitized);
          }
        }
      },
      (error) => {
        if (!isOfflineError(error)) {
          console.warn('Firestore subscription for school config error:', error);
        }
        onError?.(error);
      }
    );
  } catch (err) {
    if (!isOfflineError(err)) {
      console.warn('Could not initialize Firestore school config subscription:', err);
    }
    onError?.(err);
    return () => {};
  }
}

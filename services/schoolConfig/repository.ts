import { db } from '../firebase';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { SchoolConfig } from './types';
import { DEFAULT_SCHOOL_CONFIG, sanitizeSchoolConfig } from './defaults';

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
  let localFallback: SchoolConfig = DEFAULT_SCHOOL_CONFIG;
  try {
    const local = localStorage.getItem('phssj_school_config');
    if (local) {
      const parsed = JSON.parse(local);
      if (parsed && parsed.schoolName) {
        localFallback = sanitizeSchoolConfig(parsed);
      }
    }
  } catch {
    // fallback
  }

  try {
    const docRef = doc(db, SETTINGS_DOC_PATH, SETTINGS_DOC_ID);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data() as Partial<SchoolConfig>;
      if (data && data.schoolName) {
        const merged = sanitizeSchoolConfig(data);
        localStorage.setItem('phssj_school_config', JSON.stringify(merged));
        return merged;
      }
    }
  } catch (error) {
    if (!isOfflineError(error)) {
      console.warn('Could not fetch school config from Firestore, using cached state:', error);
    }
  }

  return localFallback;
}

export async function saveSchoolConfig(config: Partial<SchoolConfig>, updatedBy: string = 'Admin'): Promise<void> {
  const current = await getSchoolConfig();
  const updated: SchoolConfig = sanitizeSchoolConfig({
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

  localStorage.setItem('phssj_school_config', JSON.stringify(updated));
}

export async function resetSchoolConfigToDefaults(updatedBy: string = 'Admin'): Promise<SchoolConfig> {
  const resetConfig: SchoolConfig = {
    ...DEFAULT_SCHOOL_CONFIG,
    updatedAt: Date.now(),
    updatedBy: `${updatedBy} (Reset)`,
  };

  try {
    const docRef = doc(db, SETTINGS_DOC_PATH, SETTINGS_DOC_ID);
    await setDoc(docRef, resetConfig);
  } catch (error) {
    if (!isOfflineError(error)) {
      console.warn('Failed to reset school config in Firestore, saving locally:', error);
    }
  }

  localStorage.setItem('phssj_school_config', JSON.stringify(resetConfig));
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
            const sanitized = sanitizeSchoolConfig(data);
            localStorage.setItem('phssj_school_config', JSON.stringify(sanitized));
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

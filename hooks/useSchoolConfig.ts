import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  SchoolConfig,
  getCachedSchoolConfig,
  setCachedSchoolConfig,
  subscribeSchoolConfigStore,
  subscribeSchoolConfig,
  getSchoolConfig,
  saveSchoolConfig,
  resetSchoolConfigToDefaults,
} from '../services/schoolConfigService';
import { isUserAdmin } from '../services/adminService';
import { auth } from '../services/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { toUserErrorMessage } from '../utils/userMessage';

let activeHookSubscribers = 0;
let sharedFirestoreUnsub: (() => void) | null = null;
let initialFetchPromise: Promise<SchoolConfig> | null = null;

function retainSharedConfigSync(): () => void {
  activeHookSubscribers += 1;

  if (!initialFetchPromise) {
    initialFetchPromise = getSchoolConfig()
      .catch((err) => {
        console.warn('Initial config load failed, keeping cached state', err);
        return getCachedSchoolConfig();
      })
      .finally(() => {
        initialFetchPromise = null;
      });
  }

  if (!sharedFirestoreUnsub) {
    sharedFirestoreUnsub = subscribeSchoolConfig(
      () => {
        // Store listeners receive updates automatically via repository.ts
      },
      (err) => {
        console.warn('Realtime config sync error, keeping cached state', err);
      }
    );
  }

  return () => {
    activeHookSubscribers = Math.max(0, activeHookSubscribers - 1);
    if (activeHookSubscribers === 0 && sharedFirestoreUnsub) {
      sharedFirestoreUnsub();
      sharedFirestoreUnsub = null;
    }
  };
}

export function useSchoolConfig() {
  const [config, setLocalConfig] = useState<SchoolConfig>(() => getCachedSchoolConfig());
  const [currentUser, setCurrentUser] = useState<User | null>(auth.currentUser);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const saveSuccessTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (saveSuccessTimerRef.current) clearTimeout(saveSuccessTimerRef.current);
    };
  }, []);

  // Auth listener
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
    });
    return () => unsubAuth();
  }, []);

  const isAdmin = useMemo(() => isUserAdmin(currentUser?.email), [currentUser]);

  // Shared reactive store + single ref-counted Firestore sync
  useEffect(() => {
    let isMounted = true;
    const unsubStore = subscribeSchoolConfigStore((next) => {
      if (isMounted) {
        setLocalConfig(next);
        setIsLoading(false);
      }
    });
    const releaseSync = retainSharedConfigSync();

    setLocalConfig(getCachedSchoolConfig());
    if (initialFetchPromise) {
      initialFetchPromise.then((loaded) => {
        if (isMounted) {
          setLocalConfig(loaded);
          setIsLoading(false);
        }
      });
    } else {
      setIsLoading(false);
    }

    return () => {
      isMounted = false;
      unsubStore();
      releaseSync();
    };
  }, []);

  const setConfig = useCallback((next: SchoolConfig | ((prev: SchoolConfig) => SchoolConfig)) => {
    const resolved = typeof next === 'function' ? next(getCachedSchoolConfig()) : next;
    setCachedSchoolConfig(resolved);
  }, []);

  const flashSaveSuccess = useCallback(() => {
    setSaveSuccess(true);
    if (saveSuccessTimerRef.current) clearTimeout(saveSuccessTimerRef.current);
    saveSuccessTimerRef.current = setTimeout(() => {
      saveSuccessTimerRef.current = null;
      setSaveSuccess(false);
    }, 4000);
  }, []);

  const saveConfig = useCallback(
    async (updatedConfig: SchoolConfig) => {
      setIsSaving(true);
      setError(null);
      setSaveSuccess(false);
      try {
        await saveSchoolConfig(updatedConfig, currentUser?.email || undefined);
        flashSaveSuccess();
      } catch (err: any) {
        console.error('Error saving school configuration:', err);
        setError(toUserErrorMessage(err, 'Failed to save settings.'));
        throw err;
      } finally {
        setIsSaving(false);
      }
    },
    [currentUser, flashSaveSuccess]
  );

  const resetToDefaults = useCallback(async () => {
    setIsSaving(true);
    setError(null);
    try {
      await resetSchoolConfigToDefaults(currentUser?.email || undefined);
      flashSaveSuccess();
    } catch (err: any) {
      console.error('Error resetting school configuration:', err);
      setError(toUserErrorMessage(err, 'Failed to restore defaults.'));
      throw err;
    } finally {
      setIsSaving(false);
    }
  }, [currentUser, flashSaveSuccess]);

  return {
    config,
    setConfig,
    isAdmin,
    currentUser,
    isLoading,
    isSaving,
    saveSuccess,
    error,
    saveConfig,
    resetToDefaults,
  };
}

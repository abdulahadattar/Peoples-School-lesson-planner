import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  SchoolConfig,
  DEFAULT_SCHOOL_CONFIG,
  subscribeSchoolConfig,
  getSchoolConfig,
  saveSchoolConfig,
  resetSchoolConfigToDefaults,
} from '../services/schoolConfigService';
import { isUserAdmin } from '../services/adminService';
import { auth } from '../services/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { toUserErrorMessage } from '../utils/userMessage';

export function useSchoolConfig() {
  const [config, setConfig] = useState<SchoolConfig>(() => {
    try {
      const cached = localStorage.getItem('phssj_school_config');
      if (cached) return JSON.parse(cached);
    } catch {}
    return DEFAULT_SCHOOL_CONFIG;
  });

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

  // Initial load & real-time listener
  useEffect(() => {
    let isMounted = true;

    getSchoolConfig()
      .then((initial) => {
        if (isMounted) {
          setConfig(initial);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        console.warn('Initial config load failed, keeping cached state', err);
        if (isMounted) setIsLoading(false);
      });

    const unsubscribe = subscribeSchoolConfig(
      (updated) => {
        if (isMounted) {
          setConfig(updated);
          setIsLoading(false);
        }
      },
      (err) => {
        console.warn('Realtime config sync error, keeping cached state', err);
      }
    );

    return () => {
      isMounted = false;
      unsubscribe();
    };
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
        setConfig(updatedConfig);
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
      const res = await resetSchoolConfigToDefaults(currentUser?.email || undefined);
      setConfig(res);
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

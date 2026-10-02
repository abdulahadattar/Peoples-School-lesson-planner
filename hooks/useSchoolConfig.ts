import { useState, useEffect, useCallback, useMemo } from 'react';
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

    getSchoolConfig().then((initial) => {
      if (isMounted) {
        setConfig(initial);
        setIsLoading(false);
      }
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

  const saveConfig = useCallback(
    async (updatedConfig: SchoolConfig) => {
      setIsSaving(true);
      setError(null);
      setSaveSuccess(false);
      try {
        await saveSchoolConfig(updatedConfig, currentUser?.email || undefined);
        setConfig(updatedConfig);
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 4000);
      } catch (err: any) {
        console.error('Error saving school configuration:', err);
        setError(err?.message || 'Failed to save configuration.');
        throw err;
      } finally {
        setIsSaving(false);
      }
    },
    [currentUser]
  );

  const resetToDefaults = useCallback(async () => {
    setIsSaving(true);
    setError(null);
    try {
      const res = await resetSchoolConfigToDefaults(currentUser?.email || undefined);
      setConfig(res);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 4000);
    } catch (err: any) {
      console.error('Error resetting school configuration:', err);
      setError(err?.message || 'Failed to reset configuration.');
      throw err;
    } finally {
      setIsSaving(false);
    }
  }, [currentUser]);

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

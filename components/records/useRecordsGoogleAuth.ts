import { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import {
  initAuth,
  googleSignIn,
  logout,
  getAccessToken,
  getCurrentUser,
} from '../../services/googleAuth';

export function useRecordsGoogleAuth(
  showNotification: (message: string, type?: 'success' | 'error' | 'info') => void
) {
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState<boolean>(false);

  useEffect(() => {
    initAuth((user) => {
      setAuthUser(user);
      if (user) {
        getAccessToken().then(setAuthToken);
      } else {
        setAuthToken(null);
      }
    });
    const current = getCurrentUser();
    if (current) {
      setAuthUser(current);
      getAccessToken().then(setAuthToken);
    }
  }, []);

  const handleSignIn = async () => {
    setIsAuthLoading(true);
    try {
      const res = await googleSignIn();
      if (res) {
        setAuthUser(res.user);
        setAuthToken(res.accessToken);
        showNotification(`Signed in as ${res.user.displayName || res.user.email}. Direct Google Sheets sync enabled!`);
      }
    } catch (err: any) {
      if (
        err?.code === 'auth/popup-closed-by-user' ||
        err?.code === 'auth/cancelled-popup-request' ||
        err?.code === 'auth/user-cancelled'
      ) {
        return;
      }
      showNotification(err?.message || 'Google Sign-In failed.', 'error');
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await logout();
      setAuthUser(null);
      setAuthToken(null);
      showNotification('Disconnected from Google Account.', 'info');
    } catch (err: any) {
      console.error('Sign out error:', err);
    }
  };

  return {
    authUser,
    authToken,
    isAuthLoading,
    handleSignIn,
    handleSignOut,
  };
}

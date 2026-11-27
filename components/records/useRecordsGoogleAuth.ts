import { useState, useEffect } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from '../../services/firebase';
import {
  googleSignIn,
  logout,
  getAccessToken,
  getCurrentUser,
  GOOGLE_TOKEN_EVENT,
} from '../../services/googleAuth';

export function useRecordsGoogleAuth(
  showNotification: (message: string, type?: 'success' | 'error' | 'info') => void
) {
  const [authUser, setAuthUser] = useState<User | null>(() => getCurrentUser());
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState<boolean>(false);

  useEffect(() => {
    let active = true;

    const syncToken = () => {
      getAccessToken()
        .then((token) => {
          if (active) setAuthToken(token);
        })
        .catch(() => {
          if (active) setAuthToken(null);
        });
    };

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!active) return;
      setAuthUser(user);
      if (user) {
        syncToken();
      } else {
        setAuthToken(null);
      }
    });

    const handleTokenChange = () => {
      if (auth.currentUser || getCurrentUser()) {
        syncToken();
      } else if (active) {
        setAuthToken(null);
      }
    };

    if (authUser) syncToken();
    window.addEventListener(GOOGLE_TOKEN_EVENT, handleTokenChange);

    return () => {
      active = false;
      unsubscribe();
      window.removeEventListener(GOOGLE_TOKEN_EVENT, handleTokenChange);
    };
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

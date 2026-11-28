import { useState, useEffect } from 'react';
import { Theme } from '../types';
import { auth } from '../services/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';

const SESSION_HINT_KEY = 'phssj_has_session';

function readInitialAuthFlags() {
  if (typeof window === 'undefined') {
    return { isGuest: false, hasSessionHint: false };
  }
  const isGuest = sessionStorage.getItem('phssj_guest_mode') === 'true';
  const hasSessionHint = localStorage.getItem(SESSION_HINT_KEY) === '1';
  return { isGuest, hasSessionHint };
}

export function useAppThemeAndAuth() {
  const [{ isGuest, hasSessionHint }] = useState(readInitialAuthFlags);
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === 'undefined') return 'light';
    const savedTheme = localStorage.getItem('theme') as Theme | null;
    if (savedTheme === 'light' || savedTheme === 'dark') return savedTheme;
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authResolved, setAuthResolved] = useState<boolean>(false);
  const [showLoginGate, setShowLoginGate] = useState<boolean>(() => !isGuest && !hasSessionHint);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setAuthResolved(true);
      if (user) {
        try {
          localStorage.setItem(SESSION_HINT_KEY, '1');
        } catch {
          // Ignore storage quota/privacy mode failures
        }
        setShowLoginGate(false);
      } else {
        try {
          localStorage.removeItem(SESSION_HINT_KEY);
        } catch {
          // Ignore storage quota/privacy mode failures
        }
        const guestActive = sessionStorage.getItem('phssj_guest_mode') === 'true';
        setShowLoginGate(!guestActive);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    // Keep in sync with the index.html bootstrap script: dark class present
    // => dark. Set `style.colorScheme` on every apply (including initial) so
    // UA form controls and scrollbars switch theme together with the class.
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
      document.documentElement.style.colorScheme = 'dark';
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.style.colorScheme = 'light';
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(prev => prev === 'light' ? 'dark' : 'light');

  return {
    theme,
    toggleTheme,
    currentUser,
    setCurrentUser,
    authResolved,
    showLoginGate,
    setShowLoginGate,
  };
}

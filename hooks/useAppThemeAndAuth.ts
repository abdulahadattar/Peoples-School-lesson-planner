import { useState, useEffect } from 'react';
import { Theme } from '../types';
import { auth } from '../services/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';

export function useAppThemeAndAuth() {
  const [theme, setTheme] = useState<Theme>('light');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authResolved, setAuthResolved] = useState<boolean>(false);
  const [showLoginGate, setShowLoginGate] = useState<boolean>(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setAuthResolved(true);
      if (user) {
        setShowLoginGate(false);
      } else {
        const isGuest = sessionStorage.getItem('phssj_guest_mode') === 'true';
        setShowLoginGate(!isGuest);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as Theme;
    if (savedTheme) {
      setTheme(savedTheme);
    } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      setTheme('dark');
    }
  }, []);

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
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

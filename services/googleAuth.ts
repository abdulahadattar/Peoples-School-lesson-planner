import {
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
  signOut,
} from 'firebase/auth';
import { auth } from './firebase';

export { auth };

export const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file',
];

const provider = new GoogleAuthProvider();
// Request Google Workspace Sheets scopes
SCOPES.forEach((scope) => provider.addScope(scope));
provider.setCustomParameters({
  prompt: 'select_account',
});

let isSigningIn = false;
// Cache the access token in memory and localStorage for reuse
let cachedAccessToken: string | null = localStorage.getItem('google_access_token') || null;
const expiryStr = localStorage.getItem('google_token_expiry');
const tokenExpiry: number | null = expiryStr ? parseInt(expiryStr, 10) : null;

if (cachedAccessToken && tokenExpiry && Date.now() > tokenExpiry) {
  // Token expired
  cachedAccessToken = null;
  localStorage.removeItem('google_access_token');
  localStorage.removeItem('google_token_expiry');
}

let currentUser: User | null = null;

/**
 * Initialize auth state listener. Call this on app load.
 */
export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    currentUser = user;
    if (user) {
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        // Token might need re-fetching or initial user logged in without token in memory
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

/**
 * Trigger Google Sign-In with popup.
 * Handles user cancellations and popup closures gracefully without throwing fatal errors.
 */
export const googleSignIn = async (): Promise<{ user: User; accessToken: string | null } | null> => {
  if (isSigningIn) return null;
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    cachedAccessToken = credential?.accessToken || null;
    if (cachedAccessToken) {
      localStorage.setItem('google_access_token', cachedAccessToken);
      // OAuth tokens usually last 1 hour (3600 seconds), expire it slightly early (55 min)
      localStorage.setItem('google_token_expiry', (Date.now() + 55 * 60 * 1000).toString());
    }
    currentUser = result.user;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    // User deliberately closed the popup or cancelled the prompt - normal interaction, not an app error
    if (
      error?.code === 'auth/popup-closed-by-user' ||
      error?.code === 'auth/cancelled-popup-request' ||
      error?.code === 'auth/user-cancelled'
    ) {
      return null;
    }

    // Popup was blocked by browser or iframe sandbox policy
    if (error?.code === 'auth/popup-blocked') {
      console.warn(
        'Sign-in pop-up was blocked by your browser. Please allow pop-ups for this site or open the app in a new window.'
      );
      return null;
    }

    // Log unexpected errors cleanly
    console.warn('Google Sign In:', error?.message || error);
    return null;
  } finally {
    isSigningIn = false;
  }
};

export const loginWithGoogle = async (): Promise<User | null> => {
  const res = await googleSignIn();
  return res?.user || null;
};

/**
 * Google access tokens for the Sheets scope expire roughly every hour, and the
 * Firebase web SDK offers no silent refresh, so an expired token can only be
 * replaced by signing in again.
 *
 * Returns null when there is no usable token so callers can prompt for a fresh
 * sign-in.
 */
export const getAccessToken = async (): Promise<string | null> => {
  if (cachedAccessToken) {
    if (isTokenExpired()) {
      cachedAccessToken = null;
    } else {
      return cachedAccessToken;
    }
  }

  const stored = localStorage.getItem('google_access_token');
  const expiry = localStorage.getItem('google_token_expiry');
  if (!stored) return null;

  // The expiry has to be honoured. This previously returned the stored token
  // even when it had expired, so after ~55 minutes every Google Sheets write
  // failed with 401 - silently, because the caller swallowed the error. The
  // sheet simply stopped receiving attendance.
  if (!expiry || Date.now() >= parseInt(expiry, 10)) {
    localStorage.removeItem('google_access_token');
    localStorage.removeItem('google_token_expiry');
    return null;
  }

  cachedAccessToken = stored;
  return stored;
};

/** True when the stored Google access token is missing or past its expiry. */
export const isGoogleTokenExpired = (): boolean => {
  if (!localStorage.getItem('google_access_token')) return true;
  return isTokenExpired();
};

function isTokenExpired(): boolean {
  const expiry = localStorage.getItem('google_token_expiry');
  if (!expiry) return true;
  return Date.now() >= parseInt(expiry, 10);
}

/**
 * Get currently authenticated user object.
 */
export const getCurrentUser = (): User | null => {
  return currentUser || auth.currentUser;
};

/**
 * Sign out of Google session and clear in-memory token.
 */
export const logout = async (): Promise<void> => {
  await signOut(auth);
  cachedAccessToken = null;
  localStorage.removeItem('google_access_token');
  localStorage.removeItem('google_token_expiry');
  currentUser = null;
};

export const logoutUser = logout;


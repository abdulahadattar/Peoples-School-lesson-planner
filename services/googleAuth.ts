import {
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
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

/**
 * Build a GoogleAuthProvider with Sheets/Drive scopes.
 * Popup and redirect sign-in need separate provider instances.
 */
const createGoogleProvider = (): GoogleAuthProvider => {
  const provider = new GoogleAuthProvider();
  // Request Google Workspace Sheets scopes
  SCOPES.forEach((scope) => provider.addScope(scope));
  provider.setCustomParameters({
    prompt: 'select_account',
  });
  return provider;
};

const popupProvider = createGoogleProvider();
const redirectProvider = createGoogleProvider();

let isSigningIn = false;

// Remember (in sessionStorage) that a redirect sign-in is in flight so the page
// can show a status message after the browser navigates back from Google.
const REDIRECT_PENDING_KEY = 'google_signin_redirect_pending';

/**
 * Detect embedded contexts (iframes/webviews) where browsers block window.open
 * popups entirely, e.g. AI Studio applets, VS Code simple browser or embedded previews.
 * Firebase's signInWithRedirect breaks out of these via cross-origin messaging,
 * while signInWithPopup would fail with auth/popup-blocked.
 */
const isEmbeddedContext = (): boolean => {
  try {
    return window.self !== window.top;
  } catch {
    // Cross-origin access to window.top throws => we are definitely framed.
    return true;
  }
};

/**
 * Consume the pending-redirect marker. Returns true if a redirect sign-in
 * was in flight (useful for showing a status message on the login page).
 */
export const consumeRedirectSignInStatus = (): boolean => {
  try {
    const pending = sessionStorage.getItem(REDIRECT_PENDING_KEY) === '1';
    sessionStorage.removeItem(REDIRECT_PENDING_KEY);
    return pending;
  } catch {
    return false;
  }
};

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
 * Trigger Google Sign-In with popup, falling back to a full-page redirect when
 * popups cannot open (embedded frames/webviews, strict popup blockers).
 * Handles user cancellations and popup closures gracefully without throwing fatal errors.
 */
export const googleSignIn = async (): Promise<{ user: User; accessToken: string | null } | null> => {
  if (isSigningIn) return null;

  // In embedded contexts (iframes/webviews) browsers block window.open entirely,
  // so go straight to a full-page redirect — it breaks out of the frame via
  // Firebase's cross-origin messaging and uses the same authorized domains.
  if (isEmbeddedContext()) {
    try {
      sessionStorage.setItem(REDIRECT_PENDING_KEY, '1');
    } catch {
      /* sessionStorage unavailable — non-fatal */
    }
    try {
      const started = await attemptRedirectWithTimeout();
      if (!started) {
        // Navigation was blocked (webview) — clear the marker so a reload
        // doesn't wait for a redirect result that will never arrive.
        try {
          sessionStorage.removeItem(REDIRECT_PENDING_KEY);
        } catch {
          /* ignore */
        }
      }
    } catch (e) {
      // Redirect could not start (e.g. unauthorized-domain) — clear the marker
      // so the next page load doesn't wait for a result that never arrives.
      try {
        sessionStorage.removeItem(REDIRECT_PENDING_KEY);
      } catch {
        /* ignore */
      }
      throw e;
    }
    // Page will navigate away to Google; if we get here something is off.
    return null;
  }

  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, popupProvider);
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

    // Popup was blocked by browser or iframe sandbox policy — retry via full-page redirect
    if (error?.code === 'auth/popup-blocked') {
      console.warn(
        'Sign-in pop-up was blocked by your browser. Falling back to full-page redirect sign-in...'
      );
      try {
        sessionStorage.setItem(REDIRECT_PENDING_KEY, '1');
      } catch {
        /* sessionStorage unavailable — non-fatal */
      }
      try {
        const started = await attemptRedirectWithTimeout();
        if (!started) {
          try {
            sessionStorage.removeItem(REDIRECT_PENDING_KEY);
          } catch {
            /* ignore */
          }
        }
      } catch (redirectErr: any) {
        // Redirect could not start — clear marker and surface the real error.
        try {
          sessionStorage.removeItem(REDIRECT_PENDING_KEY);
        } catch {
          /* ignore */
        }
        throw redirectErr;
      }
      // Page will navigate away to Google; if we get here something is off.
      return null;
    }

    // Log unexpected errors cleanly and let callers surface them
    console.warn('Google Sign In:', error?.message || error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const loginWithGoogle = async (): Promise<User | null> => {
  const res = await googleSignIn();
  return res?.user || null;
};

/**
 * Attempt signInWithRedirect with a short timeout race. Returns true if the
 * redirect initiation resolved (navigation is underway), false if the timeout
 * won first (some embedded webviews silently block the top-level navigation,
 * leaving signInWithRedirect pending forever — resolving early lets the UI
 * reset instead of hanging).
 */
const attemptRedirectWithTimeout = async (): Promise<boolean> => {
  let started = false;
  await Promise.race([
    signInWithRedirect(auth, redirectProvider).then(() => {
      started = true;
    }),
    new Promise((resolve) => setTimeout(resolve, 4000)),
  ]);
  return started;
};

/**
 * Process the return trip from a full-page redirect sign-in (if any) and cache
 * the Google access token. Safe to call on every app load — resolves to null
 * when there is no pending redirect result.
 */
export const processRedirectSignIn = async (): Promise<User | null> => {
  // Guard with a timeout: getRedirectResult can hang indefinitely when a
  // redirect was requested but never actually completed (e.g. it failed before
  // navigation). Without this the sign-in button would stay stuck forever.
  const result = await Promise.race([
    getRedirectResult(auth),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 20000)),
  ]);
  if (!result) return null;

  const credential = GoogleAuthProvider.credentialFromResult(result);
  cachedAccessToken = credential?.accessToken || null;
  if (cachedAccessToken) {
    localStorage.setItem('google_access_token', cachedAccessToken);
    // OAuth tokens usually last 1 hour (3600 seconds), expire it slightly early (55 min)
    localStorage.setItem('google_token_expiry', (Date.now() + 55 * 60 * 1000).toString());
  }
  currentUser = result.user;
  return result.user;
};

/**
 * Get current in-memory access token.
 */
export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

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


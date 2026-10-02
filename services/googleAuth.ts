import {
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
  signOut,
} from 'firebase/auth';
import { auth } from './firebase';
import firebaseConfig from '../firebase-applet-config.json';

// `auth` is not re-exported from here. Nothing imported it from this module,
// and re-exporting a binding owned by ./firebase forced the bundler to read
// that binding eagerly - which happened before services/firebase.ts had
// initialised it, blanking the whole app on load. See the note in
// services/firebase.ts for the full cycle.

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

/**
 * Fired whenever the Sheets token or its expiry changes.
 *
 * The `storage` event only ever fires in *other* tabs, so a same-tab
 * reconnect wrote a fresh `google_token_expiry` that the Header never heard
 * about: the countdown kept showing the old (expired) state until the page was
 * reloaded. The 30s poll could paper over it, but only when a poll happened to
 * land afterwards, which is not something a user can rely on. Every write
 * therefore broadcasts here, so anything showing the token state updates
 * immediately in the tab that changed it.
 */
export const GOOGLE_TOKEN_EVENT = 'phssj:google-token-changed';

function notifyTokenChanged(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(GOOGLE_TOKEN_EVENT));
}

/** Exposed so callers that mutate expiry from outside this module can broadcast. */
export const broadcastTokenChange = notifyTokenChanged;
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
      // Same-tab write: without this the Header's countdown stayed stuck on the
      // pre-reconnect value until the page was reloaded.
      notifyTokenChanged();
    } else {
      // We are signed in but hold no Sheets token, so anything reading the
      // countdown must move back to "expired" rather than keep showing the
      // previous number. Dropping the keys also clears a stale one.
      localStorage.removeItem('google_access_token');
      localStorage.removeItem('google_token_expiry');
      notifyTokenChanged();
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

  // The expiry has to be honoured. If expired or missing, attempt silent refresh
  // via Google Identity Services before clearing and dropping to null.
  if (!expiry || Date.now() >= parseInt(expiry, 10)) {
    const refreshed = await refreshAccessTokenSilently();
    if (refreshed) {
      return refreshed;
    }
    localStorage.removeItem('google_access_token');
    localStorage.removeItem('google_token_expiry');
    // The badge is counting down from that same key, so let it drop to expired
    // now instead of waiting for the next poll interval.
    notifyTokenChanged();
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

/** How long a freshly minted token is assumed valid. Google issues 1 hour. */
const TOKEN_LIFETIME_MS = 55 * 60 * 1000;

/** The Firebase web app's Google OAuth client, derived the standard way. */
function googleClientId(): string | null {
  const fromConfig = (firebaseConfig as { oAuthClientId?: string }).oAuthClientId;
  if (fromConfig) return fromConfig;
  const projectNumber = (firebaseConfig as { messagingSenderId?: string }).messagingSenderId;
  return projectNumber ? `${projectNumber}.apps.googleusercontent.com` : null;
}

let gisPromise: Promise<void> | null = null;

/** Loads the Google Identity Services script once, if we have a client id. */
function loadGis(): Promise<void> {
  if ((window as any).google?.accounts?.oauth2) return Promise.resolve();
  if (gisPromise) return gisPromise;
  gisPromise = new Promise<void>((resolve) => {
    if (!googleClientId()) return resolve();
    const existing = document.querySelector('script[data-gis="true"]');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => resolve());
      if ((window as any).google?.accounts?.oauth2) return resolve();
      return;
    }
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.defer = true;
    s.dataset.gis = 'true';
    s.onload = () => resolve();
    s.onerror = () => resolve();
    document.head.appendChild(s);
  });
  return gisPromise;
}

let gisTokenClient: any = null;

function getGisTokenClient(): any {
  if (gisTokenClient) return gisTokenClient;
  const g = (window as any).google;
  if (!g?.accounts?.oauth2 || !googleClientId()) return null;
  gisTokenClient = g.accounts.oauth2.initTokenClient({
    client_id: googleClientId(),
    scope: SCOPES.join(' '),
    // "" means: do not show any UI. Google returns a token silently when the
    // user still has an active session and has already granted these scopes.
    prompt: '',
  });
  return gisTokenClient;
}

function storeAccessToken(token: string) {
  cachedAccessToken = token;
  localStorage.setItem('google_access_token', token);
  localStorage.setItem('google_token_expiry', (Date.now() + TOKEN_LIFETIME_MS).toString());
  // The silent refresh can run from a background effect; the visible countdown
  // has to move without waiting for the next poll.
  notifyTokenChanged();
}

/**
 * Obtains a fresh Google access token without any user interaction.
 *
 * The Sheets scope token Google issues via the Firebase popup is a one-hour
 * credential with no refresh path, which is why register and attendance writes
 * used to start failing an hour after signing in. Google Identity Services can
 * mint the same token silently for a user who has already consented, so one
 * sign-in now keeps the register connected.
 *
 * Resolves null when a silent token is not available; the caller then falls
 * back to an explicit sign-in.
 */
export async function refreshAccessTokenSilently(): Promise<string | null> {
  const clientId = googleClientId();
  if (!clientId) return null;
  try {
    await loadGis();
    const client = getGisTokenClient();
    if (!client) return null;
    return await new Promise<string | null>((resolve) => {
      let settled = false;
      const done = (value: string | null) => {
        if (settled) return;
        settled = true;
        if (value) storeAccessToken(value);
        resolve(value);
      };
      // Never hang a save on the popup/iframe round trip.
      const timer = setTimeout(() => done(null), 8000);
      try {
        client.requestAccessToken({
          callback: (resp: { access_token?: string }) => {
            clearTimeout(timer);
            done(resp?.access_token ?? null);
          },
          error_callback: () => {
            clearTimeout(timer);
            done(null);
          },
        });
      } catch {
        clearTimeout(timer);
        done(null);
      }
    });
  } catch {
    return null;
  }
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
  notifyTokenChanged();
};

export const logoutUser = logout;


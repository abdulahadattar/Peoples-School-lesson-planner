import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  type User,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

export const DRIVE_SCOPES = ['https://www.googleapis.com/auth/drive.readonly'];

const provider = new GoogleAuthProvider();
for (const scope of DRIVE_SCOPES) {
  provider.addScope(scope);
}
provider.setCustomParameters({
  prompt: 'select_account',
});

let isSigningIn = false;
// Strictly in-memory OAuth access token (never stored in localStorage/sessionStorage)
let cachedDriveAccessToken: string | null = null;

export function initAuth(
  onAuthChange: (user: User | null, hasDriveToken: boolean) => void
): () => void {
  return onAuthStateChanged(auth, (user) => {
    if (!user && !isSigningIn) {
      cachedDriveAccessToken = null;
    }
    onAuthChange(user, Boolean(cachedDriveAccessToken));
  });
}

export async function googleSignIn(): Promise<{
  user: User;
  driveAccessToken: string;
  idToken: string;
}> {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Google Drive access token was not returned. Please grant Drive permission.');
    }
    cachedDriveAccessToken = credential.accessToken;
    const idToken = await result.user.getIdToken();
    return {
      user: result.user,
      driveAccessToken: cachedDriveAccessToken,
      idToken,
    };
  } finally {
    isSigningIn = false;
  }
}

export function getDriveAccessToken(): string | null {
  return cachedDriveAccessToken;
}

export async function getFirebaseIdToken(): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) return null;
  return user.getIdToken();
}

export async function logout(): Promise<void> {
  cachedDriveAccessToken = null;
  await auth.signOut();
}

import { ADMIN_EMAILS } from '../adminService.js';
import firebaseConfig from '../../firebase-applet-config.json';

export interface VerifiedAdminIdentity {
  uid: string;
  email: string;
}

export type AdminTokenVerifier = (idToken: string) => Promise<VerifiedAdminIdentity | null>;

let customVerifierForTests: AdminTokenVerifier | null = null;

export function setAdminTokenVerifierForTests(verifier: AdminTokenVerifier | null): void {
  customVerifierForTests = verifier;
}

async function verifyWithFirebaseAdmin(idToken: string): Promise<VerifiedAdminIdentity | null> {
  if (!idToken || !idToken.trim()) return null;
  const adminApp = await import('firebase-admin/app');
  const adminAuth = await import('firebase-admin/auth');

  const appName = 'phssj-token-verifier';
  const existing = adminApp.getApps().find((a) => a.name === appName);
  const app =
    existing ||
    adminApp.initializeApp(
      { projectId: (firebaseConfig as { projectId?: string }).projectId },
      appName
    );

  const decoded = await adminAuth.getAuth(app).verifyIdToken(idToken.trim());
  const email = typeof decoded.email === 'string' ? decoded.email.trim().toLowerCase() : '';
  if (!email || decoded.email_verified !== true) {
    return null;
  }
  if (!ADMIN_EMAILS.includes(email)) {
    return null;
  }
  return { uid: decoded.uid, email };
}

export async function verifyAdminToken(idToken?: string | null): Promise<{
  ok: boolean;
  status: 200 | 401 | 403;
  error?: string;
  identity?: VerifiedAdminIdentity;
}> {
  if (!idToken || !idToken.trim()) {
    return { ok: false, status: 401, error: 'Authentication required for Admin reset.' };
  }

  try {
    if (customVerifierForTests) {
      const identity = await customVerifierForTests(idToken.trim());
      if (!identity) {
        return { ok: false, status: 403, error: 'Admin privileges required.' };
      }
      return { ok: true, status: 200, identity };
    }

    const identity = await verifyWithFirebaseAdmin(idToken);
    if (!identity) {
      return { ok: false, status: 403, error: 'Admin privileges required.' };
    }
    return { ok: true, status: 200, identity };
  } catch (err: any) {
    return {
      ok: false,
      status: 401,
      error: err?.message ? `Invalid or expired session token (${err.message})` : 'Invalid or expired session token.',
    };
  }
}

export function extractBearerToken(headers: Record<string, string | string[] | undefined>): string | null {
  const authHeader = headers.authorization || headers.Authorization;
  const raw = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  if (typeof raw === 'string' && raw.startsWith('Bearer ')) {
    const token = raw.slice(7).trim();
    if (token) return token;
  }
  const fbHeader = headers['x-firebase-auth'];
  const fbRaw = Array.isArray(fbHeader) ? fbHeader[0] : fbHeader;
  if (typeof fbRaw === 'string' && fbRaw.trim()) {
    return fbRaw.trim();
  }
  return null;
}

/**
 * Firestore connection bootstrap for the document archive (C6). Design as in
 * firestoreBackend.ts; this module owns credential activation, the lazily
 * created single Admin backend, and the module-wide Firestore-mode flag.
 *
 * Dynamic import keeps firebase-admin out of every cold start that never
 * reaches an activated runtime (local server.ts / unit tests); Vercel Node
 * File Trace still bundles it for the deployed api function — the entrypoint
 * already bundles its shared imports this way (header comment of
 * services/serverless/documentsRoutes.ts; same mechanism proves
 * zod/@autonoma-ai/sdk/express ship through api/index.ts since C5).
 */
import fs from 'fs';
import { isFirestoreDocumentModeRequested, type DocumentStoreBackend } from './firestoreBackend.js';

let activeMode = false;
let backendPromise: Promise<DocumentStoreBackend> | null = null;
let failedInitCount = 0;

export function isFirestoreStoreActive(): boolean {
  return activeMode;
}

async function loadAdminSdk(): Promise<{ initializeApp: Function; cert: Function; getFirestore: Function }> {
  const adminApp = await import('firebase-admin/app');
  const adminFs = await import('firebase-admin/firestore');
  return {
    initializeApp: (adminApp as any).initializeApp,
    cert: (adminApp as any).cert,
    getFirestore: (adminFs as any).getFirestore,
  };
}

async function createAdminBackend(): Promise<DocumentStoreBackend> {
  const { initializeApp, cert, getFirestore } = await loadAdminSdk();
  const jsonRaw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const keyPath = process.env.FIREBASE_SERVICE_ACCOUNT_KEY_PATH;
  // Never reads credentials from database/config files; never logs the JSON.
  const credentialJson: Record<string, string> | null = jsonRaw
    ? JSON.parse(jsonRaw)
    : keyPath
      ? JSON.parse(fs.readFileSync(keyPath, 'utf-8'))
      : null;
  const adminOptions: Record<string, unknown> = { credential: cert(credentialJson) };
  if (credentialJson?.project_id) adminOptions.projectId = credentialJson.project_id;
  const app = initializeApp(adminOptions, 'document-archive-store');
  // Default Firestore database — same one the applet config targets.
  const db = getFirestore(app);
  const col = (name: string) => db.collection(name);

  return {
    async getDoc(c, id) {
      const snap = await col(c).doc(id).get();
      return snap.exists ? (snap.data() as Record<string, unknown>) : null;
    },
    async getDocsAll(c) {
      const snap = await col(c).get();
      return snap.docs.map((d) => ({ id: d.id, data: d.data() as Record<string, unknown> }));
    },
    async getDocsWhereIn(c, field, values) {
      if (values.length === 0) return [];
      const snap = await col(c).where(field, 'in', values).get();
      return snap.docs.map((d) => ({ id: d.id, data: d.data() as Record<string, unknown> }));
    },
    async getLatest(c, orderField) {
      const snap = await col(c).orderBy(orderField, 'desc').limit(1).get();
      return snap.docs[0]?.data() ?? null;
    },
    async setDoc(c, id, data) { await col(c).doc(id).set(data as any); },
    async deleteDoc(c, id) { await col(c).doc(id).delete(); },
    async getSubDoc(c, parentId, sub, id) {
      const snap = await col(c).doc(parentId).collection(sub).doc(id).get();
      return snap.exists ? (snap.data() as Record<string, unknown>) : null;
    },
    async setSubDoc(c, parentId, sub, id, data) {
      await col(c).doc(parentId).collection(sub).doc(id).set(data as any);
    },
    async getSubDocs(c, parentId, sub) {
      const snap = await col(c).doc(parentId).collection(sub).get();
      return snap.docs.map((d) => ({ id: d.id, data: d.data() as Record<string, unknown> }));
    },
  };
}

/** Returns the backend in Firestore mode, null in disk/debounce modes. */
export async function getFirestoreBackend(): Promise<DocumentStoreBackend | null> {
  if (!activeMode) return null;
  if (!backendPromise) backendPromise = createAdminBackend();
  try {
    return await backendPromise;
  } catch (err) {
    backendPromise = null;
    failedInitCount++;
    console.error(`[documentArchiveFirestore] Admin SDK init failed (attempt ${failedInitCount}); using memory only:`, (err as Error)?.message);
    return null;
  }
}

/** store.ts calls this once at module init, before the FIX-4b sweep. */
export function activateFirestoreDocumentStoreIfConfigured(): boolean {
  activeMode = isFirestoreDocumentModeRequested();
  return activeMode;
}

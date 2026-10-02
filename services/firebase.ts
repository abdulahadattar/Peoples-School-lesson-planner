import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  doc,
  getDocFromServer,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

/**
 * Firebase client bootstrap.
 *
 * Official references — read before changing auth, persistence or rules:
 *   Web setup        https://firebase.google.com/docs/web/setup
 *   Auth             https://firebase.google.com/docs/auth
 *   Firestore rules  https://firebase.google.com/docs/firestore/security/rules-structure
 *   Admin SDK (Node) https://firebase.google.com/docs/admin/setup
 *
 * Security model: every read/write is gated by firestore.rules, which denies by
 * default (`allow read, write: if false`) and re-opens narrow, explicit paths.
 * A change here is meaningless without a matching rules change — test with
 * `npm run test:rules`. Never widen a rule to "make a read work" without
 * checking who is allowed to see that data.
 *
 * Installed firebase is 12.19.0 (current). Version table: docs/VERIFIED_STACK.md
 * section 3.
 */

const app = initializeApp(firebaseConfig);

/**
 * Firestore is initialised with a persistent local cache so reads still resolve
 * while the network is unavailable.
 *
 * Without this, every read went straight to the server: any brief connectivity
 * problem made a document unreadable ("the client is offline"), which surfaced
 * as an attendance register that refused to load its figures even though the
 * device already had them. Writes are still queued and sent on reconnect.
 */
function createFirestore() {
  try {
    return initializeFirestore(
      app,
      {
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager(),
        }),
      },
      firebaseConfig.firestoreDatabaseId
    );
  } catch (error) {
    // initializeFirestore throws if the instance was already created, and
    // persistence can be refused (private browsing, storage pressure). Either
    // way the app must still run, just without an offline cache.
    console.warn('Firestore local cache unavailable, continuing without it:', error);
    return getFirestore(app, firebaseConfig.firestoreDatabaseId);
  }
}

export const db = createFirestore();
export const auth = getAuth(app);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && (error.message.includes('the client is offline') || error.message.includes('Could not reach Cloud Firestore backend'))) {
      console.warn("Please check your Firebase configuration or internet connection.");
    }
  }
}
testConnection();

// `loginWithGoogle`/`googleSignIn`/`getAccessToken`/`logout` are deliberately
// NOT re-exported from here.
//
// Re-exporting them made this module import ./googleAuth, while googleAuth
// imports `auth` from here - a cycle. Module evaluation order then decides
// whether that is harmless or fatal, and it was fatal: the bundler built
// googleAuth's namespace object (which re-exported `auth`) before this file
// had reached `export const auth`, so the production build died at startup
// with "Cannot access 'auth' before initialization" and rendered a blank
// page. Vite's dev server ordered the modules differently and hid it.
//
// Consumers import those helpers straight from ./googleAuth instead, which
// leaves this module a leaf that nothing imports back.


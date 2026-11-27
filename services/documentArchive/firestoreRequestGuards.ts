/**
 * Serverless request guards for Firestore-backed document stores (C6).
 *
 * One middleware covers both halves of the durability contract for EVERY
 * route that documentsRoutes.ts mounts in Firestore mode, so individual
 * handlers need no per-endpoint changes:
 *   1. hydrate — await hydrateDocumentStores() so the instance sees shared
 *      state (jobs created on OTHER Lambda instances included) before any
 *      handler reads a store.
 *   2. commit — wrap res.json so commitDocumentStoreWrites() completes every
 *      pending write-through BEFORE the response flushes (the Lambda freezes
 *      right after the response).
 *
 * In non-Firestore modes (local server.ts, unit tests without credentials)
 * both halves are no-ops and the middleware passes straight through.
 */
import type { RequestHandler } from 'express';
import { hydrateDocumentStores, isFirestoreStoreActive, commitDocumentStoreWrites } from './firestoreStore.js';

export const documentStoreRequestGuards: RequestHandler = (req, res, next) => {
  if (!isFirestoreStoreActive()) {
    next();
    return;
  }
  const originalJson = res.json.bind(res);
  (res as any).json = async (body: unknown) => {
    if (!res.headersSent) {
      try {
        await hydrateDocumentStores();
        await commitDocumentStoreWrites();
      } catch (err) {
        // Durability must never block an honest response; a failure here is
        // already reported by the per-write error logging in _dispatchTrackedDelta.
        console.error('[documentArchiveFirestore] commit-before-response failed:', (err as Error)?.message);
      }
    }
    return originalJson(body);
  };
  hydrateDocumentStores()
    .then(() => next())
    .catch((err) => {
      console.error('[documentArchiveFirestore] hydrate failed:', (err as Error)?.message);
      next();
    });
};

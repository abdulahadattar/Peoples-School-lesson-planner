import type { StorageAdapter } from './types';
import { createInMemoryAdapter } from './inMemoryAdapter';

/**
 * Chooses the storage implementation.
 *
 * The Firestore + Cloud Storage backend is the target, but it is not built yet
 * and cannot be verified without a service-account credential. Rather than
 * shipping a backend that silently degrades, the factory names what is missing
 * so an unconfigured deployment is loud instead of writing to a directory that
 * disappears on the next cold start.
 */

export type StorageBackend = 'in-memory' | 'firestore';

function resolveRequestedBackend(): StorageBackend {
  const raw = (process.env.DOCUMENT_STORAGE_BACKEND || '').trim().toLowerCase();
  if (!raw || raw === 'in-memory' || raw === 'memory') return 'in-memory';
  if (raw === 'firestore' || raw === 'gcs' || raw === 'cloud-storage') return 'firestore';
  throw new Error(
    `Unknown DOCUMENT_STORAGE_BACKEND "${raw}". Use "in-memory" or "firestore".`
  );
}

/**
 * Build the adapter for the configured backend.
 *
 * Note the deliberate absence of a silent fallback to `in-memory` when
 * `firestore` is requested but unconfigured. The current failure mode of this
 * app is data that appears to save and then vanishes, so degrading quietly is
 * the one behaviour to avoid.
 */
export function createStorageAdapter(): StorageAdapter {
  const requested = resolveRequestedBackend();

  if (requested === 'firestore') {
    // Intentionally throws until C2/C3 land. Keep the message specific: it is
    // the first thing anyone will see when they point the env var at a
    // deployment that has no credential wired up.
    throw new Error(
      'DOCUMENT_STORAGE_BACKEND="firestore" is not implemented yet. ' +
        'Set FIREBASE_SERVICE_ACCOUNT (or GOOGLE_APPLICATION_CREDENTIALS) and ' +
        'implement services/storage/firestoreAdapter.ts, or unset ' +
        'DOCUMENT_STORAGE_BACKEND to use the in-memory store. ' +
        'See docs/ALPHA_STATUS.md section 3, task C2/C3.'
    );
  }

  return createInMemoryAdapter();
}

export { createInMemoryAdapter, InMemoryBlobStore, InMemoryMetadataStore } from './inMemoryAdapter';
export type * from './types';

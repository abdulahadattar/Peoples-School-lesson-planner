import type { BlobKey, BlobStore, MetadataCollection, MetadataMap, MetadataStore, StorageAdapter } from './types';

/**
 * In-memory implementation of the storage interfaces.
 *
 * Used by the adapter tests and by local development, and it is the reference
 * the Firestore/Cloud Storage implementation has to match. Two properties are
 * load-bearing and are covered by scripts/test-storage-adapter.mjs:
 *
 * 1. Reads never hand back a live reference to stored state. Callers mutate
 *    what they get (the pipeline edits records in place before saving), so
 *    aliasing would let an unsaved edit leak into "persisted" data and make
 *    the suite pass while hiding real bugs.
 * 2. Blobs are copied in and out, so a caller holding a Buffer cannot mutate
 *    stored bytes after the fact.
 */

/** Deep copy for JSON-shaped metadata. Keeps stored state unreachable. */
function cloneMeta<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value);
    } catch {
      // Falls through: a value structuredClone rejects (functions, symbols) is
      // not valid metadata anyway, and JSON round-tripping is the honest answer.
    }
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function cloneBytes(data: Buffer): Buffer {
  return Buffer.from(data);
}

export class InMemoryMetadataStore implements MetadataStore {
  private collections = new Map<MetadataCollection, MetadataMap>();

  private bucket(collection: MetadataCollection): MetadataMap {
    let existing = this.collections.get(collection);
    if (!existing) {
      existing = {};
      this.collections.set(collection, existing);
    }
    return existing;
  }

  async get<T = unknown>(collection: MetadataCollection): Promise<Record<string, T>> {
    const source = this.collections.get(collection);
    if (!source) return {};
    // Cloned per key: shallow-copying the outer object would still let a caller
    // reach the nested record objects.
    const out: Record<string, T> = {};
    for (const [id, record] of Object.entries(source)) {
      out[id] = cloneMeta(record as T);
    }
    return out;
  }

  async set<T = unknown>(collection: MetadataCollection, map: Record<string, T>): Promise<void> {
    const next: MetadataMap = {};
    for (const [id, record] of Object.entries(map)) {
      next[id] = cloneMeta(record);
    }
    this.collections.set(collection, next);
  }

  async merge<T = unknown>(collection: MetadataCollection, map: Record<string, T>): Promise<void> {
    const target = this.bucket(collection);
    for (const [id, record] of Object.entries(map)) {
      target[id] = cloneMeta(record);
    }
  }

  async remove(collection: MetadataCollection, id: string): Promise<void> {
    const bucket = this.collections.get(collection);
    if (bucket) delete bucket[id];
  }

  async clear(collection: MetadataCollection): Promise<void> {
    this.collections.set(collection, {});
  }
}

export class InMemoryBlobStore implements BlobStore {
  /** grNo -> filename -> bytes */
  private objects = new Map<string, Map<string, Buffer>>();

  private folder(grNo: string): Map<string, Buffer> {
    let existing = this.objects.get(grNo);
    if (!existing) {
      existing = new Map();
      this.objects.set(grNo, existing);
    }
    return existing;
  }

  async put(key: BlobKey, data: Buffer): Promise<void> {
    this.folder(key.grNo).set(key.filename, cloneBytes(data));
  }

  async get(key: BlobKey): Promise<Buffer | null> {
    const found = this.objects.get(key.grNo)?.get(key.filename);
    return found ? cloneBytes(found) : null;
  }

  async exists(key: BlobKey): Promise<boolean> {
    return this.objects.get(key.grNo)?.has(key.filename) ?? false;
  }

  async list(grNo: string): Promise<string[]> {
    const folder = this.objects.get(grNo);
    return folder ? Array.from(folder.keys()) : [];
  }

  async remove(key: BlobKey): Promise<void> {
    const folder = this.objects.get(key.grNo);
    if (!folder) return;
    folder.delete(key.filename);
    // Drop the empty folder so `list` on a cleared student matches the
    // on-disk behaviour, where an emptied GR_ directory is removed.
    if (folder.size === 0) this.objects.delete(key.grNo);
  }

  async moveGr(fromGr: string, toGr: string): Promise<void> {
    const source = this.objects.get(fromGr);
    if (!source || source.size === 0) {
      this.objects.delete(fromGr);
      return;
    }
    // Mirrors the recursive copy-then-delete of the folder move: the
    // destination is replaced wholesale rather than merged, so a stale file
    // under the target GR cannot survive a reassignment.
    const destination = new Map<string, Buffer>();
    for (const [name, bytes] of source) {
      destination.set(name, cloneBytes(bytes));
    }
    this.objects.set(toGr, destination);
    this.objects.delete(fromGr);
  }
}

export function createInMemoryAdapter(): StorageAdapter {
  return {
    backend: 'in-memory',
    metadata: new InMemoryMetadataStore(),
    blob: new InMemoryBlobStore(),
  };
}

export default createInMemoryAdapter;

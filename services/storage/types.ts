/**
 * Durable storage abstractions for the document pipeline.
 *
 * WHY THIS EXISTS
 * ---------------
 * `documentArchiveService.ts` persists everything to the local filesystem:
 * metadata as JSON under `process.cwd()/data/*.json`, and the original PDF /
 * image bytes in per-student folders under
 * `process.cwd()/data/student_documents/GR_<grNo>/`. `api/index.ts` uses
 * `/tmp/data` instead. Both locations are volatile: a Vercel serverless
 * instance discards them on cold start, so uploaded documents and the results
 * of extracting them disappear.
 *
 * The interface below is the seam. Today the only implementation is
 * in-memory (tests and local development); the Firestore + Cloud Storage
 * implementation will sit behind the same two interfaces, so the pipeline does
 * not change when the backend does.
 *
 * The granularity deliberately mirrors today's granularity. Each JSON file is
 * loaded whole and saved whole, so a collection is the unit of read and write
 * rather than an individual row. Switching to per-document writes would be a
 * real improvement, but it is a separate change and pretending otherwise here
 * would hide a per-request cost that does not exist today.
 */

/** Metadata collections currently backed by one JSON file each. */
export type MetadataCollection =
  | 'jobs'                 // data/document_jobs.json
  | 'dossiers'             // data/student_dossiers.json
  | 'documents'            // data/student_documents_meta.json
  | 'bundles'              // data/document_bundles.json
  | 'dismissedFlags'       // data/dismissed_flags.json
  | 'appliedCorrections';  // data/applied_corrections.json

/**
 * A whole collection, keyed by record id.
 *
 * The pipeline stores `Record<string, T>` in memory and writes it out in one
 * go, so that is the unit the adapter speaks. `T` is left to the caller rather
 * than hard-coded here: the records are declared in
 * `types/documentArchive.ts` and the adapter has no business knowing them.
 */
export type MetadataMap = Record<string, unknown>;

/**
 * Reads and writes the JSON-shaped metadata collections.
 *
 * Every method is async on purpose. The in-memory implementation resolves
 * immediately, but Firestore cannot, and a sync-looking API over a network
 * call is how a local development path quietly diverges from production.
 */
export interface MetadataStore {
  /** All records in a collection. An absent collection reads as `{}`. */
  get<T = unknown>(collection: MetadataCollection): Promise<Record<string, T>>;

  /** Replace the whole collection. */
  set<T = unknown>(collection: MetadataCollection, map: Record<string, T>): Promise<void>;

  /** Merge a partial set of records into a collection. */
  merge<T = unknown>(collection: MetadataCollection, map: Record<string, T>): Promise<void>;

  /** Remove one record. Missing ids are not an error. */
  remove(collection: MetadataCollection, id: string): Promise<void>;

  /** Remove everything in a collection. */
  clear(collection: MetadataCollection): Promise<void>;
}

/** Identifies one stored binary object. `grNo` scopes the listing. */
export interface BlobKey {
  grNo: string;
  filename: string;
}

/**
 * Reads and writes the original document bytes.
 *
 * `list` is scoped to a single `grNo` because every caller of the on-disk
 * layout works one student at a time: they copy a folder on reassignment and
 * enumerate one folder to build an export.
 */
export interface BlobStore {
  put(key: BlobKey, data: Buffer): Promise<void>;

  /** Full contents, or `null` when the object is absent. */
  get(key: BlobKey): Promise<Buffer | null>;

  /**
   * Whether the object exists.
   *
   * Separate from `get` so a caller can probe cheaply. On Cloud Storage this is
   * a metadata request; fetching megabytes of PDF just to test existence would
   * be wasteful, and the pipeline does this per file while building a dossier.
   */
  exists(key: BlobKey): Promise<boolean>;

  /** Filenames stored under one `grNo`, unsorted. */
  list(grNo: string): Promise<string[]>;

  remove(key: BlobKey): Promise<void>;

  /**
   * Move every object from one student to another, replacing the target.
   *
   * Present because reassignment appears repeatedly in the pipeline
   * (`GR_<old>` to `GR_<new>` folder copies). The on-disk version is a
   * recursive directory copy followed by a delete, so a backend can implement
   * it as a server-side move, but it must behave the same way: the destination
   * ends up holding exactly the source's objects, and the source is gone.
   */
  moveGr(fromGr: string, toGr: string): Promise<void>;
}

/** Which adapter half a component needs. */
export type StorageKind = 'metadata' | 'blob';

/**
 * The paired stores plus the identifying detail.
 *
 * `backend` is carried so the API layer can report which storage is live, and
 * so an unconfigured deployment fails with a message naming the missing
 * credential rather than writing to a place that evaporates.
 */
export interface StorageAdapter {
  /** e.g. `in-memory`, `firestore+cloud-storage`. */
  readonly backend: string;
  readonly metadata: MetadataStore;
  readonly blob: BlobStore;
}

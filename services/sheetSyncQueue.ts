/**
 * Pending Google Sheets sync queue.
 *
 * The Google Sheets access token is a one-hour credential with no refresh path,
 * so tying a write to it made register and attendance saves fail on a schedule
 * the user could not see. Edits are now applied locally first (Firestore and the
 * device cache) and queued here; the teacher presses Sync when they want them
 * pushed to the sheet, and the app pushes automatically once Google is
 * reconnected.
 *
 * Storage is localStorage so the queue survives a reload without adding a
 * dependency. Each entry is small: a target, the rows to write, and the date it
 * belongs to.
 */

export type SyncTarget = 'attendance' | 'records';

export interface PendingSyncEntry {
  id: string;
  target: SyncTarget;
  /** YYYY-MM-DD for attendance; the register row number for student records. */
  scope: string;
  label: string;
  payload: unknown;
  queuedAt: number;
  attempts: number;
  lastError?: string;
}

const STORAGE_KEY = 'phssj_pending_sheet_sync_v1';
const MAX_ENTRIES = 200;

function read(): PendingSyncEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(entries: PendingSyncEntry[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
  } catch (err) {
    console.warn('Could not persist the pending sync queue', err);
  }
}

/** Adds a change to the queue, replacing any earlier entry for the same scope. */
export function queueSheetSync(entry: Omit<PendingSyncEntry, 'id' | 'queuedAt' | 'attempts'>): PendingSyncEntry {
  const entries = read();
  const next: PendingSyncEntry = {
    ...entry,
    id: `${entry.target}-${entry.scope}-${Date.now()}`,
    queuedAt: Date.now(),
    attempts: 0,
  };
  // One outstanding change per target+scope: re-editing a date should supersede
  // the queued write, not stack up copies of the same roster.
  const filtered = entries.filter((e) => !(e.target === entry.target && e.scope === entry.scope));
  write([next, ...filtered]);
  notify();
  return next;
}

export function listPendingSync(): PendingSyncEntry[] {
  return read().sort((a, b) => b.queuedAt - a.queuedAt);
}

export function pendingSyncCount(): number {
  return read().length;
}

export function pendingScopes(target: SyncTarget): string[] {
  return read().filter((e) => e.target === target).map((e) => e.scope);
}

export function clearPendingSync(id: string) {
  write(read().filter((e) => e.id !== id));
  notify();
}

export function clearAllPendingSync() {
  write([]);
  notify();
}

export function markSyncAttempt(id: string, error?: string) {
  const entries = read();
  const idx = entries.findIndex((e) => e.id === id);
  if (idx === -1) return;
  entries[idx] = { ...entries[idx], attempts: entries[idx].attempts + 1, lastError: error };
  write(entries);
  notify();
}

// --- change notification so the header badge updates without polling ---
const listeners = new Set<() => void>();

export function subscribeSyncQueue(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      /* a bad listener must not break saving */
    }
  });
}

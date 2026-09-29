import type { StudentRecord } from './googleSheetsService';

/**
 * Local overlay for register edits that have not reached Google Sheets yet.
 *
 * The register is read from the Sheets API, so a save that only reached the
 * device would disappear on the next reload. The overlay keeps unsynced edits
 * on top of whatever the sheet returns, which is what makes a local-first save
 * honest: the teacher sees their change immediately, it survives a reload, and
 * it disappears from the overlay only once the sheet confirms the write.
 */

const STORAGE_KEY = 'phssj_local_record_overlay_v1';

type OverlayMap = Record<string, StudentRecord>;

function read(): OverlayMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as OverlayMap) : {};
  } catch {
    return {};
  }
}

function write(map: OverlayMap) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch (err) {
    console.warn('Could not persist the local register overlay', err);
  }
  notify();
}

const listeners = new Set<() => void>();

export function subscribeLocalOverlay(fn: () => void): () => void {
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

function keyOf(rowNumber: number): string {
  return String(rowNumber);
}

/** Records the edit locally and returns the stored copy. */
export function saveLocalRecord(record: StudentRecord): StudentRecord {
  const map = read();
  map[keyOf(record.rowNumber)] = { ...record };
  write(map);
  return map[keyOf(record.rowNumber)];
}

export function clearLocalRecord(rowNumber: number) {
  const map = read();
  delete map[keyOf(rowNumber)];
  write(map);
}

export function getLocalOverlay(): OverlayMap {
  return read();
}

export function localOverlayCount(): number {
  return Object.keys(read()).length;
}

export function hasLocalRecord(rowNumber: number): boolean {
  return keyOf(rowNumber) in read();
}

/**
 * Overlays unsynced edits onto sheet records. A row that exists only locally
 * (an unsynced new student) is appended so the teacher can still see it.
 */
export function applyLocalOverlay(records: StudentRecord[]): StudentRecord[] {
  const map = read();
  const keys = Object.keys(map);
  if (!keys.length) return records;

  const byRow = new Map<number, StudentRecord>();
  records.forEach((r) => byRow.set(r.rowNumber, r));

  keys.forEach((k) => {
    const local = map[k];
    if (!local) return;
    const existing = byRow.get(local.rowNumber);
    // Keep the sheet's identity columns but take the locally edited values, so
    // a row that the sheet has not seen yet still renders.
    byRow.set(local.rowNumber, existing ? { ...existing, ...local } : local);
  });

  return Array.from(byRow.values()).sort((a, b) => a.rowNumber - b.rowNumber);
}

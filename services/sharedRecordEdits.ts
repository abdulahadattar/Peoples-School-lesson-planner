/**
 * Shared (cross-teacher, cross-device) store for student-record edits that have
 * not reached Google Sheets yet.
 *
 * The local overlay in `localRecordsOverlay.ts` keeps an unsynced edit on the
 * device that made it. That is enough for one teacher on one phone, but it is
 * invisible everywhere else: a second teacher opening the register sees the old
 * sheet value, and the first teacher loses the edit entirely if the browser
 * clears storage. This module puts the same edit in Firestore so any signed-in
 * teacher, on any device, can see it - and so it survives until someone presses
 * Sync to Sheet.
 *
 * Design notes:
 *  - The document id is the **sheet row number**. Two teachers editing the same
 *    student therefore write the same document and converge, instead of creating
 *    two competing edits that would both be pushed.
 *  - The full record is stored, not a diff, because the reader may not have the
 *    sheet row loaded yet and must be able to render the pending value.
 *  - Nothing here ever throws. A failed mirror must not fail the teacher's save:
 *    the local overlay is still correct, and the local queue still holds the
 *    change for pushing. Every failure is reported through `onMirrorError`.
 */
import {
  collection,
  doc,
  setDoc,
  getDocs,
  deleteDoc,
  onSnapshot,
  runTransaction,
  updateDoc,
  waitForPendingWrites,
} from 'firebase/firestore';
import { db, auth } from './firebase';
import { SHEET_OWNED_IDENTITY } from './localRecordsOverlay';
import type { StudentRecord } from './googleSheetsService';

export const SHARED_EDITS_COLLECTION = 'student_record_edits';

export interface SharedRecordEdit {
  /**
   * Firestore document id.
   *
   * For an edit this is the sheet row number (digits, which satisfy the rules'
   * `isValidId()`). For a NEW student it is `add-<random>`, because no row
   * exists yet. Keying adds by a constant would make every pending add overwrite
   * the previous one, silently losing all but the last.
   */
  docId: string;
  /** Sheet row this edit targets. Negative for a pending add (see below). */
  rowNumber: number;
  /** The edited record, stored whole so a reader can render it standalone. */
  record: StudentRecord;
  kind: 'update' | 'add';
  /** Epoch ms, so ordering is comparable without Firestore Timestamp objects. */
  updatedAt: number;
  updatedBy: string;
  updatedByName: string;
  updatedByEmail: string;
  /**
   * Set once the sheet has accepted this edit, BEFORE the document is removed.
   *
   * This is the idempotency marker. Without it, a cleanup failure left the
   * document in place and the next Sync appended the new student a second time,
   * creating a duplicate in the register - silently, with the banner reporting
   * success. With it, a retry skips the write and only retries the delete.
   */
  syncedAt?: number;
}

/** Reported to the UI so a mirror failure can be surfaced instead of swallowed. */
export type MirrorErrorHandler = (message: string, error: unknown) => void;

let onMirrorError: MirrorErrorHandler | null = null;

export function setMirrorErrorHandler(fn: MirrorErrorHandler | null) {
  onMirrorError = fn;
}

function report(message: string, error: unknown) {
  console.warn(`[sharedRecordEdits] ${message}`, error);
  try {
    onMirrorError?.(message, error);
  } catch {
    /* a broken reporter must not break the save path */
  }
}

/** Row numbers are digits-only, which satisfies the rules' `isValidId()`. */
function rowDocId(rowNumber: number): string {
  return String(rowNumber);
}

const ADD_ID_PREFIX = 'add-';

/**
 * Document id for a pending add, derived from the student's GR number.
 *
 * Keying adds on something stable about the STUDENT - not on a random suffix -
 * is what stops one new student accumulating several pending documents: the
 * teacher edits the pending add, the modal carries the record's row through, and
 * a random id would mint a second document for the same person, which Sync would
 * then append twice.
 *
 * Returns null when there is no usable GR number, and the caller falls back to a
 * random id. The result must satisfy the rules' `isValidId()` -
 * `^[a-zA-Z0-9_-]+$`, max 128 chars - hence the sanitising and the length cap.
 */
function addDocIdFor(grNo: string | undefined): string | null {
  const cleaned = (grNo || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
  return cleaned ? `${ADD_ID_PREFIX}${cleaned}` : null;
}

function randomSuffix(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID().slice(0, 8);
  return Math.random().toString(36).slice(2, 10);
}

/**
 * A row number for a student that has no sheet row yet.
 *
 * Derived from the document id rather than from a counter. A module-level counter
 * resets on every page load and is per-device, so two pending adds could land on
 * the same row and overwrite each other in the merged view. Hashing the id is
 * deterministic - every device renders the same pending student in the same
 * place - and always negative, so it can never be mistaken for a real sheet row
 * or reach an A1 range.
 */
function syntheticRowNumber(docId: string): number {
  let hash = 0;
  for (let i = 0; i < docId.length; i++) {
    hash = (hash * 31 + docId.charCodeAt(i)) | 0;
  }
  return -(Math.abs(hash) % 1000000000) - 1;
}

/** True when this edit is a new student rather than a change to an existing row. */
export function isPendingAdd(edit: SharedRecordEdit): boolean {
  return edit.docId.startsWith(ADD_ID_PREFIX) || edit.rowNumber <= 0;
}

function currentAuthor() {
  const user = auth.currentUser;
  return {
    updatedBy: user?.uid || '',
    updatedByName: user?.displayName || user?.email || 'Unknown teacher',
    updatedByEmail: (user?.email || '').toLowerCase(),
  };
}

/**
 * Publishes an edit so other teachers and other devices can see it.
 * Returns true when the mirror was written. A false return is NOT a failure of
 * the teacher's save - the local overlay and queue are unaffected.
 */
export async function publishSharedEdit(
  record: StudentRecord,
  kind: 'update' | 'add' = 'update',
): Promise<boolean> {
  if (!auth.currentUser) {
    // Signed-out teachers keep working locally; there is simply no shared copy.
    return false;
  }
  try {
    // A record with no usable row IS a new student, whatever the caller said:
    // `StudentEditModal` builds adds with `rowNumber: 0`. Treating that as an
    // update produced two bugs at once - every add collided on one document, and
    // the writer built the illegal A1 range `R0:AO0`, which fails the request.
    const isAdd = kind === 'add' || !(record.rowNumber > 0);
    const docId = isAdd
      ? addDocIdFor(record.grNo) || `${ADD_ID_PREFIX}${randomSuffix()}`
      : rowDocId(record.rowNumber);
    const rowNumber = isAdd ? syntheticRowNumber(docId) : record.rowNumber;
    const payload: SharedRecordEdit = {
      docId,
      rowNumber,
      record: { ...record, rowNumber },
      kind: isAdd ? 'add' : 'update',
      updatedAt: Date.now(),
      ...currentAuthor(),
    };
    await setDoc(doc(db, SHARED_EDITS_COLLECTION, payload.docId), payload);
    // `setDoc` resolves from the local cache when offline (services/firebase.ts
    // enables `persistentLocalCache`), so returning here would tell the teacher
    // "everyone can see it now" while the write is still queued on this device.
    //
    // Bounded, because offline that acknowledgement never arrives and an
    // unbounded await left the confirm dialog stuck on "Saving..." forever.
    //
    // A timeout still counts as SAVED. `setDoc` resolved from the local cache, so
    // the edit really is stored and Firestore will deliver it on reconnect.
    // Reporting "nothing was saved" would be a lie, and inviting a retry would
    // mint a SECOND pending add for the same student - the very duplication the
    // idempotency marker exists to prevent.
    let acknowledged = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        waitForPendingWrites(db).then(() => {
          acknowledged = true;
        }),
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, 10000);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
    if (!acknowledged) {
      report(
        'Saved on this device, but the shared store has not confirmed it yet. Other teachers may see this a moment from now.',
        null
      );
    }
    return true;
  } catch (error) {
    report(
      `Could not share the edit for ${record.studentName || `row ${record.rowNumber}`}. Nothing was stored, so the change was not saved.`,
      error,
    );
    return false;
  }
}

function toEdit(id: string, data: Record<string, unknown>): SharedRecordEdit | null {
  const record = data?.record as StudentRecord | undefined;
  if (!record) return null;
  const rowNumber = Number((data.rowNumber as number) ?? id);
  if (!Number.isFinite(rowNumber)) return null;
  return {
    docId: id,
    rowNumber,
    record: { ...record, rowNumber },
    kind: (data.kind as 'update' | 'add') || 'update',
    updatedAt: Number(data.updatedAt) || 0,
    updatedBy: String(data.updatedBy || ''),
    updatedByName: String(data.updatedByName || 'Unknown teacher'),
    updatedByEmail: String(data.updatedByEmail || ''),
    syncedAt: Number(data.syncedAt) || 0,
  };
}

/**
 * Records that the sheet accepted this edit, before the document is deleted.
 *
 * Ordering matters: marking first means a crash between the two leaves a
 * document that knows it was already written, so the next Sync cannot append a
 * second copy of a new student.
 *
 * Uses `updateDoc`, not `setDoc(..., {merge:true})`. A merge write CREATES the
 * document if it is missing, which would resurrect a `{syncedAt}`-only zombie
 * after the delete had already succeeded. `updateDoc` fails instead, which is
 * the honest outcome for a document that is already gone.
 *
 * Returns whether the marker was written. The caller must not treat a failed
 * marker as a successful cleanup: without it the next Sync would append again.
 */
export async function markSharedEditSynced(
  docId: string,
  syncedAt: number = Date.now(),
): Promise<boolean> {
  try {
    await updateDoc(doc(db, SHARED_EDITS_COLLECTION, docId), { syncedAt });
    return true;
  } catch (error) {
    report(
      `Could not record that ${docId} reached the sheet. The change may be written twice if it is synced again.`,
      error
    );
    return false;
  }
}

/**
 * Reads every pending shared edit.
 *
 * `reachable` is reported separately because `getDocs` resolves with an EMPTY
 * snapshot - it does not throw - whenever the client cannot reach Firestore.
 * Treating that as "no pending edits" would silently hide other teachers' work,
 * so callers are told which case they are in.
 */
export async function listSharedEdits(): Promise<{
  edits: SharedRecordEdit[];
  reachable: boolean;
}> {
  try {
    const snapshot = await getDocs(collection(db, SHARED_EDITS_COLLECTION));
    const edits: SharedRecordEdit[] = [];
    snapshot.forEach((d) => {
      const edit = toEdit(d.id, d.data() as Record<string, unknown>);
      if (edit) edits.push(edit);
    });
    edits.sort((a, b) => a.rowNumber - b.rowNumber);
    // An empty snapshot while offline is indistinguishable from a genuinely
    // empty collection here; `metadata.fromCache` is the only honest signal.
    return { edits, reachable: !snapshot.metadata.fromCache };
  } catch (error) {
    report('Could not read shared edits from Firestore.', error);
    return { edits: [], reachable: false };
  }
}

/**
 * Drops one shared edit, e.g. once its row has reached the sheet.
 *
 * `expectedUpdatedAt` makes the delete safe against a concurrent re-edit. The sync
 * reads the pending set, writes to the sheet, and only then deletes - and in
 * between, the same row may be edited again (by this teacher or another). A plain
 * delete would destroy that newer edit even though the sheet never received it.
 * Inside a transaction the check and the delete are atomic, so a mismatch leaves
 * the newer edit in place.
 */
export async function removeSharedEdit(
  docId: string,
  expectedUpdatedAt?: number,
): Promise<boolean> {
  const ref = doc(db, SHARED_EDITS_COLLECTION, docId);
  try {
    if (expectedUpdatedAt === undefined) {
      await deleteDoc(ref);
      return true;
    }
    return await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) return true; // already gone
      const current = snap.data() as SharedRecordEdit | undefined;
      if (!current || Number(current.updatedAt || 0) !== expectedUpdatedAt) {
        return false; // edited again since the sheet read - keep the newer edit
      }
      tx.delete(ref);
      return true;
    });
  } catch (error) {
    report(`Could not clear the shared edit ${docId}.`, error);
    return false;
  }
}

/** Drops several shared edits, keeping any that were re-edited in the meantime. */
export async function removeSharedEdits(
  edits: { docId: string; updatedAt: number }[],
): Promise<number> {
  let removed = 0;
  for (const edit of edits) {
    if (await removeSharedEdit(edit.docId, edit.updatedAt)) removed++;
  }
  return removed;
}

/**
 * Live view of other teachers' pending edits. Fires on any device that changes
 * the collection, which is what makes an edit made elsewhere appear here without
 * a reload.
 */
export function subscribeSharedEdits(
  onChange: (edits: SharedRecordEdit[]) => void,
): () => void {
  try {
    return onSnapshot(
      collection(db, SHARED_EDITS_COLLECTION),
      (snapshot) => {
        const edits: SharedRecordEdit[] = [];
        snapshot.forEach((d) => {
          const edit = toEdit(d.id, d.data() as Record<string, unknown>);
          if (edit) edits.push(edit);
        });
        edits.sort((a, b) => a.rowNumber - b.rowNumber);
        onChange(edits);
      },
      (error) => {
        report('Live connection to shared edits failed; falling back to the sheet.', error);
        onChange([]);
      },
    );
  } catch (error) {
    report('Could not subscribe to shared edits.', error);
    return () => {};
  }
}

/**
 * Layers shared edits over the sheet's records.
 *
 * Precedence is sheet < shared < caller's own local overlay, so the teacher
 * looking at the screen always sees their own unsynced change, but they still see
 * everyone else's. Identity columns stay sheet-owned for the same reason as in
 * `localRecordsOverlay`: a stale pending copy must not move a student between
 * classes or rewrite their GR number.
 */
export function applySharedEdits(
  records: StudentRecord[],
  edits: SharedRecordEdit[],
): StudentRecord[] {
  if (!edits.length) return records;

  // Keyed by identity, not by row number. An update's identity is its sheet row; a
  // pending add's identity is its document, because it has no row yet. Keying both
  // by rowNumber meant two pending adds sharing a synthetic row silently overwrote
  // one another in the merged table.
  const keyOf_ = (rowNumber: number) => `row:${rowNumber}`;
  const byKey = new Map<string, StudentRecord>();
  records.forEach((r) => byKey.set(keyOf_(r.rowNumber), r));

  for (const edit of edits) {
    const key = isPendingAdd(edit) ? `add:${edit.docId}` : keyOf_(edit.rowNumber);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, edit.record);
      continue;
    }
    // Take the teacher's edit, then restore the sheet's identity columns.
    const merged: StudentRecord = { ...existing, ...edit.record };
    for (const col of SHEET_OWNED_IDENTITY) merged[col] = existing[col];
    byKey.set(key, merged);
  }

  return Array.from(byKey.values()).sort((a, b) => a.rowNumber - b.rowNumber);
}


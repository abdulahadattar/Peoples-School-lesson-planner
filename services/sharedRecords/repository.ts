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
import { db, auth } from '../firebase';
import type { StudentRecord } from '../googleSheetsService';
import {
  SHARED_EDITS_COLLECTION,
  SharedRecordEdit,
  report,
  rowDocId,
  addDocIdFor,
  randomSuffix,
  syntheticRowNumber,
  currentAuthor,
  toEdit,
  ADD_ID_PREFIX,
} from './types';

export async function publishSharedEdit(
  record: StudentRecord,
  kind: 'update' | 'add' = 'update'
): Promise<boolean> {
  if (!auth.currentUser) {
    return false;
  }
  try {
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
      error
    );
    return false;
  }
}

export async function markSharedEditSynced(
  docId: string,
  syncedAt: number = Date.now()
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
    return { edits, reachable: !snapshot.metadata.fromCache };
  } catch (error) {
    report('Could not read shared edits from Firestore.', error);
    return { edits: [], reachable: false };
  }
}

export async function removeSharedEdit(
  docId: string,
  expectedUpdatedAt?: number
): Promise<boolean> {
  const ref = doc(db, SHARED_EDITS_COLLECTION, docId);
  try {
    if (expectedUpdatedAt === undefined) {
      await deleteDoc(ref);
      return true;
    }
    return await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) return true;
      const current = snap.data() as SharedRecordEdit | undefined;
      if (!current || Number(current.updatedAt || 0) !== expectedUpdatedAt) {
        return false;
      }
      tx.delete(ref);
      return true;
    });
  } catch (error) {
    report(`Could not clear the shared edit ${docId}.`, error);
    return false;
  }
}

export async function removeSharedEdits(
  edits: { docId: string; updatedAt: number }[]
): Promise<number> {
  let removed = 0;
  for (const edit of edits) {
    if (await removeSharedEdit(edit.docId, edit.updatedAt)) removed++;
  }
  return removed;
}

export function subscribeSharedEdits(
  onChange: (edits: SharedRecordEdit[]) => void
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
      }
    );
  } catch (error) {
    report('Could not subscribe to shared edits.', error);
    return () => {};
  }
}

import { collection, doc, onSnapshot, setDoc, writeBatch } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import {
  type MarksheetPendingEdit,
  sanitizeFieldAuthors,
  sanitizeScoreMap,
} from './pendingEditsHelpers';

export {
  type MarksheetPendingEdit,
  type MarksheetPendingFieldAuthor,
  applyPendingEditsToEntries,
  combinePendingEditLists,
  loadLocalPendingEdits,
  makePendingEditDocId,
  mergePendingEditDelta,
  removeLocalPendingEdits,
  saveLocalPendingEdits,
  upsertLocalPendingEdit,
} from './pendingEditsHelpers';

const MARKSHEET_PENDING_EDITS_COLLECTION = 'marksheet_pending_edits';

export async function saveMarksheetPendingEdit(
  edit: MarksheetPendingEdit
): Promise<MarksheetPendingEdit | null> {
  const user = auth.currentUser;
  if (!user) return null;

  const payload: MarksheetPendingEdit = {
    docId: edit.docId,
    grNo: edit.grNo.slice(0, 32),
    gradeLevel: edit.gradeLevel,
    examType: edit.examType,
    scores: sanitizeScoreMap(edit.scores),
    updatedAt: Math.floor(edit.updatedAt || Date.now()),
    updatedByUid: user.uid,
  };

  if (edit.studentName?.trim()) {
    payload.studentName = edit.studentName.trim().slice(0, 120);
  }
  if (edit.previousScores && Object.keys(edit.previousScores).length > 0) {
    payload.previousScores = sanitizeScoreMap(edit.previousScores);
  }
  const cleanAuthors = sanitizeFieldAuthors(edit.fieldAuthors);
  if (cleanAuthors) {
    payload.fieldAuthors = cleanAuthors;
  }
  if (edit.optionalLanguage === 'Sindhi' || edit.optionalLanguage === 'Urdu') {
    payload.optionalLanguage = edit.optionalLanguage;
  }
  if (
    edit.optionalElective === 'Biology' ||
    edit.optionalElective === 'ICT' ||
    edit.optionalElective === 'Mathematics'
  ) {
    payload.optionalElective = edit.optionalElective;
  }
  if (user.email) {
    payload.updatedByEmail = user.email.slice(0, 160);
  }
  if (user.displayName) {
    payload.updatedByName = user.displayName.slice(0, 120);
  }

  try {
    await setDoc(doc(db, MARKSHEET_PENDING_EDITS_COLLECTION, payload.docId), payload);
    return payload;
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.WRITE,
      `${MARKSHEET_PENDING_EDITS_COLLECTION}/${payload.docId}`
    );
    return null;
  }
}

export async function deleteMarksheetPendingEdits(docIds: string[]): Promise<void> {
  if (!docIds.length || !auth.currentUser) return;
  const batch = writeBatch(db);
  for (const id of docIds) {
    if (id) {
      batch.delete(doc(db, MARKSHEET_PENDING_EDITS_COLLECTION, id));
    }
  }
  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, MARKSHEET_PENDING_EDITS_COLLECTION);
  }
}

export function subscribeMarksheetPendingEdits(
  onChange: (edits: MarksheetPendingEdit[]) => void,
  onError?: (err: unknown) => void
): () => void {
  let snapshotUnsub: (() => void) | null = null;
  let disposed = false;

  const teardownSnapshot = () => {
    if (snapshotUnsub) {
      snapshotUnsub();
      snapshotUnsub = null;
    }
  };

  const attachSnapshot = () => {
    teardownSnapshot();
    snapshotUnsub = onSnapshot(
      collection(db, MARKSHEET_PENDING_EDITS_COLLECTION),
      (snap) => {
        const list: MarksheetPendingEdit[] = [];
        snap.forEach((d) => {
          const data = d.data() as MarksheetPendingEdit;
          if (data?.grNo && data?.examType) {
            list.push({ ...data, docId: data.docId || d.id });
          }
        });
        list.sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
        onChange(list);
      },
      (err) => {
        const code = String((err as any)?.code || '').toLowerCase();
        if (code === 'permission-denied') {
          onChange([]);
          return;
        }
        try {
          handleFirestoreError(err, OperationType.LIST, MARKSHEET_PENDING_EDITS_COLLECTION);
        } catch (wrapped) {
          onError?.(wrapped);
        }
      }
    );
  };

  const authUnsub = onAuthStateChanged(auth, (user) => {
    if (disposed) return;
    if (!user) {
      teardownSnapshot();
      onChange([]);
      return;
    }
    attachSnapshot();
  });

  return () => {
    disposed = true;
    teardownSnapshot();
    authUnsub();
  };
}

import { auth } from '../firebase';
import type { StudentRecord } from '../googleSheetsService';

export const SHARED_EDITS_COLLECTION = 'student_record_edits';

export interface SharedRecordEdit {
  docId: string;
  rowNumber: number;
  record: StudentRecord;
  kind: 'update' | 'add';
  updatedAt: number;
  updatedBy: string;
  updatedByName: string;
  updatedByEmail: string;
  syncedAt?: number;
}

export type MirrorErrorHandler = (message: string, error: unknown) => void;

let onMirrorError: MirrorErrorHandler | null = null;

export function setMirrorErrorHandler(fn: MirrorErrorHandler | null) {
  onMirrorError = fn;
}

export function report(message: string, error: unknown) {
  console.warn(`[sharedRecordEdits] ${message}`, error);
  try {
    onMirrorError?.(message, error);
  } catch {
    /* a broken reporter must not break the save path */
  }
}

export function rowDocId(rowNumber: number): string {
  return String(rowNumber);
}

export const ADD_ID_PREFIX = 'add-';

export function addDocIdFor(grNo: string | undefined): string | null {
  const cleaned = (grNo || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
  return cleaned ? `${ADD_ID_PREFIX}${cleaned}` : null;
}

export function randomSuffix(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID().slice(0, 8);
  return Math.random().toString(36).slice(2, 10);
}

export function syntheticRowNumber(docId: string): number {
  let hash = 0;
  for (let i = 0; i < docId.length; i++) {
    hash = (hash * 31 + docId.charCodeAt(i)) | 0;
  }
  return -(Math.abs(hash) % 1000000000) - 1;
}

export function isPendingAdd(edit: SharedRecordEdit): boolean {
  return edit.docId.startsWith(ADD_ID_PREFIX) || edit.rowNumber <= 0;
}

export function currentAuthor() {
  const user = auth.currentUser;
  return {
    updatedBy: user?.uid || '',
    updatedByName: user?.displayName || user?.email || 'Unknown teacher',
    updatedByEmail: (user?.email || '').toLowerCase(),
  };
}

export function toEdit(id: string, data: Record<string, unknown>): SharedRecordEdit | null {
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

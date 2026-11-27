import { SHEET_OWNED_IDENTITY } from '../localRecordsOverlay';
import type { StudentRecord } from '../googleSheetsService';
import { SharedRecordEdit, isPendingAdd } from './types';

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
  edits: SharedRecordEdit[]
): StudentRecord[] {
  if (!edits.length) return records;

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
    const merged: StudentRecord = { ...existing, ...edit.record };
    for (const col of SHEET_OWNED_IDENTITY) merged[col] = existing[col];
    byKey.set(key, merged);
  }

  return Array.from(byKey.values()).sort((a, b) => a.rowNumber - b.rowNumber);
}

import { useCallback, useEffect, useState } from 'react';
import {
  listPendingSync,
  subscribeSyncQueue,
  clearPendingSync,
  markSyncAttempt,
  getQueueHealth,
  acknowledgeDroppedEdits,
  type PendingSyncEntry,
  type SyncTarget,
} from '../services/sheetSyncQueue';
import { getAccessToken, isGoogleTokenExpired, GOOGLE_TOKEN_EVENT } from '../services/googleAuth';
import { syncAttendanceToSheet, batchUpdateSheetRecords, addSheetRecord, DEFAULT_SPREADSHEET_ID, DEFAULT_SHEET_TITLE } from '../services/googleSheetsService';
import type { StudentRecord } from '../services/googleSheetsService';
import { listSharedEdits, removeSharedEdits, subscribeSharedEdits, isPendingAdd, markSharedEditSynced } from '../services/sharedRecordEdits';

/** The queue's cap, read once. `getQueueHealth().capacity` is a constant, and
 *  calling it on every render would re-parse the whole queue for a number that
 *  never changes. */
const QUEUE_CAPACITY = getQueueHealth().capacity;

/** Warn at 80 % full. By the time entries are actually being dropped the
 *  teacher has already lost work; the useful moment to act is just before. */
const QUEUE_WARN_RATIO = 0.8;

/**
 * Drives the pending Google Sheets sync queue.
 *
 * Local saves are never blocked by the Google token. A change is queued, the
 * teacher is told how many changes are waiting, and Sync pushes them once
 * Google is reconnected - automatically when a token becomes available.
 */
export function useSheetSyncQueue() {
  const [entries, setEntries] = useState<PendingSyncEntry[]>(() => listPendingSync());
  const [syncing, setSyncing] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [sheetsConnected, setSheetsConnected] = useState<boolean>(() => !isGoogleTokenExpired());
  // Edits the queue could not hold. Kept separate from `entries` because it
  // survives the queue emptying: an edit that was dropped is still dropped
  // after the rest of the queue syncs, and the teacher still has to be told.
  const [droppedCount, setDroppedCount] = useState<number>(() => getQueueHealth().dropped);

  const refreshQueue = useCallback(() => {
    setEntries(listPendingSync());
    setDroppedCount(getQueueHealth().dropped);
  }, []);

  useEffect(() => {
    refreshQueue();
    return subscribeSyncQueue(refreshQueue);
  }, [refreshQueue]);

  /** Pending record edits living in Firestore. Counted separately from the local
   *  queue because it is a different store - and because these are exactly the
   *  edits every other teacher can already see. */
  const [sharedPendingCount, setSharedPendingCount] = useState(0);

  useEffect(() => {
    return subscribeSharedEdits((edits) => setSharedPendingCount(edits.length));
  }, []);

  const refreshTokenState = useCallback(() => {
    setSheetsConnected(!isGoogleTokenExpired());
  }, []);

  useEffect(() => {
    refreshTokenState();
    const id = setInterval(refreshTokenState, 30000);
    window.addEventListener('storage', refreshTokenState);
    // Same-tab token changes: googleAuth broadcasts instead of relying on the
    // `storage` event, which only fires in other tabs. Without this the banner
    // kept its "needs reconnect" state after the user had just reconnected.
    window.addEventListener(GOOGLE_TOKEN_EVENT, refreshTokenState);
    return () => {
      clearInterval(id);
      window.removeEventListener('storage', refreshTokenState);
      window.removeEventListener(GOOGLE_TOKEN_EVENT, refreshTokenState);
    };
  }, [refreshTokenState]);

  /**
   * Pushes every pending change to the sheet in as few requests as possible.
   *
   * Explicit by design. This also used to run automatically the moment a token
   * became available, which meant an edit could leave the device without the
   * teacher asking for it - and left no chance to correct a mistake before the
   * shared register was written. The teacher now collects their edits and presses
   * Sync to Sheet once.
   */
  const syncAll = useCallback(async () => {
    // Records and attendance come from different stores: a pending record edit
    // lives in Firestore (visible to every teacher and every device), attendance
    // uses the local queue. `legacyRecordEntries` are localStorage `records`
    // entries written by the pre-Firestore version - still unsynced work, which
    // must not be stranded by an upgrade.
    const queued = listPendingSync();
    const attendancePending = queued.filter((e) => e.target === 'attendance');
    const legacyRecordEntries = queued.filter((e) => e.target === 'records');
    const { edits: recordEdits, reachable } = await listSharedEdits();
    const total =
      attendancePending.length + recordEdits.length + legacyRecordEntries.length;

    // Never report success while the shared store is unreadable. An empty result
    // from an unreachable Firestore is indistinguishable from "nothing pending",
    // so claiming "all synced" there would be a lie.
    if (!reachable) {
      setLastResult(
        'Could not reach the shared records store, so pending edits could not be checked. Check your connection, then try again.'
      );
      return;
    }
    if (!total) {
      setLastResult('Nothing to sync - all changes are already in the sheet.');
      return;
    }
    // Read from the token itself rather than the `sheetsConnected` React state:
    // the banner signs in and calls syncAll in the same tick, before a state
    // update can be observed.
    if (isGoogleTokenExpired()) {
      setLastResult(
        'Google sign-in has expired. Sign in with Google to continue, then press Sync to Sheet again.'
      );
      return;
    }

    setSyncing(true);
    let ok = 0;
    const failures: string[] = [];
    /** Firestore docs to drop, each paired with the version that was written, so
     *  a concurrent re-edit is preserved instead of silently deleted. */
    const settled: { docId: string; updatedAt: number }[] = [];

    try {
      const token = await getAccessToken();
      if (!token) {
        setLastResult(
          'Google sign-in has expired. Sign in with Google, then press Sync to Sheet again.'
        );
        return;
      }

      // New students and edits to existing rows need different Sheets calls. A
      // new student has no row to write to, so it must be appended; sending one
      // through the batch writer produced the illegal range `R0:AO0` and, because
      // `values:batchUpdate` is request-atomic, failed every edit in the chunk.
      // An edit carrying `syncedAt` was already written to the sheet by an earlier
      // run whose cleanup failed. Re-writing a row is harmless, but re-APPENDING a
      // new student would duplicate it in the register, so those skip the write
      // entirely and only retry the delete.
      const alreadySynced = recordEdits.filter((e) => Number(e.syncedAt ?? 0) > 0);
      const needsWrite = recordEdits.filter((e) => !(Number(e.syncedAt ?? 0) > 0));
      const addEdits = needsWrite.filter(isPendingAdd);
      const updateEdits = needsWrite.filter((e) => !isPendingAdd(e));

      if (updateEdits.length) {
        // ONE request per RECORD_BATCH_SIZE rows. A request per student is what
        // made a class of 40 cost 40 writes against a 60/min quota.
        const result = await batchUpdateSheetRecords(
          updateEdits.map((edit) => edit.record),
          token,
          DEFAULT_SPREADSHEET_ID,
          DEFAULT_SHEET_TITLE
        );
        const failedRows = new Map(result.failures.map((f) => [f.rowNumber, f.message]));
        for (const edit of updateEdits) {
          const failure = failedRows.get(edit.rowNumber);
          if (failure) {
            // Left in Firestore on purpose: still visible to every teacher, and
            // retried on the next Sync.
            failures.push(`Row ${edit.rowNumber} (${edit.record.studentName}): ${failure}`);
            continue;
          }
          // Mark before delete, so a failure between the two cannot cause a second
          // append on the next Sync. A failed marker is surfaced rather than
          // swallowed: the row is already in the sheet, so a retry could duplicate
          // it and the teacher needs to know to check the register.
          if (!(await markSharedEditSynced(edit.docId))) {
            failures.push(
              `${edit.record.studentName}: written to the sheet, but this device could not confirm it. Check the register before syncing again.`
            );
          }
          settled.push({ docId: edit.docId, updatedAt: edit.updatedAt });
          ok++;
        }
      }

      // Adds are appended individually: the API offers no batch-append, and
      // interleaving concurrent appends is what decides the final row order.
      for (const edit of addEdits) {
        try {
          const { rowNumber, ...fields } = edit.record as StudentRecord;
          await addSheetRecord(
            fields as Omit<StudentRecord, 'rowNumber'>,
            token,
            DEFAULT_SPREADSHEET_ID,
            DEFAULT_SHEET_TITLE
          );
          // Marked before the delete for the same reason: an append that is
          // repeated is a duplicated student in the register.
          if (!(await markSharedEditSynced(edit.docId))) {
            failures.push(
              `${edit.record.studentName}: added to the sheet, but this device could not confirm it. Check the register before syncing again.`
            );
          }
          settled.push({ docId: edit.docId, updatedAt: edit.updatedAt });
          ok++;
        } catch (err: any) {
          failures.push(`New student ${edit.record.studentName}: ${err?.message || err}`);
        }
      }

      // Edits a previous run already wrote to the sheet only need their cleanup
      // retried. They are not counted as new work.
      for (const edit of alreadySynced) {
        settled.push({ docId: edit.docId, updatedAt: edit.updatedAt });
      }

      // Pre-Firestore `records` entries, pushed the same way and only cleared
      // once the sheet has them, so upgrading cannot strand a teacher's edit.
      if (legacyRecordEntries.length) {
        // Legacy ADDS were queued with scope "0", because `StudentEditModal`
        // builds new students with `rowNumber: 0`. They can never go through the
        // batch writer, and before this split they failed its row guard on every
        // attempt - a pending change the banner counted but could never clear.
        const legacyAdds = legacyRecordEntries.filter((entry) => !(Number(entry.scope) > 0));
        const legacyUpdates = legacyRecordEntries.filter((entry) => Number(entry.scope) > 0);

        if (legacyUpdates.length) {
          // Wrapped, unlike the Firestore path above it. An unhandled throw here
          // would abandon the attendance entries, the legacy adds and the pending
          // deletes still in `settled`, and reject out of the button handler.
          try {
            const result = await batchUpdateSheetRecords(
              legacyUpdates.map((entry) => entry.payload as StudentRecord),
              token,
              DEFAULT_SPREADSHEET_ID,
              DEFAULT_SHEET_TITLE
            );
            const failedRows = new Set(result.failures.map((f) => f.rowNumber));
            for (const entry of legacyUpdates) {
              if (failedRows.has(Number(entry.scope))) {
                markSyncAttempt(entry.id, 'This change could not be written to the sheet.');
                failures.push(`${entry.label}: still waiting to reach the sheet.`);
                continue;
              }
              clearPendingSync(entry.id);
              ok++;
            }
          } catch (err: any) {
            const message = err?.message || String(err);
            for (const entry of legacyUpdates) {
              markSyncAttempt(entry.id, message);
              failures.push(`${entry.label}: ${message}`);
            }
          }
        }

        for (const entry of legacyAdds) {
          try {
            const { rowNumber, ...fields } = entry.payload as StudentRecord;
            await addSheetRecord(
              fields as Omit<StudentRecord, 'rowNumber'>,
              token,
              DEFAULT_SPREADSHEET_ID,
              DEFAULT_SHEET_TITLE
            );
            clearPendingSync(entry.id);
            ok++;
          } catch (err: any) {
            markSyncAttempt(entry.id, err?.message || String(err));
            failures.push(`${entry.label}: ${err?.message || err}`);
          }
        }
      }

      for (const entry of attendancePending) {
        try {
          const p = entry.payload as {
            date: string;
            recordedBy?: string;
            notes?: string;
            summary: { totalEnrolled: number; totalPresent: number; totalAbsent: number; overallPercentage: number };
            rows: any[];
          };
          await syncAttendanceToSheet(p, token);
          clearPendingSync(entry.id);
          ok++;
        } catch (err: any) {
          markSyncAttempt(entry.id, err?.message || String(err));
          failures.push(`${entry.label}: ${err?.message || err}`);
        }
      }

      // Only after the sheet confirmed the write, and only for the exact version
      // that was written. Clearing first would drop an edit other teachers rely on
      // if the write failed; deleting without the version check would drop a
      // re-edit made while the write was in flight.
      if (settled.length) await removeSharedEdits(settled);
    } finally {
      setEntries(listPendingSync());
      setDroppedCount(getQueueHealth().dropped);
      refreshTokenState();
      setSyncing(false);
    }

    setLastResult(
      failures.length
        ? `Synced ${ok} of ${total}. Still waiting: ${failures[0]}`
        : `Synced ${ok} change${ok === 1 ? '' : 's'} to Google Sheets.`
    );
  }, [refreshTokenState]);

  // There is deliberately NO automatic push here. A `useEffect` used to fire
  // syncAll() as soon as `sheetsConnected` went true, which uploaded edits the
  // teacher had not decided to publish yet. Pushing is now only ever triggered by
  // an explicit Sync to Sheet, so an edit cannot reach the shared register by
  // accident.

  const acknowledgeDropped = useCallback(() => {
    acknowledgeDroppedEdits();
    setDroppedCount(0);
  }, []);

  return {
    entries,
    /** Attendance entries in the local queue plus record edits pending in
     *  Firestore - the number the banner reports as waiting. */
    pendingCount: entries.length + sharedPendingCount,
    sharedPendingCount,
    pendingFor: (target: SyncTarget) => entries.filter((e) => e.target === target),
    sheetsConnected,
    syncing,
    lastResult,
    syncAll,
    refreshTokenState,
    /** Edits that never made it into the sheet because the queue could not hold
     *  them, or localStorage refused to store them. Zero means nothing was lost. */
    droppedCount,
    capacity: QUEUE_CAPACITY,
    /** True when the queue is close enough to its cap that the next few distinct
     *  edits will start discarding the oldest. Worth telling the teacher to
     *  reconnect now, rather than after something has gone. */
    queueNearlyFull: entries.length >= QUEUE_CAPACITY * QUEUE_WARN_RATIO,
    acknowledgeDropped,
  };
}

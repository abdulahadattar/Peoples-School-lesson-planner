import { useCallback, useEffect, useState } from 'react';
import {
  listPendingSync,
  subscribeSyncQueue,
  pendingSyncCount,
  clearPendingSync,
  markSyncAttempt,
  type PendingSyncEntry,
  type SyncTarget,
} from '../services/sheetSyncQueue';
import { getAccessToken, isGoogleTokenExpired, GOOGLE_TOKEN_EVENT } from '../services/googleAuth';
import { syncAttendanceToSheet, updateSheetRecord, DEFAULT_SPREADSHEET_ID, DEFAULT_SHEET_TITLE } from '../services/googleSheetsService';
import type { StudentRecord } from '../services/googleSheetsService';
import { clearLocalRecord } from '../services/localRecordsOverlay';

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

  useEffect(() => {
    setEntries(listPendingSync());
    return subscribeSyncQueue(() => setEntries(listPendingSync()));
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

  const syncAll = useCallback(async () => {
    const pending = listPendingSync();
    if (!pending.length) {
      setLastResult('Nothing to sync - all changes are already in the sheet.');
      return;
    }
    if (!sheetsConnected) {
      setLastResult(
        'Google sign-in has expired. Reconnect from the header to sync your changes to the sheet.'
      );
      return;
    }

    setSyncing(true);
    let ok = 0;
    const failures: string[] = [];

    for (const entry of pending) {
      try {
        const token = await getAccessToken();
        if (!token) {
          failures.push(`${entry.label}: Google sign-in expired`);
          continue;
        }
        if (entry.target === 'attendance') {
          const p = entry.payload as {
            date: string;
            recordedBy?: string;
            notes?: string;
            summary: { totalEnrolled: number; totalPresent: number; totalAbsent: number; overallPercentage: number };
            rows: any[];
          };
          await syncAttendanceToSheet(p, token);
        } else {
          await updateSheetRecord(entry.payload as StudentRecord, token, DEFAULT_SPREADSHEET_ID, DEFAULT_SHEET_TITLE);
          // The sheet now holds the change, so the local copy that was standing
          // in for it must go, otherwise the overlay would shadow the sheet
          // forever.
          clearLocalRecord(Number(entry.scope));
        }
        clearPendingSync(entry.id);
        ok++;
      } catch (err: any) {
        markSyncAttempt(entry.id, err?.message || String(err));
        failures.push(`${entry.label}: ${err?.message || err}`);
      }
    }

    setEntries(listPendingSync());
    refreshTokenState();
    setSyncing(false);
    setLastResult(
      failures.length
        ? `Synced ${ok} of ${pending.length}. Still waiting: ${failures[0]}`
        : `Synced ${ok} change${ok === 1 ? '' : 's'} to Google Sheets.`
    );
  }, [sheetsConnected, refreshTokenState]);

  // Push automatically as soon as Google becomes available again.
  useEffect(() => {
    if (sheetsConnected && pendingSyncCount() > 0 && !syncing) {
      void syncAll();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetsConnected]);

  return {
    entries,
    pendingCount: entries.length,
    pendingFor: (target: SyncTarget) => entries.filter((e) => e.target === target),
    sheetsConnected,
    syncing,
    lastResult,
    syncAll,
    refreshTokenState,
  };
}

import { useCallback, useState, type MutableRefObject } from 'react';
import { getAccessToken, googleSignIn } from '../../services/googleAuth';
import {
  buildSpreadsheetUrl,
  extractSpreadsheetId,
  MARKSHEET_SPREADSHEET_ID,
  MARKSHEET_SPREADSHEET_URL,
} from '../../services/marksheet/config';
import {
  applyPendingEditsToEntries,
  deleteMarksheetPendingEdits,
  type MarksheetPendingEdit,
  removeLocalPendingEdits,
} from '../../services/marksheet/pendingEditsRepository';
import { pushPendingMarksheetEditsToSheet } from '../../services/marksheet/sheetWriter';
import type { StudentMarkEntry } from '../../services/marksheet/types';
import type { SchoolConfig } from '../../services/schoolConfig/types';
import { toUserErrorMessage } from '../../utils/userMessage';

export function useMarksheetAdminActions(params: {
  isAdmin: boolean;
  activeSpreadsheetId: string;
  schoolConfig: SchoolConfig;
  saveConfig: (next: SchoolConfig) => Promise<void>;
  baseEntriesRef: MutableRefObject<Record<string, StudentMarkEntry>>;
  remotePendingRef: MutableRefObject<MarksheetPendingEdit[]>;
  localPendingRef: MutableRefObject<MarksheetPendingEdit[]>;
  combinedPendingRef: MutableRefObject<MarksheetPendingEdit[]>;
  appliedInitialScaleRef: MutableRefObject<boolean>;
  cachedHashRef: MutableRefObject<string | null>;
  applyCombinedEntries: (incomingBase?: Record<string, StudentMarkEntry>) => void;
  checkAndSyncFromSheet: (opts?: {
    force?: boolean;
    silent?: boolean;
    ignoreKnownHash?: boolean;
    spreadsheetIdOverride?: string;
  }) => Promise<boolean>;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}) {
  const {
    isAdmin,
    activeSpreadsheetId,
    schoolConfig,
    saveConfig,
    baseEntriesRef,
    remotePendingRef,
    localPendingRef,
    combinedPendingRef,
    appliedInitialScaleRef,
    cachedHashRef,
    applyCombinedEntries,
    checkAndSyncFromSheet,
    showToast,
  } = params;

  const [pushingDocId, setPushingDocId] = useState<string | null>(null);

  const replaceSyncedSheetLink = useCallback(
    async (rawInput: string): Promise<boolean> => {
      if (!isAdmin) return false;
      const newId = extractSpreadsheetId(rawInput);
      if (!newId) {
        showToast('Enter a valid Google Sheets URL or Spreadsheet ID.', 'error');
        return false;
      }
      const newUrl = buildSpreadsheetUrl(newId);
      try {
        await saveConfig({
          ...schoolConfig,
          marksheetSpreadsheetId: newId,
          marksheetSpreadsheetUrl: newUrl,
        });
        appliedInitialScaleRef.current = false;
        cachedHashRef.current = null;
        const ok = await checkAndSyncFromSheet({
          force: true,
          silent: true,
          ignoreKnownHash: true,
          spreadsheetIdOverride: newId,
        });
        if (ok) {
          showToast('Google Sheet link updated.', 'success');
        }
        return ok;
      } catch (err: unknown) {
        showToast(toUserErrorMessage(err, 'Could not update Google Sheet link.'), 'error');
        return false;
      }
    },
    [
      isAdmin,
      saveConfig,
      schoolConfig,
      showToast,
      checkAndSyncFromSheet,
      appliedInitialScaleRef,
      cachedHashRef,
    ]
  );

  const resetSyncedSheetLink = useCallback(async (): Promise<boolean> => {
    if (!isAdmin) return false;
    try {
      await saveConfig({
        ...schoolConfig,
        marksheetSpreadsheetId: MARKSHEET_SPREADSHEET_ID,
        marksheetSpreadsheetUrl: MARKSHEET_SPREADSHEET_URL,
      });
      appliedInitialScaleRef.current = false;
      cachedHashRef.current = null;
      const ok = await checkAndSyncFromSheet({
        force: true,
        silent: true,
        ignoreKnownHash: true,
        spreadsheetIdOverride: MARKSHEET_SPREADSHEET_ID,
      });
      if (ok) {
        showToast('Restored default Google Sheet.', 'success');
      }
      return ok;
    } catch (err: unknown) {
      showToast(toUserErrorMessage(err, 'Could not reset Google Sheet link.'), 'error');
      return false;
    }
  }, [isAdmin, saveConfig, schoolConfig, showToast, checkAndSyncFromSheet, appliedInitialScaleRef, cachedHashRef]);

  const pushPendingToSheet = useCallback(
    async (targetDocIds?: string[]) => {
      if (!isAdmin) return;
      const queue = targetDocIds?.length
        ? combinedPendingRef.current.filter((e) => targetDocIds.includes(e.docId))
        : combinedPendingRef.current;
      if (!queue.length) {
        showToast('No pending mark changes to approve.', 'info');
        return;
      }
      setPushingDocId(targetDocIds?.length === 1 ? targetDocIds[0] : 'ALL');
      try {
        let token = await getAccessToken().catch(() => null);
        if (!token) {
          const authRes = await googleSignIn();
          token = authRes?.accessToken || null;
        }
        if (!token) {
          showToast('Please sign in with Google to save changes.', 'error');
          return;
        }

        const result = await pushPendingMarksheetEditsToSheet(queue, token, activeSpreadsheetId);
        if (result.pushedDocIds.length > 0) {
          const pushedEdits = queue.filter((e) => result.pushedDocIds.includes(e.docId));
          baseEntriesRef.current = applyPendingEditsToEntries(baseEntriesRef.current, pushedEdits);
          localPendingRef.current = removeLocalPendingEdits(result.pushedDocIds);
          remotePendingRef.current = remotePendingRef.current.filter(
            (e) => !result.pushedDocIds.includes(e.docId)
          );
          await deleteMarksheetPendingEdits(result.pushedDocIds);
          applyCombinedEntries();
        }

        if (result.missingGrs.length > 0) {
          showToast(
            `Approved ${result.pushedDocIds.length} update(s). Missing GR(s) in sheet: ${result.missingGrs.join(', ')}.`,
            'info'
          );
        } else {
          showToast(
            `Approved and saved ${result.pushedDocIds.length} student update(s).`,
            'success'
          );
        }

        await checkAndSyncFromSheet({ force: true, silent: true, ignoreKnownHash: true });
      } catch (err: unknown) {
        showToast(toUserErrorMessage(err, 'Failed to save marksheet updates.'), 'error');
      } finally {
        setPushingDocId(null);
      }
    },
    [
      activeSpreadsheetId,
      applyCombinedEntries,
      baseEntriesRef,
      checkAndSyncFromSheet,
      combinedPendingRef,
      isAdmin,
      localPendingRef,
      remotePendingRef,
      showToast,
    ]
  );

  const discardPendingEdit = useCallback(
    async (docId: string) => {
      if (!isAdmin) return;
      try {
        localPendingRef.current = removeLocalPendingEdits([docId]);
        remotePendingRef.current = remotePendingRef.current.filter((e) => e.docId !== docId);
        await deleteMarksheetPendingEdits([docId]);
        applyCombinedEntries();
        showToast('Discarded pending marksheet update.', 'info');
      } catch (err: unknown) {
        showToast(toUserErrorMessage(err, 'Could not discard update.'), 'error');
      }
    },
    [applyCombinedEntries, isAdmin, localPendingRef, remotePendingRef, showToast]
  );

  return {
    pushingDocId,
    isPushingPending: pushingDocId !== null,
    replaceSyncedSheetLink,
    resetSyncedSheetLink,
    pushPendingToSheet,
    discardPendingEdit,
  };
}

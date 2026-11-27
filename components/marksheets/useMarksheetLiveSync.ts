import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { getAccessToken, googleSignIn } from '../../services/googleAuth';
import {
  saveMarksheetCacheSnapshot,
  subscribeMarksheetCache,
} from '../../services/marksheet/cacheRepository';
import {
  buildSpreadsheetUrl,
  extractSpreadsheetId,
  MARKSHEET_SPREADSHEET_ID,
} from '../../services/marksheet/config';
import { fetchLiveMarksheetData } from '../../services/marksheet/liveSync';
import {
  applyPendingEditsToEntries,
  combinePendingEditLists,
  loadLocalPendingEdits,
  type MarksheetPendingEdit,
  saveMarksheetPendingEdit,
  subscribeMarksheetPendingEdits,
  upsertLocalPendingEdit,
} from '../../services/marksheet/pendingEditsRepository';
import { mergeMarksheetEntries, saveMarksheetEntries } from '../../services/marksheet/storage';
import type {
  GradingSystemType,
  MarksheetConfig,
  MarksheetExamType,
  StudentMarkEntry,
} from '../../services/marksheet/types';
import { normalizeGrKey } from '../../services/identityNormalization';
import { useSchoolConfig } from '../../hooks/useSchoolConfig';
import { mergeConfigPatch } from './marksheetExportActions';
import { useMarksheetAdminActions } from './useMarksheetAdminActions';
import { toUserErrorMessage } from '../../utils/userMessage';

const ADMIN_SHEET_CHECK_MS = 60 * 1000;
const FOCUS_CHECK_MIN_GAP_MS = 20 * 1000;

export function useMarksheetLiveSync(params: {
  setConfig: Dispatch<SetStateAction<MarksheetConfig>>;
  setEntriesMap: Dispatch<SetStateAction<Record<string, StudentMarkEntry>>>;
  setGradingSystem: Dispatch<SetStateAction<GradingSystemType>>;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}) {
  const { setConfig, setEntriesMap, setGradingSystem, showToast } = params;
  const {
    config: schoolConfig,
    isAdmin,
    currentUser,
    isSaving: isSavingSheetLink,
    saveConfig,
  } = useSchoolConfig();

  const isSignedIn = Boolean(currentUser);
  const activeSpreadsheetId =
    extractSpreadsheetId(schoolConfig.marksheetSpreadsheetId || '') || MARKSHEET_SPREADSHEET_ID;
  const activeSpreadsheetUrl =
    schoolConfig.marksheetSpreadsheetUrl &&
    extractSpreadsheetId(schoolConfig.marksheetSpreadsheetUrl) === activeSpreadsheetId
      ? schoolConfig.marksheetSpreadsheetUrl
      : buildSpreadsheetUrl(activeSpreadsheetId);
  const isCustomSpreadsheet = activeSpreadsheetId !== MARKSHEET_SPREADSHEET_ID;

  const [isSyncingLive, setIsSyncingLive] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncNeedsAuth, setSyncNeedsAuth] = useState(false);
  const [pendingEdits, setPendingEdits] = useState<MarksheetPendingEdit[]>(() =>
    loadLocalPendingEdits()
  );

  const appliedInitialScaleRef = useRef(false);
  const lastCheckMsRef = useRef(0);
  const cachedHashRef = useRef<string | null>(null);
  const baseEntriesRef = useRef<Record<string, StudentMarkEntry>>({});
  const remotePendingRef = useRef<MarksheetPendingEdit[]>([]);
  const localPendingRef = useRef<MarksheetPendingEdit[]>(loadLocalPendingEdits());
  const combinedPendingRef = useRef<MarksheetPendingEdit[]>(localPendingRef.current);

  const applyCombinedEntries = useCallback(
    (incomingBase?: Record<string, StudentMarkEntry>) => {
      if (incomingBase) {
        baseEntriesRef.current = incomingBase;
      }
      const combined = combinePendingEditLists(remotePendingRef.current, localPendingRef.current);
      combinedPendingRef.current = combined;
      setPendingEdits(combined);

      setEntriesMap((prev) => {
        const sourceBase =
          Object.keys(baseEntriesRef.current).length > 0 ? baseEntriesRef.current : prev;
        const mergedSheet = mergeMarksheetEntries({}, sourceBase);
        // Unconditionally overlay unpushed pending edits last so Google Sheet never overwrites them
        const withPending = applyPendingEditsToEntries(mergedSheet, combined);
        saveMarksheetEntries(withPending);
        return withPending;
      });
    },
    [setEntriesMap]
  );

  const getBaseEntry = useCallback(
    (grNo: string, examType: MarksheetExamType): StudentMarkEntry | undefined => {
      const targetNorm = normalizeGrKey(grNo);
      const base = baseEntriesRef.current;
      return (Object.values(base) as StudentMarkEntry[]).find(
        (e) => e.examType === examType && normalizeGrKey(e.grNo) === targetNorm
      );
    },
    []
  );

  const persistPendingEdit = useCallback(
    async (edit: MarksheetPendingEdit, syncToFirestore = true) => {
      localPendingRef.current = upsertLocalPendingEdit(edit);
      applyCombinedEntries();
      if (syncToFirestore && currentUser) {
        await saveMarksheetPendingEdit(edit);
      }
    },
    [applyCombinedEntries, currentUser]
  );

  useEffect(() => {
    if (!currentUser) return;
    const localOnly = localPendingRef.current.filter((e) => e.updatedByUid === 'local');
    if (!localOnly.length) return;
    void Promise.all(
      localOnly.map((e) =>
        saveMarksheetPendingEdit({
          ...e,
          updatedByUid: currentUser.uid,
          updatedByEmail: currentUser.email || undefined,
          updatedByName: currentUser.displayName || undefined,
        }).then((saved) => {
          if (saved) {
            localPendingRef.current = upsertLocalPendingEdit(saved);
          }
        })
      )
    ).then(() => applyCombinedEntries());
  }, [currentUser, applyCombinedEntries]);

  const checkAndSyncFromSheet = useCallback(
    async (
      opts: {
        force?: boolean;
        silent?: boolean;
        ignoreKnownHash?: boolean;
        spreadsheetIdOverride?: string;
      } = {}
    ): Promise<boolean> => {
      const targetId = opts.spreadsheetIdOverride || activeSpreadsheetId;
      setIsSyncingLive(true);
      setSyncError(null);
      lastCheckMsRef.current = Date.now();
      try {
        const accessToken = await getAccessToken().catch(() => null);
        const knownHash = opts.ignoreKnownHash ? null : cachedHashRef.current;
        const res = await fetchLiveMarksheetData({
          spreadsheetId: targetId,
          accessToken,
          forceRefresh: opts.force,
          knownHash,
        });

        setSyncNeedsAuth(false);
        if (res.unchanged) {
          if (!opts.silent) {
            showToast('Marksheet data is already up to date.', 'info');
          }
          return true;
        }

        if (res.configPatch) {
          setConfig((prev) => mergeConfigPatch(prev, res.configPatch!));
          if (!appliedInitialScaleRef.current && res.configPatch.activeGradingSystem) {
            setGradingSystem(res.configPatch.activeGradingSystem);
            appliedInitialScaleRef.current = true;
          }
        }

        const incomingEntries = res.entriesByKey || {};
        cachedHashRef.current = res.contentHash || null;
        applyCombinedEntries(incomingEntries);

        if (isAdmin && res.contentHash) {
          await saveMarksheetCacheSnapshot({
            spreadsheetId: targetId,
            contentHash: res.contentHash,
            syncedAt: res.syncedAt,
            count: res.count || Object.keys(incomingEntries).length,
            configPatch: res.configPatch || null,
            entriesByKey: incomingEntries,
            updatedBy: currentUser?.email || null,
          }).catch((err) => {
            console.warn('[marksheets] Failed saving cache snapshot to Firestore:', err);
          });
        }

        if (!opts.silent) {
          showToast(`Updated ${res.count ?? 0} students from Google Sheet.`, 'success');
        }
        return true;
      } catch (err: unknown) {
        const needsAuth = Boolean((err as { needsAuth?: boolean } | null)?.needsAuth);
        setSyncNeedsAuth(needsAuth);
        const msg = toUserErrorMessage(err, 'Unable to update marksheets from Google Sheet.');
        setSyncError(msg);
        if (!opts.silent) {
          showToast(msg, 'error');
        }
        return false;
      } finally {
        setIsSyncingLive(false);
      }
    },
    [
      activeSpreadsheetId,
      applyCombinedEntries,
      currentUser?.email,
      isAdmin,
      setConfig,
      setGradingSystem,
      showToast,
    ]
  );

  useEffect(() => {
    let bootstrapped = false;
    cachedHashRef.current = null;

    const unsub = subscribeMarksheetCache(
      activeSpreadsheetId,
      (snap) => {
        cachedHashRef.current = snap.contentHash;
        if (snap.hasCache) {
          if (snap.configPatch) {
            setConfig((prev) => mergeConfigPatch(prev, snap.configPatch!));
            if (!appliedInitialScaleRef.current && snap.configPatch.activeGradingSystem) {
              setGradingSystem(snap.configPatch.activeGradingSystem);
              appliedInitialScaleRef.current = true;
            }
          }
          applyCombinedEntries(snap.entriesByKey);
          setSyncError(null);
          setSyncNeedsAuth(false);
        } else if (!bootstrapped) {
          bootstrapped = true;
          void checkAndSyncFromSheet({ force: false, silent: true, ignoreKnownHash: true });
        }
      },
      (err) => {
        console.warn('[marksheets] Firestore cache subscription notice:', err);
      }
    );

    return () => unsub();
  }, [activeSpreadsheetId, applyCombinedEntries, checkAndSyncFromSheet, setConfig, setGradingSystem]);

  useEffect(() => {
    const unsub = subscribeMarksheetPendingEdits(
      (edits) => {
        remotePendingRef.current = edits;
        const remoteIds = new Set(edits.map((e) => e.docId));
        if (currentUser) {
          localPendingRef.current = localPendingRef.current.filter(
            (l) => l.updatedByUid === 'local' || remoteIds.has(l.docId)
          );
        }
        applyCombinedEntries();
      },
      (err) => {
        console.warn('[marksheets] Pending edits subscription notice:', err);
      }
    );
    return () => unsub();
  }, [applyCombinedEntries, currentUser]);

  useEffect(() => {
    if (!isAdmin) return;

    const maybeCheck = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastCheckMsRef.current < FOCUS_CHECK_MIN_GAP_MS) return;
      void checkAndSyncFromSheet({ force: false, silent: true });
    };

    const initialTimer = window.setTimeout(() => {
      void checkAndSyncFromSheet({ force: false, silent: true });
    }, 1500);

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void checkAndSyncFromSheet({ force: false, silent: true });
      }
    }, ADMIN_SHEET_CHECK_MS);

    window.addEventListener('focus', maybeCheck);
    window.addEventListener('online', maybeCheck);

    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(intervalId);
      window.removeEventListener('focus', maybeCheck);
      window.removeEventListener('online', maybeCheck);
    };
  }, [isAdmin, checkAndSyncFromSheet]);

  const connectGoogleAndSync = useCallback(async () => {
    try {
      const authRes = await googleSignIn();
      if (authRes?.accessToken) {
        await checkAndSyncFromSheet({ force: true, silent: false, ignoreKnownHash: true });
      }
    } catch (err: unknown) {
      const code = (err as { code?: string } | null)?.code;
      if (
        code !== 'auth/popup-closed-by-user' &&
        code !== 'auth/cancelled-popup-request' &&
        code !== 'auth/user-cancelled'
      ) {
        showToast(toUserErrorMessage(err, 'Google Sign-In failed.'), 'error');
      }
    }
  }, [checkAndSyncFromSheet, showToast]);

  const adminActions = useMarksheetAdminActions({
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
  });

  return {
    schoolConfig,
    isAdmin,
    isSignedIn,
    currentUser,
    activeSpreadsheetId,
    activeSpreadsheetUrl,
    isCustomSpreadsheet,
    isSavingSheetLink,
    isSyncingLive,
    syncError,
    syncNeedsAuth,
    pendingEdits,
    getBaseEntry,
    persistPendingEdit,
    checkAndSyncFromSheet,
    connectGoogleAndSync,
    ...adminActions,
  };
}

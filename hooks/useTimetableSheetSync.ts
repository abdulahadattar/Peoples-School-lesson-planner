/**
 * useTimetableSheetSync - two-way Google Sheets timetable sync, UI side.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TIMETABLE_SHEET_POLL_MS } from '../services/timetableSheetConfig';
import { type TimetableDiffEntry, type TimetableSheetSnapshot } from '../services/timetableSheetService';
import { syncTimetableToSheet } from '../services/timetableSheetWriter';
import { isGoogleTokenExpired } from '../services/googleAuth';
import type { TimetableClassEntry } from '../services/timetable';
import {
  COUNTDOWN_TICK_MS,
  MAX_CONSECUTIVE_FAILURES,
  errToMessage,
  timetableSheetSignature,
  diffSignature,
  normalisePushResult,
  needsReconnectResult,
  failedPushResult,
  computeDiff,
} from './timetableSheetSync/helpers';
import { fetchWithTimeout } from './timetableSheetSync/sheetFetcher';
import type { TimetablePushResult, TimetableSheetSync } from './timetableSheetSync/types';

export type { TimetablePushResult, TimetableSheetSync };
export { timetableSheetSignature };

const POLL_MS = TIMETABLE_SHEET_POLL_MS;

/**
 * Drives the timetable's Google Sheets sync: an infrequent background read,
 * a manual cache-bypassing refresh, and an explicit, previewed push.
 */
export function useTimetableSheetSync(): TimetableSheetSync {
  const [snapshot, setSnapshot] = useState<TimetableSheetSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [needsReconnect, setNeedsReconnect] = useState(false);
  const [polling, setPolling] = useState(true);
  const [unreachable, setUnreachable] = useState(false);
  const [sheetChanges, setSheetChanges] = useState<TimetableDiffEntry[]>([]);
  const [nextRefreshInMs, setNextRefreshInMs] = useState<number | null>(null);

  const snapshotRef = useRef<TimetableSheetSnapshot | null>(null);
  const classesRef = useRef<TimetableClassEntry[]>([]);
  const inflightRef = useRef<Promise<boolean> | null>(null);
  const timerRef = useRef<number | null>(null);
  const dueAtRef = useRef<number | null>(null);
  const hiddenSinceRef = useRef<number | null>(null);
  const diffSigRef = useRef<string>('[]');
  const failuresRef = useRef(0);
  const stoppedRef = useRef(false);
  const aliveRef = useRef(true);
  const tickRef = useRef<() => void>(() => {});

  const setDue = useCallback((at: number | null) => {
    dueAtRef.current = at;
    setNextRefreshInMs(at === null ? null : Math.max(0, at - Date.now()));
  }, []);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setDue(null);
  }, [setDue]);

  const armTimer = useCallback(
    (delayMs: number) => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      const hidden = typeof document !== 'undefined' && document.visibilityState !== 'visible';
      if (stoppedRef.current || hidden) {
        setDue(null);
        return;
      }
      const delay = Math.max(1000, delayMs);
      setDue(Date.now() + delay);
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        tickRef.current();
      }, delay);
    },
    [setDue]
  );

  const commitDiff = useCallback((entries: TimetableDiffEntry[]) => {
    const sig = diffSignature(entries);
    if (sig === diffSigRef.current) return;
    diffSigRef.current = sig;
    setSheetChanges(entries);
  }, []);

  const commitSnapshot = useCallback(
    (next: TimetableSheetSnapshot | null) => {
      const prev = snapshotRef.current;
      if (next && prev && timetableSheetSignature(prev) === timetableSheetSignature(next)) {
        return;
      }
      snapshotRef.current = next;
      setSnapshot(next);
      commitDiff(computeDiff(classesRef.current, next));
    },
    [commitDiff]
  );

  const recordFailure = useCallback(
    (message: string) => {
      failuresRef.current += 1;
      setError(message);
      if (failuresRef.current < MAX_CONSECUTIVE_FAILURES) return;
      stoppedRef.current = true;
      setUnreachable(true);
      setPolling(false);
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setDue(null);
    },
    [setDue]
  );

  const runRefresh = useCallback(
    (opts: { force?: boolean } = {}): Promise<boolean> => {
      if (inflightRef.current) return inflightRef.current;

      const p = fetchWithTimeout(
        opts.force === true,
        (next) => {
          if (!aliveRef.current) return;
          if (!stoppedRef.current) {
            failuresRef.current = 0;
            setUnreachable(false);
            setError(null);
          }
          commitSnapshot(next);
          setLastSyncedAt(Date.now());
        },
        (msg) => {
          if (!aliveRef.current) return;
          recordFailure(msg);
        },
        setRefreshing,
        setLoading
      ).finally(() => {
        if (inflightRef.current === p) inflightRef.current = null;
      });

      inflightRef.current = p;
      return p;
    },
    [commitSnapshot, recordFailure]
  );

  const tick = useCallback(() => {
    if (stoppedRef.current) return;
    if (inflightRef.current) {
      armTimer(POLL_MS);
      return;
    }
    void runRefresh({ force: false }).then(() => {
      if (!stoppedRef.current) armTimer(POLL_MS);
    });
  }, [armTimer, runRefresh]);

  useEffect(() => {
    tickRef.current = tick;
  });

  useEffect(() => {
    aliveRef.current = true;
    failuresRef.current = 0;
    stoppedRef.current = false;
    setUnreachable(false);
    setPolling(true);

    void runRefresh({ force: false }).then(() => {
      if (!stoppedRef.current) armTimer(POLL_MS);
    });

    return () => {
      aliveRef.current = false;
      clearTimer();
    };
  }, [runRefresh, armTimer, clearTimer]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') {
        hiddenSinceRef.current = Date.now();
        clearTimer();
        return;
      }
      const hiddenSince = hiddenSinceRef.current;
      hiddenSinceRef.current = null;
      if (stoppedRef.current) return;
      const overdue = hiddenSince === null || Date.now() - hiddenSince > POLL_MS;
      if (overdue) {
        void runRefresh({ force: true }).then(() => {
          if (!stoppedRef.current) armTimer(POLL_MS);
        });
      } else if (timerRef.current === null) {
        armTimer(POLL_MS);
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    if (document.visibilityState !== 'visible') {
      hiddenSinceRef.current = Date.now();
      clearTimer();
    }
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [runRefresh, armTimer, clearTimer]);

  useEffect(() => {
    const update = () => {
      const due = dueAtRef.current;
      setNextRefreshInMs(due === null ? null : Math.max(0, due - Date.now()));
    };
    update();
    const id = window.setInterval(update, COUNTDOWN_TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const check = () => {
      if (!isGoogleTokenExpired()) setNeedsReconnect(false);
    };
    check();
    const id = window.setInterval(check, COUNTDOWN_TICK_MS);
    window.addEventListener('storage', check);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('storage', check);
    };
  }, []);

  const setLocalClasses = useCallback(
    (classes: TimetableClassEntry[]) => {
      classesRef.current = classes ?? [];
      commitDiff(computeDiff(classesRef.current, snapshotRef.current));
    },
    [commitDiff]
  );

  const refreshNow = useCallback(async (): Promise<TimetableSheetSnapshot | null> => {
    if (inflightRef.current) {
      await inflightRef.current;
    }
    const ok = await runRefresh({ force: true });
    if (ok && !stoppedRef.current) armTimer(POLL_MS);
    return ok ? snapshotRef.current : null;
  }, [armTimer, runRefresh]);

  const previewPush = useCallback(async (classes?: TimetableClassEntry[]): Promise<TimetablePushResult> => {
    const list = classes ?? classesRef.current ?? [];
    try {
      const result = normalisePushResult(await syncTimetableToSheet(list, { dryRun: true }));
      if (result.needsReconnect) setNeedsReconnect(true);
      return result;
    } catch (err) {
      return failedPushResult(errToMessage(err));
    }
  }, []);

  const pushToSheet = useCallback(
    async (classes?: TimetableClassEntry[]): Promise<TimetablePushResult> => {
      const list = classes ?? classesRef.current ?? [];
      if (isGoogleTokenExpired()) {
        setNeedsReconnect(true);
        return needsReconnectResult();
      }
      const pre = await previewPush(list);
      if (pre.needsReconnect || !pre.ok || pre.cellCount === 0) return pre;
      try {
        const result = normalisePushResult(await syncTimetableToSheet(list, { dryRun: false }));
        if (result.needsReconnect) {
          setNeedsReconnect(true);
          return result;
        }
        if (result.ok) {
          result.snapshot = await refreshNow();
        }
        return result;
      } catch (err) {
        return failedPushResult(errToMessage(err));
      }
    },
    [previewPush, refreshNow]
  );

  const stopPolling = useCallback(() => {
    stoppedRef.current = true;
    clearTimer();
    setPolling(false);
  }, [clearTimer]);

  const startPolling = useCallback(() => {
    stoppedRef.current = false;
    failuresRef.current = 0;
    setUnreachable(false);
    setError(null);
    setPolling(true);
    void runRefresh({ force: true }).then(() => {
      if (!stoppedRef.current) armTimer(POLL_MS);
    });
  }, [armTimer, runRefresh]);

  const dismissNeedsReconnect = useCallback(() => setNeedsReconnect(false), []);

  const nextRefreshLabel = useMemo(() => {
    if (!polling || unreachable || nextRefreshInMs === null) return null;
    const minutes = Math.max(1, Math.ceil(nextRefreshInMs / 60000));
    return `${minutes}m`;
  }, [nextRefreshInMs, polling, unreachable]);

  return {
    snapshot,
    loading,
    refreshing,
    error,
    lastSyncedAt,
    needsReconnect,
    pollMs: POLL_MS,
    polling,
    unreachable,
    sheetChanges,
    sheetChangesCount: sheetChanges.length,
    nextRefreshInMs,
    nextRefreshLabel,
    setLocalClasses,
    refreshNow,
    previewPush,
    pushToSheet,
    stopPolling,
    startPolling,
    dismissNeedsReconnect,
  };
}

/**
 * useTimetableSheetSync - two-way Google Sheets timetable sync, UI side.
 *
 * The timetable does not change every day, so the sheet is polled
 * infrequently (TIMETABLE_SHEET_POLL_MS, 15 minutes) rather than on every
 * focus. Reads go through the public CSV export, which needs no OAuth token,
 * so a sheet that has changed in Google still flows into the app while the
 * Google token is expired; only writes need the token.
 *
 * Deliberately NOT part of services/sheetSyncQueue.ts. That queue exists so
 * register and attendance edits survive an expired token by parking themselves
 * in localStorage until the teacher presses Sync. The timetable is different:
 * the sheet is a hand-maintained display grid, the app must not guess at cell
 * addresses, and an unattended write to it could corrupt a hand-edited
 * schedule. So there is no queue and no auto-push here - a write only ever
 * happens from an explicit pushToSheet() call behind a dry-run preview and a
 * confirmation. A failed or blocked push simply leaves the local edit in
 * Firestore, which is the source of truth for saving.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TIMETABLE_SHEET_POLL_MS } from '../services/timetableSheetConfig';
import {
  diffTimetableAgainstSheet,
  fetchTimetableSheetFromSheet,
  type TimetableDiffEntry,
  type TimetableSheetSnapshot,
} from '../services/timetableSheetService';
import { syncTimetableToSheet } from '../services/timetableSheetWriter';
import { isGoogleTokenExpired } from '../services/googleAuth';
import type { TimetableClassEntry } from '../services/timetable';

const POLL_MS = TIMETABLE_SHEET_POLL_MS;

/** Countdown resolution. 30s matches the Sheets token badge in the Header, and
 *  the label is rendered in whole minutes anyway. */
const COUNTDOWN_TICK_MS = 30000;

/** Consecutive failures before polling gives up and asks for a manual retry.
 *  The sheet is only re-read every 15 minutes, so three strikes is well over
 *  an hour of an unreachable export - time to stop trying, not to keep asking. */
const MAX_CONSECUTIVE_FAILURES = 3;

/** The service owns the CSV fetch and cannot cancel it, so a hung transport
 *  would otherwise leave the in-flight guard set forever and freeze the sync.
 *  Reading 12 tabs sequentially is slow on a poor connection, hence the room. */
const READ_TIMEOUT_MS = 60000;

/** Snapshot keys that describe when we read the sheet rather than what is in
 *  it. Stripped before comparing so an unchanged sheet keeps its old object
 *  reference instead of re-rendering every memoised table on every poll. */
const VOLATILE_SNAPSHOT_KEYS = new Set([
  'fetchedAt',
  'fetched_at',
  'loadedAt',
  'syncedAt',
  'cacheAgeMs',
  'ageMs',
  'durationMs',
  'etag',
]);

/* ── value helpers ─────────────────────────────────────────────── */

function errToMessage(err: unknown): string {
  if (typeof err === 'string' && err) return err;
  if (err instanceof Error && err.message) return err.message;
  const rec = err as { message?: unknown; error?: { message?: unknown } } | null;
  if (rec && typeof rec.message === 'string' && rec.message) return rec.message;
  if (rec && rec.error && typeof rec.error.message === 'string') return rec.error.message;
  return 'Could not reach the timetable sheet.';
}

function normaliseForSignature(value: unknown, depth: number): unknown {
  if (depth > 12) return null;
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.map(v => normaliseForSignature(v, depth + 1));
  if (typeof value === 'object') {
    const src = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    // Sorted keys so a snapshot is compared by content, never by property order.
    for (const key of Object.keys(src).sort()) {
      if (VOLATILE_SNAPSHOT_KEYS.has(key)) continue;
      out[key] = normaliseForSignature(src[key], depth + 1);
    }
    return out;
  }
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
  return value;
}

/**
 * Content fingerprint of a snapshot, ignoring fetch timestamps. Two snapshots
 * with the same signature are interchangeable for rendering purposes.
 */
export function timetableSheetSignature(snapshot: TimetableSheetSnapshot | null | undefined): string {
  if (!snapshot) return '';
  try {
    return JSON.stringify(normaliseForSignature(snapshot, 0)) ?? '';
  } catch {
    return '';
  }
}

function diffSignature(entries: TimetableDiffEntry[]): string {
  try {
    return JSON.stringify(entries ?? []) ?? '';
  } catch {
    return '';
  }
}

function labelOfTab(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const rec = value as Record<string, unknown>;
    for (const key of ['name', 'tab', 'tabName', 'label', 'classLabel']) {
      if (typeof rec[key] === 'string' && rec[key]) return rec[key] as string;
    }
  }
  return '';
}

function readErrors(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map(e => errToMessage(e)).filter(Boolean);
  }
  if (typeof raw === 'string' && raw) return [raw];
  return [];
}

function countOf(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (Array.isArray(raw)) return raw.length;
  return 0;
}

function readSkipped(raw: unknown): { tabName: string; reason: string }[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(entry => {
      if (typeof entry === 'string') return { tabName: '', reason: entry };
      const rec = (entry ?? {}) as Record<string, unknown>;
      return { tabName: labelOfTab(rec), reason: typeof rec.reason === 'string' ? rec.reason : errToMessage(rec) };
    })
    .filter(s => s.reason.length > 0);
}

/**
 * Tab names a report touched. A dry run never populates `tabsWritten` (that is
 * filled by the apply step), so the plan is the only place a preview can learn
 * which tabs would change.
 */
function readTabNames(src: Record<string, unknown>): string[] {
  const plan = src.plan as
    | { writes?: unknown; timeWrites?: unknown }
    | undefined;
  const fromPlan: string[] = [];
  for (const list of [plan?.writes, plan?.timeWrites]) {
    if (!Array.isArray(list)) continue;
    for (const write of list) {
      const name = labelOfTab(write);
      if (name && !fromPlan.includes(name)) fromPlan.push(name);
    }
  }
  if (fromPlan.length > 0) return fromPlan;
  return Array.isArray(src.tabsWritten) ? src.tabsWritten.map(labelOfTab).filter(Boolean) : [];
}

/**
 * Normalised outcome of a writer call. The writer's report is read defensively
 * so the UI keeps working if a field changes shape.
 */
export interface TimetablePushResult {
  ok: boolean;
  /** True for a preview, where nothing was written. */
  dryRun: boolean;
  needsReconnect: boolean;
  /** Sheet tabs the write covered. */
  tabCount: number;
  /** Tab names, empty only when the writer reported none. */
  tabLabels: string[];
  /** Cells written, or cells that would be written on a dry run. */
  cellCount: number;
  /** Tabs the planner refused. Never dropped silently. */
  skipped: { tabName: string; reason: string }[];
  errors: string[];
  /** One line, ready to show. */
  message: string;
  /**
   * Snapshot re-read after a successful write. Returned rather than read back
   * off React state, which would still be the pre-push value at the call site.
   */
  snapshot?: TimetableSheetSnapshot | null;
}

function normalisePushResult(raw: unknown): TimetablePushResult {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const dryRun = src.dryRun !== false;
  const needsReconnect = src.needsReconnect === true;
  const tabLabels = readTabNames(src);
  const plan = src.plan as { writes?: unknown; timeWrites?: unknown } | undefined;
  const planned = countOf(plan?.writes) + countOf(plan?.timeWrites);
  // A real write reports what it actually wrote, which can be fewer than the
  // plan promised; a dry run reports nothing, so the plan is the count.
  const reported = countOf(src.cellsWritten);
  const cellCount = reported > 0 ? reported : planned;
  const skipped = readSkipped(src.skipped);
  const errors = readErrors(src.errors);
  const ok = src.ok === true && !needsReconnect;

  const scope = tabLabels.length > 0
    ? ` in ${tabLabels.join(', ')}`
    : '';
  const skipNote = skipped.length > 0
    ? ` ${skipped.length} tab${skipped.length === 1 ? '' : 's'} skipped.`
    : '';

  let message: string;
  if (needsReconnect) {
    message = 'Google Sheets access has expired. Reconnect Sheets to sync.';
  } else if (!ok) {
    message = errors.length > 0 ? errors[0] : 'The sheet could not be read.';
  } else if (cellCount === 0) {
    message = dryRun
      ? 'The sheet already matches the app - nothing to write.'
      : 'The sheet already matched the app - nothing was written.';
  } else {
    message = dryRun
      ? `${cellCount} cell${cellCount === 1 ? '' : 's'} would change${scope}.`
      : `Wrote ${cellCount} cell${cellCount === 1 ? '' : 's'}${scope}.`;
    if (skipNote) message += skipNote;
  }

  return {
    ok,
    dryRun,
    needsReconnect,
    tabCount: tabLabels.length,
    tabLabels,
    cellCount,
    skipped,
    errors,
    message,
  };
}

function needsReconnectResult(): TimetablePushResult {
  return {
    ok: false,
    dryRun: false,
    needsReconnect: true,
    tabCount: 0,
    tabLabels: [],
    cellCount: 0,
    skipped: [],
    errors: ['Google Sheets access has expired.'],
    message: 'Google Sheets access has expired. Reconnect Sheets to sync.',
  };
}

function failedPushResult(message: string): TimetablePushResult {
  return {
    ok: false,
    dryRun: true,
    needsReconnect: false,
    tabCount: 0,
    tabLabels: [],
    cellCount: 0,
    skipped: [],
    errors: [message],
    message,
  };
}

function computeDiff(
  classes: TimetableClassEntry[] | undefined,
  snapshot: TimetableSheetSnapshot | null
): TimetableDiffEntry[] {
  if (!snapshot || !classes || classes.length === 0) return [];
  try {
    // diffTimetableAgainstSheet(local, remote) is pure: no network, no cache.
    const result = diffTimetableAgainstSheet(classes, snapshot.classes ?? []);
    return Array.isArray(result) ? (result as TimetableDiffEntry[]) : [];
  } catch {
    // A diff is advisory (it only feeds the "N differences" hint). Never let
    // it break the editor.
    return [];
  }
}

export interface TimetableSheetSync {
  snapshot: TimetableSheetSnapshot | null;
  /** True until the first read has settled. */
  loading: boolean;
  /** True while any read (poll, catch-up or manual) is in flight. */
  refreshing: boolean;
  error: string | null;
  lastSyncedAt: number | null;
  needsReconnect: boolean;
  pollMs: number;
  /** False once polling has been stopped by the caller or by back-off. */
  polling: boolean;
  /** Polling gave up after repeated failures; offer Retry. */
  unreachable: boolean;
  sheetChanges: TimetableDiffEntry[];
  sheetChangesCount: number;
  nextRefreshInMs: number | null;
  /** e.g. "12m", or null when polling is paused. */
  nextRefreshLabel: string | null;
  /** Register the working copy so the diff and push previews use it. */
  setLocalClasses(classes: TimetableClassEntry[]): void;
  /**
   * Force a read that bypasses the service cache. Works with no Google token,
   * because reads use the public CSV export. Resolves with the snapshot that
   * was just read, or null when the read failed.
   */
  refreshNow(): Promise<TimetableSheetSnapshot | null>;
  /** Dry run only. Never writes. */
  previewPush(classes?: TimetableClassEntry[]): Promise<TimetablePushResult>;
  /** The only path that writes. Call it from an explicit, confirmed action. */
  pushToSheet(classes?: TimetableClassEntry[]): Promise<TimetablePushResult>;
  stopPolling(): void;
  startPolling(): void;
  dismissNeedsReconnect(): void;
}

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

  // Refs hold everything the timers need. Keeping them out of state means the
  // poll effect never has to re-register, so React StrictMode's double-invoke
  // and the visibility listener cannot end up with two live timers.
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
      // Never arm while the tab is hidden or while polling is stopped; the
      // visibility listener (or Retry) is what brings the timer back.
      const hidden = typeof document !== 'undefined' && document.visibilityState !== 'visible';
      if (stoppedRef.current || hidden) {
        setDue(null);
        return;
      }
      const delay = Math.max(1000, delayMs);
      setDue(Date.now() + delay);
      // Re-arms itself, so there is never more than one pending timeout.
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        tickRef.current();
      }, delay);
    },
    [setDue]
  );

  // Only commit a new array when the content actually differs, so an unchanged
  // sheet does not re-render the consumer at all.
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
        return; // deep-equal: keep the old object reference
      }
      snapshotRef.current = next;
      setSnapshot(next);
      commitDiff(computeDiff(classesRef.current, next));
    },
    [commitDiff]
  );

  /** One failed read. Repeated failures stop the poll loop and surface Retry. */
  const recordFailure = useCallback(
    (message: string) => {
      failuresRef.current += 1;
      setError(message);
      if (failuresRef.current < MAX_CONSECUTIVE_FAILURES) return;
      // Back off instead of retrying the public export forever.
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

  /**
   * Single-flight read. A second caller while a request is running joins the
   * in-flight promise instead of opening a second connection to the sheet.
   */
  const runRefresh = useCallback(
    (opts: { force?: boolean } = {}): Promise<boolean> => {
      if (inflightRef.current) return inflightRef.current;

      const request = (async (): Promise<boolean> => {
        setRefreshing(true);
        try {
          const next = await fetchTimetableSheetFromSheet({ forceRefresh: opts.force === true });
          if (!aliveRef.current) return false;
          // Once polling has been stopped, stay stopped until the user retries,
          // so a late success cannot hide the "could not reach" state.
          if (!stoppedRef.current) {
            failuresRef.current = 0;
            setUnreachable(false);
            setError(null);
          }
          commitSnapshot(next ?? null);
          setLastSyncedAt(Date.now());
          return true;
        } catch (err) {
          if (!aliveRef.current) return false;
          recordFailure(errToMessage(err));
          return false;
        } finally {
          setRefreshing(false);
          setLoading(false);
        }
      })();

      let guard: number | undefined;
      const outward: Promise<boolean> = Promise.race([
        request.then(ok => ({ ok, timedOut: false })),
        new Promise<{ ok: boolean; timedOut: boolean }>(resolve => {
          guard = window.setTimeout(
            () => resolve({ ok: false, timedOut: true }),
            READ_TIMEOUT_MS
          );
        }),
      ]).then(outcome => {
        if (guard !== undefined) window.clearTimeout(guard);
        if (inflightRef.current === outward) inflightRef.current = null;
        if (outcome.timedOut && aliveRef.current) {
          // Release the guard and let the next attempt start fresh. The
          // abandoned request may still land; it is a snapshot of the same
          // sheet, so the deep-equal check turns it into a no-op.
          recordFailure(
            `The timetable sheet did not respond within ${READ_TIMEOUT_MS / 1000} seconds.`
          );
        }
        return outcome.ok;
      });

      inflightRef.current = outward;
      return outward;
    },
    [commitSnapshot, recordFailure]
  );

  const tick = useCallback(() => {
    if (stoppedRef.current) return;
    if (inflightRef.current) {
      // A tick landed while a manual or catch-up read was still running.
      // Skip it rather than queue a second fetch; retry next interval.
      armTimer(POLL_MS);
      return;
    }
    void runRefresh({ force: false }).then(() => {
      if (!stoppedRef.current) armTimer(POLL_MS);
    });
  }, [armTimer, runRefresh]);

  // Point the timer at the newest tick without re-registering anything.
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

  // Pause while hidden, catch up when the tab comes back.
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') {
        hiddenSinceRef.current = Date.now();
        clearTimer();
        return;
      }
      const hiddenSince = hiddenSinceRef.current;
      hiddenSinceRef.current = null;
      if (stoppedRef.current) return; // backed off: wait for Retry
      const overdue = hiddenSince === null || Date.now() - hiddenSince > POLL_MS;
      if (overdue) {
        // Away longer than one poll interval: the cached snapshot is stale.
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

  // Live "next refresh in Nm" countdown.
  useEffect(() => {
    const update = () => {
      const due = dueAtRef.current;
      setNextRefreshInMs(due === null ? null : Math.max(0, due - Date.now()));
    };
    update();
    const id = window.setInterval(update, COUNTDOWN_TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  // A re-connect from the Header rewrites the token; stop nagging once it is
  // usable again. Same 30s + storage-event pattern the Header badge uses.
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
      // Wait for the running read, then force a fresh one, so a manual
      // refresh always bypasses the cache without ever overlapping requests.
      await inflightRef.current;
    }
    const ok = await runRefresh({ force: true });
    if (ok && !stoppedRef.current) armTimer(POLL_MS);
    // snapshotRef still holds the previous object when the sheet came back
    // deep-equal, which is the correct current content either way.
    return ok ? snapshotRef.current : null;
  }, [armTimer, runRefresh]);

  const previewPush = useCallback(async (classes?: TimetableClassEntry[]): Promise<TimetablePushResult> => {
    const list = classes ?? classesRef.current ?? [];
    // The writer's dry run reads the public CSV export and plans in pure
    // logic, so a preview works even with no Google token. That lets a teacher
    // see exactly what would change before being asked to re-connect.
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
      // A write only ever comes from an explicit pushToSheet() call. An expired
      // token stops the push and asks for a reconnect - it never blocks the
      // local Firestore save, which has already happened by this point.
      if (isGoogleTokenExpired()) {
        setNeedsReconnect(true);
        return needsReconnectResult();
      }
      // Pre-flight: never write when there is nothing to write.
      const pre = await previewPush(list);
      if (pre.needsReconnect || !pre.ok || pre.cellCount === 0) return pre;
      try {
        const result = normalisePushResult(await syncTimetableToSheet(list, { dryRun: false }));
        if (result.needsReconnect) {
          setNeedsReconnect(true);
          return result;
        }
        if (result.ok) {
          // Re-read so the diff and the editor's conflict baseline describe
          // what is in the sheet now, not the pre-push state.
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

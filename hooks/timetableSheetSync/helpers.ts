import type { TimetableDiffEntry, TimetableSheetSnapshot } from '../../services/timetableSheetService';
import { diffTimetableAgainstSheet } from '../../services/timetableSheetService';
import type { TimetableClassEntry } from '../../services/timetable';
import type { TimetablePushResult } from './types';

/** Countdown resolution. 30s matches the Sheets token badge in the Header. */
export const COUNTDOWN_TICK_MS = 30000;

/** Consecutive failures before polling gives up and asks for a manual retry. */
export const MAX_CONSECUTIVE_FAILURES = 3;

/** Transport read timeout for reading 12 tabs sequentially. */
export const READ_TIMEOUT_MS = 60000;

/** Snapshot keys that describe when we read the sheet rather than what is in it. */
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

export function errToMessage(err: unknown): string {
  if (typeof err === 'string' && err) return err;
  if (err instanceof Error && err.message) return err.message;
  const rec = err as { message?: unknown; error?: { message?: unknown } } | null;
  if (rec && typeof rec.message === 'string' && rec.message) return rec.message;
  if (rec && rec.error && typeof rec.error.message === 'string') return rec.error.message;
  return 'Could not reach the timetable sheet.';
}

export function normaliseForSignature(value: unknown, depth: number): unknown {
  if (depth > 12) return null;
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.map((v) => normaliseForSignature(v, depth + 1));
  if (typeof value === 'object') {
    const src = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
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
 * Content fingerprint of a snapshot, ignoring fetch timestamps.
 */
export function timetableSheetSignature(snapshot: TimetableSheetSnapshot | null | undefined): string {
  if (!snapshot) return '';
  try {
    return JSON.stringify(normaliseForSignature(snapshot, 0)) ?? '';
  } catch {
    return '';
  }
}

export function diffSignature(entries: TimetableDiffEntry[]): string {
  try {
    return JSON.stringify(entries ?? []) ?? '';
  } catch {
    return '';
  }
}

export function labelOfTab(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const rec = value as Record<string, unknown>;
    for (const key of ['name', 'tab', 'tabName', 'label', 'classLabel']) {
      if (typeof rec[key] === 'string' && rec[key]) return rec[key] as string;
    }
  }
  return '';
}

export function readErrors(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((e) => errToMessage(e)).filter(Boolean);
  }
  if (typeof raw === 'string' && raw) return [raw];
  return [];
}

export function countOf(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (Array.isArray(raw)) return raw.length;
  return 0;
}

export function readSkipped(raw: unknown): { tabName: string; reason: string }[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      if (typeof entry === 'string') return { tabName: '', reason: entry };
      const rec = (entry ?? {}) as Record<string, unknown>;
      return { tabName: labelOfTab(rec), reason: typeof rec.reason === 'string' ? rec.reason : errToMessage(rec) };
    })
    .filter((s) => s.reason.length > 0);
}

export function readTabNames(src: Record<string, unknown>): string[] {
  const plan = src.plan as { writes?: unknown; timeWrites?: unknown } | undefined;
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

export function normalisePushResult(raw: unknown): TimetablePushResult {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const dryRun = src.dryRun !== false;
  const needsReconnect = src.needsReconnect === true;
  const tabLabels = readTabNames(src);
  const plan = src.plan as { writes?: unknown; timeWrites?: unknown } | undefined;
  const planned = countOf(plan?.writes) + countOf(plan?.timeWrites);
  const reported = countOf(src.cellsWritten);
  const cellCount = reported > 0 ? reported : planned;
  const skipped = readSkipped(src.skipped);
  const errors = readErrors(src.errors);
  const ok = src.ok === true && !needsReconnect;

  const scope = tabLabels.length > 0 ? ` in ${tabLabels.join(', ')}` : '';
  const skipNote = skipped.length > 0 ? ` ${skipped.length} tab${skipped.length === 1 ? '' : 's'} skipped.` : '';

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

export function needsReconnectResult(): TimetablePushResult {
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

export function failedPushResult(message: string): TimetablePushResult {
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

export function computeDiff(
  classes: TimetableClassEntry[] | undefined,
  snapshot: TimetableSheetSnapshot | null
): TimetableDiffEntry[] {
  if (!snapshot || !classes || classes.length === 0) return [];
  try {
    const result = diffTimetableAgainstSheet(classes, snapshot.classes ?? []);
    return Array.isArray(result) ? (result as TimetableDiffEntry[]) : [];
  } catch {
    return [];
  }
}

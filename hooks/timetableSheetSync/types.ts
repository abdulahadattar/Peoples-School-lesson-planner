import type { TimetableDiffEntry, TimetableSheetSnapshot } from '../../services/timetableSheetService';
import type { TimetableClassEntry } from '../../services/timetable';

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

/**
 * When the register should be re-read from Google Sheets.
 *
 * The app used to re-download the ENTIRE sheet after every single saved row, so
 * a teacher fixing 30 students triggered 30 full downloads. The sheet is shared
 * and changes slowly; re-reading it on a 12-hour cadence (plus an explicit
 * Refresh that always bypasses this) is enough to pick up another teacher's
 * sheet-side edits without paying for a download per keystroke.
 *
 * Kept in its own module, free of React and Firebase, so the rule is unit
 * testable and cannot quietly become "poll every time" again.
 */

export const LAST_PULL_KEY = 'phssj_sheet_last_pull_v1';

/** 12 hours. */
export const SHEET_PULL_INTERVAL_MS = 12 * 60 * 60 * 1000;

/**
 * How often an OPEN app checks whether the 12-hour window has elapsed.
 *
 * This is a timestamp comparison, not a network request: it costs nothing and
 * means a teacher who leaves the app open all day still picks up another
 * teacher's sheet-side edits once the window rolls over.
 */
export const SHEET_PULL_CHECK_MS = 5 * 60 * 1000;

function readLastPull(): number {
  try {
    const raw = localStorage.getItem(LAST_PULL_KEY);
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

/** Records that the register was just read successfully. */
export function markSheetPulled(now: number = Date.now()): void {
  try {
    localStorage.setItem(LAST_PULL_KEY, String(now));
  } catch {
    // Failing to record the timestamp must not fail the refresh that just
    // succeeded; the worst case is one extra download.
  }
}

export function lastSheetPullAt(): number {
  return readLastPull();
}

/**
 * True when the cached register is old enough to be worth re-reading.
 *
 * `force` is what a user pressing Refresh passes: an explicit request always
 * wins over the schedule. A missing or unreadable timestamp is treated as stale,
 * because the safe default is to trust the sheet rather than a local cache of
 * unknown age.
 */
export function shouldPullSheet(
  force: boolean = false,
  now: number = Date.now(),
): boolean {
  if (force) return true;
  const last = readLastPull();
  if (!last) return true;
  return now - last >= SHEET_PULL_INTERVAL_MS;
}

/** For a countdown or a "last updated" label. */
export function msUntilNextPull(now: number = Date.now()): number {
  const last = readLastPull();
  if (!last) return 0;
  return Math.max(0, last + SHEET_PULL_INTERVAL_MS - now);
}

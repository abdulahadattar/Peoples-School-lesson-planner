import React from 'react';
import { CloudUpload, CloudOff, RefreshCw, CheckCircle2, LogIn, AlertTriangle } from 'lucide-react';
import { useSheetSyncQueue } from '../../hooks/useSheetSyncQueue';
import { googleSignIn } from '../../services/googleAuth';

/**
 * The single place a teacher sees pending sheet changes, and the single place
 * they push them.
 *
 * Two behaviours here are deliberate:
 *
 *  1. One action. The Sheets token lasts about an hour, so a pending sync will
 *     often find it lapsed. Pressing Sync signs in and then continues on its own,
 *     rather than making the teacher find a second button afterwards.
 *  2. Reassurance is conditional and true. A record edit is only described as
 *     safe when it is genuinely stored: these edits live in Firestore, so
 *     "waiting" means visible to every teacher and every device, not merely
 *     cached in the browser that made the change.
 */
export const PendingSyncBanner: React.FC<{ className?: string }> = ({ className = '' }) => {
  const {
    pendingCount,
    sheetsConnected,
    syncing,
    lastResult,
    syncAll,
    refreshTokenState,
    droppedCount,
    queueNearlyFull,
    acknowledgeDropped,
  } = useSheetSyncQueue();
  const [reconnecting, setReconnecting] = React.useState(false);

  /**
   * Sync, signing in first when the Google token has lapsed.
   *
   * `syncAll` re-reads the token itself rather than trusting React state, so
   * continuing in the same tick as the sign-in is safe.
   */
  const handleSync = async () => {
    if (!sheetsConnected) {
      setReconnecting(true);
      let signedIn = false;
      try {
        const res = await googleSignIn();
        signedIn = !!res;
      } finally {
        setReconnecting(false);
        refreshTokenState();
      }
      // Dismissing the Google prompt is a deliberate cancel, not a failure, so
      // nothing is pushed and no error is shown.
      if (!signedIn) return;
    }
    await syncAll();
  };

  // A lost edit outranks everything else, and must survive the queue draining:
  // once the queue empties, "Everything is in sync" printed over a dropped edit
  // would be an outright falsehood.
  if (droppedCount > 0) {
    return (
      <div
        className={`flex flex-col gap-2 rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-900 sm:flex-row sm:items-center sm:justify-between ${className}`}
        role="alert"
        aria-live="assertive"
      >
        <div className="flex items-start gap-2">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-medium">
              {droppedCount} change{droppedCount === 1 ? '' : 's'} could not be queued for syncing and{' '}
              {droppedCount === 1 ? 'is' : 'are'} NOT in Google Sheets.
            </p>
            <p className="mt-0.5 opacity-80">
              The offline queue holds a limited number of changes, and these were beyond it. They are still in the
              app, but the sheet was never told. Re-enter them once you have reconnected, or check the register
              against the sheet before relying on it.
            </p>
            {lastResult && <p className="mt-1 opacity-70">{lastResult}</p>}
          </div>
        </div>
        <button
          type="button"
          onClick={acknowledgeDropped}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-rose-700 px-3 py-1.5 font-medium text-white transition hover:bg-rose-800 active:scale-95"
        >
          <CheckCircle2 size={12} aria-hidden="true" />
          I understand
        </button>
      </div>
    );
  }

  if (pendingCount === 0 && !lastResult) return null;

  const needsReconnect = pendingCount > 0 && !sheetsConnected;

  return (
    <div
      className={`flex flex-col gap-2 rounded-xl border px-3 py-2 text-xs sm:flex-row sm:items-center sm:justify-between ${
        needsReconnect
          ? 'border-amber-300 bg-amber-50 text-amber-900'
          : 'border-slate-200 bg-slate-50 text-slate-700'
      } ${className}`}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start gap-2">
        {needsReconnect ? (
          <CloudOff size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
        ) : pendingCount > 0 ? (
          <CloudUpload size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
        ) : (
          <CheckCircle2 size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
        )}
        <div>
          {pendingCount > 0 ? (
            <p className="font-medium">
              {pendingCount} change{pendingCount === 1 ? '' : 's'} saved and shared with every teacher, but not yet in Google Sheets.
            </p>
          ) : (
            <p className="font-medium">Everything is in sync with Google Sheets.</p>
          )}
          <p className="mt-0.5 opacity-80">
            {needsReconnect
              ? 'Your changes are saved and visible to every teacher. Press Sync to Sheet - Google will ask you to sign in first, then it writes them.'
              : 'Press Sync to Sheet to write every waiting change to the sheet in one go.'}
          </p>
          {queueNearlyFull && (
            <p className="mt-1 font-medium opacity-90">
              The offline queue is nearly full. Sync soon - past its limit, the oldest queued attendance changes
              are dropped and never reach the sheet.
            </p>
          )}
          {lastResult && <p className="mt-1 opacity-70">{lastResult}</p>}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={() => void handleSync()}
          disabled={syncing || reconnecting || pendingCount === 0}
          className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-1.5 font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
        >
          {needsReconnect ? (
            <LogIn size={12} className={reconnecting ? 'animate-pulse' : ''} aria-hidden="true" />
          ) : (
            <RefreshCw size={12} className={syncing ? 'animate-spin' : ''} aria-hidden="true" />
          )}
          {reconnecting
            ? 'Opening Google...'
            : syncing
              ? 'Syncing...'
              : needsReconnect
                ? 'Sign in & Sync'
                : 'Sync to Sheet'}
        </button>
      </div>
    </div>
  );
};

export default PendingSyncBanner;

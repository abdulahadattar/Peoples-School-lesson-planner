import React from 'react';
import { CloudUpload, CloudOff, RefreshCw, CheckCircle2, LogIn } from 'lucide-react';
import { useSheetSyncQueue } from '../../hooks/useSheetSyncQueue';
import { googleSignIn } from '../../services/googleAuth';

/**
 * Surfaces the pending Google Sheets sync queue in the view that produced the
 * change, so a teacher who edits while Google is signed out can see that the
 * work is safe, see how much is waiting, and push it once they reconnect.
 *
 * Kept deliberately small: the local save already succeeded, this only reports
 * the gap between the app and the sheet.
 */
export const PendingSyncBanner: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { pendingCount, sheetsConnected, syncing, lastResult, syncAll, refreshTokenState } = useSheetSyncQueue();
  const [reconnecting, setReconnecting] = React.useState(false);

  // The token expiry has to be recoverable from here. The banner is where a
  // teacher discovers their change has not reached the sheet, so it is the only
  // place guaranteed to be on screen at that moment - making them hunt up to the
  // header (and on narrow screens the badge collapses to a bare "!") left the
  // queue with no way out.
  const handleReconnect = async () => {
    setReconnecting(true);
    try {
      await googleSignIn();
      refreshTokenState();
    } finally {
      setReconnecting(false);
    }
  };

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
              {pendingCount} change{pendingCount === 1 ? '' : 's'} saved in the app but not yet in Google Sheets.
            </p>
          ) : (
            <p className="font-medium">Everything is in sync with Google Sheets.</p>
          )}
          <p className="mt-0.5 opacity-80">
            {needsReconnect
              ? 'Reconnect Google, then press Sync. Nothing is lost - your work is saved in the app and is waiting here.'
              : 'Press Sync to push the waiting changes to the sheet.'}
          </p>
          {lastResult && <p className="mt-1 opacity-70">{lastResult}</p>}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {needsReconnect && (
          <button
            type="button"
            onClick={() => void handleReconnect()}
            disabled={reconnecting}
            className="inline-flex items-center gap-1.5 rounded-md border border-amber-400 bg-white px-3 py-1.5 font-medium text-amber-900 transition hover:bg-amber-100 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <LogIn size={12} className={reconnecting ? 'animate-pulse' : ''} aria-hidden="true" />
            {reconnecting ? 'Opening Google...' : 'Reconnect Google'}
          </button>
        )}
        <button
          type="button"
          onClick={() => void syncAll()}
          disabled={needsReconnect || syncing || pendingCount === 0}
          className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-1.5 font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
        >
          <RefreshCw size={12} className={syncing ? 'animate-spin' : ''} aria-hidden="true" />
          {syncing ? 'Syncing...' : 'Sync'}
        </button>
      </div>
    </div>
  );
};

export default PendingSyncBanner;

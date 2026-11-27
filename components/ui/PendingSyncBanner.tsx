import React from 'react';
import { CloudUpload, CloudOff, RefreshCw, CheckCircle2, LogIn, AlertTriangle } from 'lucide-react';
import { useSheetSyncQueue } from '../../hooks/useSheetSyncQueue';
import { googleSignIn } from '../../services/googleAuth';

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
      if (!signedIn) return;
    }
    await syncAll();
  };

  if (droppedCount > 0) {
    return (
      <div
        className={`flex flex-col gap-2 rounded-xl border border-rose-300 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-950/30 px-3.5 py-2.5 text-xs text-rose-900 dark:text-rose-200 sm:flex-row sm:items-center sm:justify-between print:hidden ${className}`}
        role="alert"
        aria-live="assertive"
      >
        <div className="flex items-center gap-2 min-w-0">
          <AlertTriangle size={15} className="shrink-0 text-rose-600 dark:text-rose-400" aria-hidden="true" />
          <p className="font-medium leading-snug">
            {droppedCount} offline change{droppedCount === 1 ? '' : 's'} could not be queued for Google Sheets.
            {lastResult ? ` (${lastResult})` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={acknowledgeDropped}
          className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-rose-700 px-3 py-1.5 font-semibold text-white transition hover:bg-rose-800 active:scale-95 cursor-pointer"
        >
          <CheckCircle2 size={13} aria-hidden="true" />
          <span>Acknowledge</span>
        </button>
      </div>
    );
  }

  if (pendingCount === 0 && !lastResult) return null;

  const needsReconnect = pendingCount > 0 && !sheetsConnected;

  return (
    <div
      className={`flex flex-col gap-2 rounded-xl border px-3.5 py-2.5 text-xs sm:flex-row sm:items-center sm:justify-between print:hidden ${
        needsReconnect
          ? 'border-amber-300/80 dark:border-amber-500/30 bg-amber-50/90 dark:bg-amber-950/30 text-amber-950 dark:text-amber-100'
          : 'border-brand-border bg-white dark:bg-brand-surface text-brand-text-primary'
      } ${className}`}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-2 min-w-0">
        {needsReconnect ? (
          <CloudOff size={15} className="shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
        ) : pendingCount > 0 ? (
          <CloudUpload size={15} className="shrink-0 text-blue-600 dark:text-blue-400" aria-hidden="true" />
        ) : (
          <CheckCircle2 size={15} className="shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
        )}
        <div className="min-w-0">
          <p className="font-medium leading-snug">
            {pendingCount > 0
              ? `${pendingCount} change${pendingCount === 1 ? '' : 's'} waiting to sync to Google Sheets.`
              : 'All changes synced to Google Sheets.'}
            {queueNearlyFull ? ' Many unsynced changes waiting — please sync soon.' : ''}
          </p>
          {lastResult && <p className="mt-0.5 text-[11px] opacity-75">{lastResult}</p>}
        </div>
      </div>

      {pendingCount > 0 && (
        <button
          type="button"
          onClick={() => void handleSync()}
          disabled={syncing || reconnecting}
          className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-slate-900 dark:bg-slate-100 px-3 py-1.5 font-semibold text-white dark:text-slate-900 transition hover:opacity-90 disabled:opacity-50 cursor-pointer"
        >
          {needsReconnect ? (
            <LogIn size={13} aria-hidden="true" />
          ) : (
            <RefreshCw size={13} className={syncing ? 'animate-spin' : ''} aria-hidden="true" />
          )}
          <span>
            {reconnecting
              ? 'Signing in...'
              : syncing
                ? 'Syncing...'
                : needsReconnect
                  ? 'Sign in & Sync'
                  : 'Sync to Sheet'}
          </span>
        </button>
      )}
    </div>
  );
};

export default PendingSyncBanner;

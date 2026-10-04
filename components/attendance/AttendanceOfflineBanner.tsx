import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export interface AttendanceOfflineBannerProps {
  loadError: string;
  selectedDate: string;
  isLoading: boolean;
  onRetry: () => void;
}

export const AttendanceOfflineBanner: React.FC<AttendanceOfflineBannerProps> = ({
  loadError,
  selectedDate,
  isLoading,
  onRetry,
}) => {
  return (
    <div
      role="alert"
      className="flex items-start gap-3.5 p-4 sm:p-5 rounded-2xl border border-amber-300/80 dark:border-amber-500/30 bg-amber-50/90 dark:bg-amber-950/30 text-amber-950 dark:text-amber-100 shadow-soft backdrop-blur-xs transition-all"
    >
      <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/50 border border-amber-300/60 dark:border-amber-700/50 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0 mt-0.5 shadow-xs">
        <AlertTriangle className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md bg-amber-200/80 dark:bg-amber-900/60 text-amber-900 dark:text-amber-200 border border-amber-300 dark:border-amber-700/60 uppercase tracking-wider">
            Offline Mode
          </span>
          <p className="text-sm font-bold text-amber-950 dark:text-amber-100">
            Working offline — {selectedDate} was not loaded from the server
          </p>
        </div>
        <p className="text-xs mt-2 leading-relaxed text-amber-900/90 dark:text-amber-200/90 font-medium">
          {loadError}
        </p>
        <p className="text-xs mt-2 leading-relaxed text-amber-900/80 dark:text-amber-200/80">
          The register below is blank because of this, not because nothing was recorded. You can
          still save: this will overwrite {selectedDate} if a record already exists, or create it if
          it does not. Figures are stored on this device and sync to the server when it is reachable.
        </p>
        <div className="mt-3.5 flex items-center gap-3">
          <button
            type="button"
            onClick={onRetry}
            disabled={isLoading}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-xl bg-amber-600 hover:bg-amber-700 text-white transition-all shadow-xs active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>{isLoading ? 'Retrying...' : `Retry loading ${selectedDate}`}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

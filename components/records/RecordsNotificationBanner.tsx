import React from 'react';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';

export interface RecordsNotificationBannerProps {
  notification: { type: 'success' | 'error' | 'info'; message: string } | null;
  onDismiss: () => void;
}

export const RecordsNotificationBanner: React.FC<RecordsNotificationBannerProps> = ({
  notification,
  onDismiss,
}) => {
  if (!notification) return null;
  return (
    <div
      className={`p-4 rounded-xl flex items-center justify-between text-xs font-semibold ${
        notification.type === 'success'
          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800/50'
          : notification.type === 'error'
          ? 'bg-rose-50 text-rose-800 border border-rose-200 dark:bg-rose-950/30 dark:text-rose-300 dark:border-rose-800/50'
          : 'bg-sky-50 text-sky-800 border border-sky-200 dark:bg-sky-950/30 dark:text-sky-300 dark:border-sky-800/50'
      }`}
    >
      <div className="flex items-center gap-2">
        {notification.type === 'success' ? (
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
        ) : (
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
        )}
        <span>{notification.message}</span>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="p-1 rounded-md hover:bg-black/5 transition-colors"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};

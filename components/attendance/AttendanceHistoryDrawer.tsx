import React from 'react';
import { Calendar, History, FileSpreadsheet, CheckCircle2, RefreshCw } from 'lucide-react';
import { BaseModal } from '../ui/BaseModal';
import {
  getAttendanceTextColor as getTextColor,
  getAttendanceBadgeBg as getBadgeBg,
} from './attendanceUtils';

export interface AttendanceHistoryItem {
  date: string;
  totalPresent: number;
  percentage: number;
  syncedToSheetAt?: number;
}

export interface AttendanceHistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  historyList: AttendanceHistoryItem[];
  selectedDate: string;
  totalEnrolled: number;
  onSelectDate: (date: string) => void;
  onSyncDate?: (date: string) => Promise<void>;
  syncingDate?: string | null;
}

export const AttendanceHistoryDrawer: React.FC<AttendanceHistoryDrawerProps> = React.memo(({
  isOpen,
  onClose,
  historyList,
  selectedDate,
  totalEnrolled,
  onSelectDate,
  onSyncDate,
  syncingDate,
}) => {
  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="lg"
      icon={
        <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center border border-blue-200/60 dark:border-blue-900/60">
          <History className="w-4 h-4" />
        </div>
      }
      title="Attendance Register Archive"
      subtitle="Saved in application database. Push to Google Sheet on demand."
    >
      <div className="space-y-2.5 max-h-[60vh] overflow-y-auto custom-scrollbar pr-1">
        {historyList.length === 0 ? (
          <div className="text-center py-8 text-xs text-slate-500">
            No previous dates recorded yet. Click &quot;Save Attendance&quot; to archive today&apos;s records.
          </div>
        ) : (
          historyList.map((item) => {
            const isSelected = item.date === selectedDate;
            const isSyncing = syncingDate === item.date;
            const isSynced = Boolean(item.syncedToSheetAt);

            return (
              <div
                key={item.date}
                className={`p-3 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                  isSelected
                    ? 'bg-blue-500/10 border-blue-500 text-blue-600 dark:text-blue-400 font-bold'
                    : 'bg-slate-50 dark:bg-slate-800/40 hover:bg-slate-100 dark:hover:bg-slate-800 border-black/[0.06] dark:border-white/[0.08] text-slate-800 dark:text-slate-200'
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    onSelectDate(item.date);
                    onClose();
                  }}
                  className="flex-1 text-left flex items-center gap-3 cursor-pointer"
                >
                  <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
                  <div>
                    <div className="text-xs font-bold flex items-center gap-2">
                      <span>{item.date}</span>
                      {isSelected && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-blue-500 text-white font-normal">
                          Active Date
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-500">
                      {new Date(item.date).toLocaleDateString('en-GB', {
                        weekday: 'short',
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </div>
                  </div>
                </button>

                <div className="flex flex-wrap items-center gap-2 sm:gap-3 self-end sm:self-center">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    {item.totalPresent} / {totalEnrolled}
                  </span>
                  <span
                    className={`text-xs font-bold px-2 py-0.5 rounded border ${getBadgeBg(
                      item.percentage
                    )} ${getTextColor(item.percentage)}`}
                  >
                    {item.percentage}%
                  </span>

                  {/* Sheet Sync Status Badge / Button */}
                  {onSyncDate && (
                    <button
                      type="button"
                      onClick={() => onSyncDate(item.date)}
                      disabled={isSyncing}
                      title={
                        isSynced
                          ? `Synced to Google Sheet at ${new Date(item.syncedToSheetAt!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}. Click to re-sync.`
                          : 'Click to sync this date to Google Sheet'
                      }
                      className={`inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
                        isSynced
                          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800 hover:bg-emerald-100'
                          : 'bg-brand-bg text-brand-text-secondary hover:text-emerald-600 hover:bg-emerald-50 border-brand-border'
                      }`}
                    >
                      {isSyncing ? (
                        <RefreshCw className="w-3 h-3 animate-spin" />
                      ) : isSynced ? (
                        <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <FileSpreadsheet className="w-3 h-3 text-slate-400" />
                      )}
                      <span>
                        {isSyncing
                          ? 'Syncing...'
                          : isSynced
                          ? 'Synced'
                          : 'Sync Sheet'}
                      </span>
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </BaseModal>
  );
});

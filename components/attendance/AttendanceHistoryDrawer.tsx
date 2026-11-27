import React from 'react';
import { Calendar, History } from 'lucide-react';
import { BaseModal } from '../ui/BaseModal';
import {
  getAttendanceTextColor as getTextColor,
  getAttendanceBadgeBg as getBadgeBg,
} from './attendanceUtils';

export interface AttendanceHistoryItem {
  date: string;
  totalPresent: number;
  percentage: number;
}

export interface AttendanceHistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  historyList: AttendanceHistoryItem[];
  selectedDate: string;
  totalEnrolled: number;
  onSelectDate: (date: string) => void;
}

export const AttendanceHistoryDrawer: React.FC<AttendanceHistoryDrawerProps> = React.memo(({
  isOpen,
  onClose,
  historyList,
  selectedDate,
  totalEnrolled,
  onSelectDate,
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
      title="Attendance History"
      subtitle="Select a date to review or export."
    >
      <div className="space-y-2.5 max-h-[60vh] overflow-y-auto custom-scrollbar pr-1">
        {historyList.length === 0 ? (
          <div className="text-center py-8 text-xs text-slate-500">
            No previous dates recorded yet.
          </div>
        ) : (
          historyList.map((item) => {
            const isSelected = item.date === selectedDate;

            return (
              <button
                key={item.date}
                type="button"
                onClick={() => {
                  onSelectDate(item.date);
                  onClose();
                }}
                className={`w-full p-3 rounded-xl border transition-[color,background-color,border-color,box-shadow] flex items-center justify-between gap-3 text-left cursor-pointer ${
                  isSelected
                    ? 'bg-brand-primary/10 border-brand-primary ring-1 ring-brand-primary/30 text-brand-primary dark:text-blue-300'
                    : 'bg-slate-50 dark:bg-slate-800/40 hover:bg-slate-100 dark:hover:bg-slate-800 border-black/[0.06] dark:border-white/[0.08] text-slate-800 dark:text-slate-200'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Calendar className={`w-4 h-4 shrink-0 ${isSelected ? 'text-brand-primary dark:text-blue-400' : 'text-slate-400'}`} />
                  <div className="min-w-0">
                    <div className="text-xs font-bold flex items-center gap-2 tabular-nums">
                      <span>{item.date}</span>
                      {isSelected && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand-primary text-white font-semibold">
                          Active Date
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      {new Date(item.date).toLocaleDateString('en-GB', {
                        weekday: 'short',
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 shrink-0">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 tabular-nums">
                    {item.totalPresent} / {totalEnrolled}
                  </span>
                  <span
                    className={`text-xs font-bold px-2 py-0.5 rounded border tabular-nums ${getBadgeBg(
                      item.percentage
                    )} ${getTextColor(item.percentage)}`}
                  >
                    {item.percentage}%
                  </span>
                </div>
              </button>
            );
          })
        )}
      </div>
    </BaseModal>
  );
});

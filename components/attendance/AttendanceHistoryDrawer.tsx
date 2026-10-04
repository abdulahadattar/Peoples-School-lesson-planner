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
      maxWidth="md"
      icon={
        <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center border border-blue-200/60 dark:border-blue-900/60">
          <History className="w-4 h-4" />
        </div>
      }
      title="Attendance Register Archive"
      subtitle="Click any date to inspect or edit the recorded headcount"
    >
      <div className="space-y-2 max-h-[60vh] overflow-y-auto custom-scrollbar pr-1">
        {historyList.length === 0 ? (
          <div className="text-center py-8 text-xs text-slate-500">
            No previous dates recorded yet. Click &quot;Save Attendance&quot; to archive today&apos;s records.
          </div>
        ) : (
          historyList.map((item) => (
            <button
              type="button"
              key={item.date}
              onClick={() => {
                onSelectDate(item.date);
                onClose();
              }}
              className={`w-full text-left p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between active:scale-[0.99] ${
                item.date === selectedDate
                  ? 'bg-blue-500/10 border-blue-500 text-blue-600 dark:text-blue-400 font-bold'
                  : 'bg-slate-50 dark:bg-slate-800/40 hover:bg-slate-100 dark:hover:bg-slate-800 border-black/[0.06] dark:border-white/[0.08] text-slate-800 dark:text-slate-200'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Calendar className="w-4 h-4 text-slate-400" />
                <div>
                  <div className="text-xs font-bold">{item.date}</div>
                  <div className="text-[10px] text-slate-500">
                    {new Date(item.date).toLocaleDateString('en-GB', {
                      weekday: 'short',
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold">
                  {item.totalPresent} / {totalEnrolled}
                </span>
                <span
                  className={`text-xs font-bold px-2 py-0.5 rounded border ${getBadgeBg(
                    item.percentage
                  )} ${getTextColor(item.percentage)}`}
                >
                  {item.percentage}%
                </span>
              </div>
            </button>
          ))
        )}
      </div>
    </BaseModal>
  );
});

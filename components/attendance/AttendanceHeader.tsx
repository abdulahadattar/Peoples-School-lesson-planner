import React from 'react';
import { UserCheck, RefreshCw, ChevronLeft, ChevronRight, Calendar, History } from 'lucide-react';
import { getTodayDateString } from '../../utils/dateHelpers';

export interface AttendanceHeaderProps {
  selectedDate: string;
  onSelectDate: (date: string) => void;
  isSyncingEnrollment: boolean;
  onRefreshEnrollments: (force?: boolean) => Promise<void>;
  onOpenHistoryDrawer: () => void;
}

export const AttendanceHeader: React.FC<AttendanceHeaderProps> = ({
  selectedDate,
  onSelectDate,
  isSyncingEnrollment,
  onRefreshEnrollments,
  onOpenHistoryDrawer,
}) => {
  const changeDateBy = (days: number) => {
    const [y, m, d] = selectedDate.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    dateObj.setDate(dateObj.getDate() + days);
    const nextY = dateObj.getFullYear();
    const nextM = String(dateObj.getMonth() + 1).padStart(2, '0');
    const nextD = String(dateObj.getDate()).padStart(2, '0');
    onSelectDate(`${nextY}-${nextM}-${nextD}`);
  };

  const isToday = selectedDate === getTodayDateString();

  return (
    <div className="glass-card rounded-2xl p-5 border border-brand-border shadow-soft flex flex-col lg:flex-row lg:items-center justify-between gap-4">
      <div className="flex items-center gap-3.5">
        <div className="w-12 h-12 rounded-2xl bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center text-brand-primary shadow-xs shrink-0">
          <UserCheck className="w-6 h-6" />
        </div>
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-xl font-extrabold text-brand-text-primary tracking-tight">
              Daily Student Attendance
            </h2>
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-md bg-brand-primary/10 text-brand-primary border border-brand-primary/20">
              ECCE to Grade 12
            </span>
          </div>
          <p className="text-xs text-brand-text-secondary mt-0.5 flex flex-wrap items-center gap-2">
            <span>Saved to database/app storage. Synced to Google Sheet on demand.</span>
            <button
              onClick={() => onRefreshEnrollments(true)}
              disabled={isSyncingEnrollment}
              className="inline-flex items-center gap-1 min-h-[28px] px-2 rounded-lg hover:bg-brand-bg active:bg-brand-primary/15 hover:text-brand-primary transition-colors disabled:opacity-50 cursor-pointer"
              title="Force refresh live enrollments from Google Sheets"
            >
              <RefreshCw className={`w-3 h-3 ${isSyncingEnrollment ? 'animate-spin' : ''}`} />
              {isSyncingEnrollment ? 'Syncing...' : 'Sync Enrollments'}
            </button>
          </p>
        </div>
      </div>

      {/* Date Selector & Navigation Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center bg-brand-surface rounded-xl border border-brand-border p-1 shadow-xs">
          <button
            type="button"
            onClick={() => changeDateBy(-1)}
            title="Previous Day"
            aria-label="Previous Day"
            className="min-w-[40px] min-h-[40px] flex items-center justify-center text-brand-text-secondary hover:text-brand-text-primary hover:bg-brand-bg active:bg-brand-primary/15 rounded-lg transition-colors cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-1.5 px-2.5">
            <Calendar className="w-3.5 h-3.5 text-brand-primary shrink-0" />
            <input
              type="date"
              value={selectedDate}
              onChange={e => onSelectDate(e.target.value)}
              className="text-xs font-semibold text-brand-text-primary bg-transparent focus:outline-none cursor-pointer min-h-[36px]"
            />
          </div>

          <button
            type="button"
            onClick={() => changeDateBy(1)}
            title="Next Day"
            aria-label="Next Day"
            className="min-w-[40px] min-h-[40px] flex items-center justify-center text-brand-text-secondary hover:text-brand-text-primary hover:bg-brand-bg active:bg-brand-primary/15 rounded-lg transition-colors cursor-pointer"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <button
          type="button"
          onClick={() => onSelectDate(getTodayDateString())}
          className={`px-3 py-2 text-xs font-semibold rounded-xl border transition-all cursor-pointer ${
            isToday
              ? 'bg-brand-primary text-white border-brand-primary shadow-xs'
              : 'bg-brand-surface text-brand-text-secondary border-brand-border hover:text-brand-text-primary hover:bg-brand-bg'
          }`}
        >
          Today
        </button>

        <button
          type="button"
          onClick={onOpenHistoryDrawer}
          title="View Past Attendance History & Google Sheet Sync Status"
          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl bg-brand-surface text-brand-text-primary border border-brand-border hover:bg-brand-bg transition-colors shadow-xs cursor-pointer"
        >
          <History className="w-3.5 h-3.5 text-brand-text-secondary" />
          <span>Archive & Sync</span>
        </button>
      </div>
    </div>
  );
};

import React from 'react';
import { UserCheck, UserX, ShieldCheck, RefreshCw, Users } from 'lucide-react';
import { SchoolAttendanceSummary } from '../../services/attendanceService';
import { SchoolConfig } from '../../services/schoolConfigService';
import { getAttendanceProgressColor as getProgressColor } from './attendanceUtils';
import { formatSchoolDate } from '../../utils/dateHelpers';
import { StatTile } from '../ui/StatTile';

export interface AttendanceSummaryCardsProps {
  schoolSummary: SchoolAttendanceSummary;
  selectedDate: string;
  schoolConfig?: SchoolConfig;
  isAdmin: boolean;
  isSyncingEnrollment: boolean;
  onOpenEnrollments: () => void;
  onSaveConfig: (config: SchoolConfig) => Promise<void>;
  showToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
}

export const AttendanceSummaryCards: React.FC<AttendanceSummaryCardsProps> = React.memo(({
  schoolSummary,
  selectedDate,
  schoolConfig,
  isAdmin,
  isSyncingEnrollment,
  onOpenEnrollments,
  onSaveConfig,
  showToast,
}) => {
  return (
    <div className="glass-card rounded-2xl p-5 border border-black/[0.06] dark:border-white/[0.08] shadow-soft space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-black/[0.06] dark:border-white/[0.08] pb-3">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900 dark:text-white">
            Total Attendance Overview
          </h3>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            ({formatSchoolDate(selectedDate, 'weekday')})
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs text-slate-500 dark:text-slate-400">
          <span>
            Active Roster: <strong className="text-slate-900 dark:text-white">{schoolSummary.totalEnrolled}</strong>
          </span>

          {/* Admin Enrollment Source Mode Toggle */}
          {schoolConfig && (
            <div className="inline-flex items-center rounded-xl bg-slate-100 dark:bg-slate-800 p-0.5 border border-slate-200 dark:border-slate-700 shadow-2xs">
              <button
                type="button"
                onClick={async () => {
                  if (schoolConfig.enrollmentMode !== 'manual') {
                    if (isAdmin) {
                      await onSaveConfig({ ...schoolConfig, enrollmentMode: 'manual' });
                      showToast('Switched enrollment source to Manual School Register');
                    } else {
                      showToast('Admin privilege required to switch global enrollment mode', 'info');
                    }
                  }
                }}
                className={`px-2 py-1 min-h-[32px] rounded-lg text-[10px] font-bold transition-all active:scale-[0.97] cursor-pointer ${
                  schoolConfig.enrollmentMode === 'manual'
                    ? 'bg-white dark:bg-slate-900 text-primary shadow-2xs'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
                title="Use configured manual enrollment register"
              >
                Manual
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (schoolConfig.enrollmentMode !== 'google_sheet') {
                    if (isAdmin) {
                      await onSaveConfig({ ...schoolConfig, enrollmentMode: 'google_sheet' });
                      showToast('Switched enrollment source to Google Sheet Live Extract');
                    } else {
                      showToast('Admin privilege required to switch global enrollment mode', 'info');
                    }
                  }
                }}
                className={`px-2 py-1 min-h-[32px] rounded-lg text-[10px] font-bold transition-all active:scale-[0.97] cursor-pointer ${
                  schoolConfig.enrollmentMode === 'google_sheet'
                    ? 'bg-emerald-600 text-white shadow-2xs'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
                title="Extract live class counts from Google Sheet records"
              >
                Sheet Sync
              </button>
            </div>
          )}

          <button
            type="button"
            id="header-edit-enrollments-btn"
            onClick={onOpenEnrollments}
            className="inline-flex items-center justify-center gap-1 min-h-[32px] text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 active:bg-blue-200/80 bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 px-2.5 py-1 rounded-lg border border-blue-200 dark:border-blue-800 transition-colors cursor-pointer"
            title="Official school enrollment configuration"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            <span>Enrollments</span>
          </button>
          {isSyncingEnrollment && (
            <span className="inline-flex items-center gap-1 text-[10px] text-primary">
              <RefreshCw className="w-3 h-3 animate-spin" /> Syncing
            </span>
          )}
        </div>
      </div>

      {/* Big Proportional Whole School Progress Bar */}
      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <div className="flex items-baseline gap-2">
            <span className="text-3xl sm:text-4xl font-black text-slate-900 dark:text-white tracking-tight font-mono">
              {schoolSummary.overallPercentage}%
            </span>
            <span className="text-xs sm:text-sm font-semibold text-slate-500 dark:text-slate-400">
              Total Attendance
            </span>
          </div>

          <div className="text-right">
            <span className="text-base sm:text-lg font-bold text-slate-900 dark:text-white font-mono">
              {schoolSummary.totalPresent}{' '}
              <span className="text-xs font-normal text-slate-500 dark:text-slate-400">/ {schoolSummary.totalEnrolled} Present</span>
            </span>
          </div>
        </div>

        {/* Proportional Bar */}
        <div className="w-full h-4 sm:h-5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden p-0.5 border border-slate-200 dark:border-slate-700">
          <div
            className={`h-full rounded-full transition-all duration-500 ${getProgressColor(schoolSummary.overallPercentage)}`}
            style={{ width: `${Math.min(100, schoolSummary.overallPercentage)}%` }}
          />
        </div>
      </div>

      {/* 4 Key Metric Tiles using reusable StatTile */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-1">
        <StatTile
          label="Total Present"
          value={schoolSummary.totalPresent}
          subtext={`${schoolSummary.overallPercentage}% of school`}
          icon={UserCheck}
          variant="emerald"
        />
        <StatTile
          label="Boys Present"
          value={`${schoolSummary.presentBoys} / ${schoolSummary.enrolledBoys}`}
          subtext={`${schoolSummary.boysPercentage}% boys attendance`}
          icon={Users}
          variant="blue"
        />
        <StatTile
          label="Girls Present"
          value={`${schoolSummary.presentGirls} / ${schoolSummary.enrolledGirls}`}
          subtext={`${schoolSummary.girlsPercentage}% girls attendance`}
          icon={Users}
          variant="purple"
        />
        <StatTile
          label="Total Absent"
          value={schoolSummary.totalAbsent}
          subtext={`B: ${schoolSummary.absentBoys} | G: ${schoolSummary.absentGirls}`}
          icon={UserX}
          variant="rose"
        />
      </div>
    </div>
  );
});

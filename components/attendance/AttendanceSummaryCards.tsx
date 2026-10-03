import React from 'react';
import { UserCheck, UserX, ShieldCheck, RefreshCw } from 'lucide-react';
import { SchoolAttendanceSummary } from '../../services/attendanceService';
import { SchoolConfig } from '../../services/schoolConfigService';

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
  const getProgressColor = (pct: number) => {
    if (pct >= 90) return 'bg-emerald-500';
    if (pct >= 80) return 'bg-blue-500';
    if (pct >= 70) return 'bg-amber-500';
    return 'bg-rose-500';
  };

  return (
    <div className="glass-card rounded-2xl p-5 border border-brand-border shadow-soft space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-brand-border/60 pb-3">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          <h3 className="text-sm font-bold uppercase tracking-wider text-brand-text-primary">
            Total Attendance Overview
          </h3>
          <span className="text-xs text-brand-text-secondary">
            ({new Date(selectedDate).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })})
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs text-brand-text-secondary">
          <span>
            Active Roster: <strong className="text-brand-text-primary">{schoolSummary.totalEnrolled}</strong>
          </span>

          {/* Admin Enrollment Source Mode Toggle */}
          {schoolConfig && (
            <div className="inline-flex items-center rounded-xl bg-slate-100 dark:bg-slate-800 p-0.5 border border-brand-border shadow-xs">
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
                    ? 'bg-white dark:bg-brand-surface text-brand-primary shadow-xs'
                    : 'text-brand-text-secondary hover:text-brand-text-primary'
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
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-brand-text-secondary hover:text-brand-text-primary'
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
            className="inline-flex items-center justify-center gap-1 min-h-[32px] text-[11px] font-semibold text-blue-600 hover:text-blue-700 active:bg-blue-200/80 bg-blue-50/80 hover:bg-blue-100/80 px-2 py-1 rounded-md border border-blue-200 transition-colors cursor-pointer"
            title="Official school enrollment configuration"
          >
            <ShieldCheck className="w-3 h-3 text-blue-600" />
            <span>Enrollments</span>
          </button>
          {isSyncingEnrollment && (
            <span className="inline-flex items-center gap-1 text-[10px] text-brand-primary">
              <RefreshCw className="w-3 h-3 animate-spin" /> Syncing
            </span>
          )}
        </div>
      </div>

      {/* Big Proportional Whole School Progress Bar */}
      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <div className="flex items-baseline gap-2">
            <span className="text-3xl sm:text-4xl font-black text-brand-text-primary tracking-tight">
              {schoolSummary.overallPercentage}%
            </span>
            <span className="text-xs sm:text-sm font-semibold text-brand-text-secondary">
              Total Attendance
            </span>
          </div>

          <div className="text-right">
            <span className="text-base sm:text-lg font-bold text-brand-text-primary">
              {schoolSummary.totalPresent}{' '}
              <span className="text-xs font-normal text-brand-text-secondary">/ {schoolSummary.totalEnrolled} Present</span>
            </span>
          </div>
        </div>

        {/* Proportional Bar */}
        <div className="w-full h-4 sm:h-5 bg-brand-bg rounded-full overflow-hidden p-0.5 border border-brand-border">
          <div
            className={`h-full rounded-full transition-all duration-500 ${getProgressColor(schoolSummary.overallPercentage)}`}
            style={{ width: `${Math.min(100, schoolSummary.overallPercentage)}%` }}
          />
        </div>
      </div>

      {/* 4 Key Metric Tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-1">
        {/* Total Present */}
        <div className="bg-brand-surface/80 rounded-xl p-3 border border-brand-border">
          <div className="flex items-center justify-between text-xs text-brand-text-secondary mb-1">
            <span>Total Present</span>
            <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
          </div>
          <div className="text-lg font-bold text-brand-text-primary">
            {schoolSummary.totalPresent}
          </div>
          <div className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium mt-0.5">
            {schoolSummary.overallPercentage}% of school
          </div>
        </div>

        {/* Boys Present */}
        <div className="bg-brand-surface/80 rounded-xl p-3 border border-brand-border">
          <div className="flex items-center justify-between text-xs text-brand-text-secondary mb-1">
            <span>Boys Present</span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300">
              Boys
            </span>
          </div>
          <div className="text-lg font-bold text-brand-text-primary">
            {schoolSummary.presentBoys}{' '}
            <span className="text-xs text-brand-text-secondary font-normal">/ {schoolSummary.enrolledBoys}</span>
          </div>
          <div className="text-[11px] text-blue-700 dark:text-blue-400 font-medium mt-0.5">
            {schoolSummary.boysPercentage}% boys attendance
          </div>
        </div>

        {/* Girls Present */}
        <div className="bg-brand-surface/80 rounded-xl p-3 border border-brand-border">
          <div className="flex items-center justify-between text-xs text-brand-text-secondary mb-1">
            <span>Girls Present</span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-pink-100 dark:bg-pink-950/60 text-pink-700 dark:text-pink-300">
              Girls
            </span>
          </div>
          <div className="text-lg font-bold text-brand-text-primary">
            {schoolSummary.presentGirls}{' '}
            <span className="text-xs text-brand-text-secondary font-normal">/ {schoolSummary.enrolledGirls}</span>
          </div>
          <div className="text-[11px] text-pink-700 dark:text-pink-400 font-medium mt-0.5">
            {schoolSummary.girlsPercentage}% girls attendance
          </div>
        </div>

        {/* Total Absent */}
        <div className="bg-brand-surface/80 rounded-xl p-3 border border-brand-border">
          <div className="flex items-center justify-between text-xs text-brand-text-secondary mb-1">
            <span>Total Absent</span>
            <UserX className="w-3.5 h-3.5 text-rose-600" />
          </div>
          <div className="text-lg font-bold text-rose-600">
            {schoolSummary.totalAbsent}
          </div>
          <div className="text-[11px] text-brand-text-secondary mt-0.5">
            B: {schoolSummary.absentBoys} | G: {schoolSummary.absentGirls}
          </div>
        </div>
      </div>
    </div>
  );
});

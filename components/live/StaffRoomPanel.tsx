import React from 'react';
import { Teacher } from '../../types';
import { DAY_LABELS, DayKey, StandardPeriod } from '../../services/timetable';
import { subjectNames } from '../../services/teacherRoster';
import { UserIcon } from '../icons/MiscIcons';
import { getClassTier, TIER_CONFIG, getTeacherTierHint } from '../../services/tierHelpers';
import { Avatar } from './LiveCommon';

export interface StaffRoomPanelProps {
  day: DayKey;
  periodIndex: number;
  periodInfo: StandardPeriod | null;
  freeTeachers: Teacher[];
  busyTeachers: Array<{ teacher: Teacher; subject: string; classLabel: string }>;
  absentTeacherIds?: string[];
}

export const StaffRoomPanel: React.FC<StaffRoomPanelProps> = ({
  day,
  periodIndex,
  periodInfo,
  freeTeachers = [],
  busyTeachers = [],
  absentTeacherIds = [],
}) => {
  return (
    <div className="glass-card rounded-2xl p-5 md:p-6 shadow-soft border border-brand-border">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-xl bg-brand-primary-soft dark:bg-brand-primary/20 flex items-center justify-center">
            <UserIcon className="w-5 h-5 text-brand-primary dark:text-blue-300" />
          </span>
          <div>
            <h3 className="text-base font-bold text-brand-text-primary">Staff Room Availability</h3>
            <p className="text-xs text-brand-text-secondary">
              Teacher status for {DAY_LABELS[day]} · Period {periodInfo?.no ?? (periodIndex + 1)}{' '}
              ({periodInfo?.formattedRange || (periodInfo ? `${periodInfo.start} – ${periodInfo.end}` : '')})
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="rounded-full bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-300 dark:border-emerald-500/30 px-3 py-1 font-bold text-emerald-700 dark:text-emerald-300">
            🟢 {freeTeachers.length} Free / Available
          </span>
          <span className="rounded-full bg-brand-primary-soft dark:bg-brand-primary/20 border border-brand-primary/30 px-3 py-1 font-bold text-brand-primary dark:text-blue-300">
            📚 {busyTeachers.length} Teaching
          </span>
        </div>
      </div>

      <div className="space-y-4">
        {/* Free Teachers Grid */}
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-brand-text-tertiary mb-2.5">
            Available Teachers in Staff Room ({freeTeachers.length})
          </h4>
          {freeTeachers.length === 0 ? (
            <p className="text-xs text-brand-text-tertiary italic">
              All teachers are currently assigned to classes for this period.
            </p>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5">
              {freeTeachers.map(t => {
                const isTeacherAbsent = t?.id ? absentTeacherIds.includes(t.id) : false;
                const tierHint = getTeacherTierHint(t);
                return (
                  <div
                    key={t.id}
                    className={`flex items-center gap-2.5 rounded-xl p-2.5 border transition-all ${
                      isTeacherAbsent
                        ? 'bg-rose-50/50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900 opacity-60'
                        : 'bg-white dark:bg-brand-panel border-brand-border'
                    }`}
                  >
                    <Avatar name={t.name} size="md" />
                    <div className="min-w-0 flex-1">
                      <p
                        className={`text-xs font-bold truncate ${
                          isTeacherAbsent
                            ? 'text-rose-700 dark:text-rose-300 line-through'
                            : 'text-brand-text-primary'
                        }`}
                      >
                        {t.name}
                      </p>
                      <div className="flex items-center gap-1 text-[10px] text-brand-text-tertiary truncate">
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${tierHint.config.dotClass} shrink-0`}
                          title={tierHint.label}
                        />
                        <span className="font-semibold text-brand-text-secondary">{tierHint.label}</span>
                        <span>·</span>
                        <span className="truncate">
                          {isTeacherAbsent
                            ? 'Marked Absent Today'
                            : t.designation ?? subjectNames(t).join(', ')}
                        </span>
                      </div>
                    </div>
                    {!isTeacherAbsent && (
                      <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" title="Free" />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Busy Teachers Grid */}
        {busyTeachers.length > 0 && (
          <div className="pt-3 border-t border-brand-border/60">
            <h4 className="text-xs font-bold uppercase tracking-wider text-brand-text-tertiary mb-2.5">
              Teaching in Classrooms ({busyTeachers.length})
            </h4>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5">
              {busyTeachers.map(item => {
                const itemTier = getClassTier(item.classLabel || '');
                const itemTierConfig = TIER_CONFIG[itemTier] || TIER_CONFIG.secondary;
                return (
                  <div
                    key={`${item.teacher.id}-${item.classLabel}`}
                    className="flex items-center justify-between gap-2 rounded-xl p-2.5 bg-white dark:bg-brand-panel border border-brand-border text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Avatar name={item.teacher.name} />
                      <div className="min-w-0">
                        <p className="font-bold text-brand-text-primary truncate">
                          {item.teacher.name}
                        </p>
                        <p className="text-[10px] text-brand-text-secondary truncate">
                          {item.subject}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded-md text-[11px] font-bold shrink-0 border ${itemTierConfig.subtleTagClass}`}
                    >
                      {item.classLabel}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

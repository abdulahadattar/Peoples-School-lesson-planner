import React, { useState } from 'react';
import { DayKey, DAY_KEYS, DAY_LABELS } from '../services/timetable';
import { Teacher } from '../types';
import { DUTIES_SCHEDULE, resolveDutyStaff, getActiveDutyStatus } from '../services/breakDuties';
import { getTeacherTierHint } from '../services/tierHelpers';
import { initials } from './live/LiveCommon';
import { Coffee, DoorOpen, AlertTriangle } from 'lucide-react';

export const BreakDutiesPanel: React.FC<{
  day: DayKey;
  onDayChange?: (day: DayKey) => void;
  teachers: Teacher[];
  absentTeacherIds?: string[];
  currentMinutes?: number;
}> = ({
  day,
  onDayChange,
  teachers,
  absentTeacherIds = [],
  currentMinutes = 0,
}) => {
  const [activeTab, setActiveTab] = useState<'break' | 'leave' | 'both'>('both');
  
  const schedule = DUTIES_SCHEDULE[day] || DUTIES_SCHEDULE.mon;
  const currentActiveDuty = getActiveDutyStatus(day, currentMinutes);

  const breakBoys = resolveDutyStaff(schedule.breakDuty.boysGround, teachers, absentTeacherIds);
  const breakGirls = resolveDutyStaff(schedule.breakDuty.girlsGround, teachers, absentTeacherIds);

  const leaveBoys = resolveDutyStaff(schedule.leaveDuty.boysGround, teachers, absentTeacherIds);
  const leaveGirls = resolveDutyStaff(schedule.leaveDuty.girlsGround, teachers, absentTeacherIds);

  const renderStaffItem = (
    item: ReturnType<typeof resolveDutyStaff>[number],
    groundKey: string
  ) => {
    const tierHint = item.teacher ? getTeacherTierHint(item.teacher) : null;
    return (
      <div
        key={`${groundKey}-${item.rawName}`}
        className={`flex items-center justify-between gap-2.5 px-3 py-2 rounded-xl border transition-all ${
          item.isAbsent
            ? 'bg-rose-50/70 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900/60'
            : 'bg-white dark:bg-brand-panel border-brand-border/80 hover:border-brand-primary/30'
        }`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className={`inline-flex items-center justify-center rounded-full font-bold h-7 w-7 text-[10px] shrink-0 ${
              item.isAbsent
                ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-200'
                : 'bg-brand-primary-soft text-brand-primary dark:bg-brand-primary/20 dark:text-blue-300 ring-1 ring-brand-border/60'
            }`}
          >
            {initials(item.canonicalName)}
          </span>
          <div className="min-w-0">
            <p className={`text-xs font-bold truncate leading-tight ${
              item.isAbsent
                ? 'text-rose-700 dark:text-rose-300 line-through'
                : 'text-brand-text-primary'
            }`}>
              {item.canonicalName}
            </p>
            <div className="flex items-center gap-1.5 mt-0.5">
              {tierHint && (
                <span className="flex items-center gap-1 text-[10px] text-brand-text-tertiary">
                  <span className={`w-1.5 h-1.5 rounded-full ${tierHint.config.dotClass}`} />
                  <span>{tierHint.label}</span>
                </span>
              )}
              {item.teacher?.designation && (
                <span className="text-[10px] text-brand-text-tertiary truncate">
                  · {item.teacher.designation}
                </span>
              )}
            </div>
          </div>
        </div>

        {item.isAbsent && (
          <span className="text-[10px] font-bold text-rose-700 dark:text-rose-300 bg-rose-100 dark:bg-rose-900/50 px-2 py-0.5 rounded-full shrink-0">
            Absent
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="glass-card rounded-2xl p-5 md:p-6 shadow-soft border border-brand-border">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-brand-text-primary">
              Ground Duties Schedule
            </h3>
            <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-brand-primary-soft text-brand-primary dark:bg-brand-primary/20 dark:text-blue-300">
              {DAY_LABELS[day]}
            </span>
          </div>
          <p className="text-xs text-brand-text-secondary mt-0.5">
            Official daily supervision assignments for Boys Ground &amp; Girls Ground
          </p>
        </div>

        {/* View mode toggle */}
        <div className="flex items-center bg-brand-bg dark:bg-brand-panel p-0.5 rounded-lg border border-brand-border text-xs">
          <button
            type="button"
            onClick={() => setActiveTab('both')}
            className={`px-2.5 py-1 rounded-md font-semibold transition-all ${
              activeTab === 'both'
                ? 'bg-white dark:bg-brand-surface text-brand-primary font-bold shadow-xs'
                : 'text-brand-text-secondary hover:text-brand-text-primary'
            }`}
          >
            All Duties
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('break')}
            className={`px-2.5 py-1 rounded-md font-semibold transition-all ${
              activeTab === 'break'
                ? 'bg-white dark:bg-brand-surface text-brand-primary font-bold shadow-xs'
                : 'text-brand-text-secondary hover:text-brand-text-primary'
            }`}
          >
            Break Only
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('leave')}
            className={`px-2.5 py-1 rounded-md font-semibold transition-all ${
              activeTab === 'leave'
                ? 'bg-white dark:bg-brand-surface text-brand-primary font-bold shadow-xs'
                : 'text-brand-text-secondary hover:text-brand-text-primary'
            }`}
          >
            Leave Time Only
          </button>
        </div>
      </div>

      {/* Grid of Schedules */}
      <div className={`grid gap-4 ${activeTab === 'both' ? 'lg:grid-cols-2' : 'grid-cols-1'}`}>
        {/* Section 1: Break Duties Schedule */}
        {(activeTab === 'both' || activeTab === 'break') && (
          <div className="p-4 rounded-xl bg-brand-bg/60 dark:bg-brand-panel/40 border border-brand-border flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-2 mb-3 pb-2.5 border-b border-brand-border/60">
                <div className="flex items-center gap-2">
                  <Coffee className="w-4 h-4 text-brand-text-secondary" />
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-brand-text-primary">
                      Recess Break Duties Schedule
                    </h4>
                    <span className="text-[10px] text-brand-text-tertiary">
                      {day === 'fri' ? '10:00 AM – 10:30 AM' : '10:50 AM – 11:20 AM'}
                    </span>
                  </div>
                </div>

                {currentActiveDuty === 'break' && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-300 text-[10px] font-bold text-emerald-700 dark:text-emerald-300 animate-pulse">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    <span>ACTIVE NOW</span>
                  </span>
                )}
              </div>

              {/* Boys Ground (3 teachers) */}
              <div className="mb-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-bold text-blue-700 dark:text-blue-300 flex items-center gap-1">
                    <span>Boys Ground</span>
                    <span className="text-[10px] font-normal text-brand-text-tertiary">(3 Staff)</span>
                  </span>
                </div>
                <div className="grid gap-1.5">
                  {breakBoys.map(item => renderStaffItem(item, 'Boys Ground'))}
                </div>
              </div>

              {/* Girls Ground (2 teachers) */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-bold text-rose-700 dark:text-rose-300 flex items-center gap-1">
                    <span>Girls Ground</span>
                    <span className="text-[10px] font-normal text-brand-text-tertiary">(2 Staff)</span>
                  </span>
                </div>
                <div className="grid gap-1.5">
                  {breakGirls.map(item => renderStaffItem(item, 'Girls Ground'))}
                </div>
              </div>
            </div>

            {breakBoys.some(b => b.isAbsent) || breakGirls.some(g => g.isAbsent) ? (
              <p className="text-[11px] font-semibold text-rose-700 dark:text-rose-300 mt-3 pt-2 border-t border-rose-200 dark:border-rose-900/50 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>One or more break duty teachers are absent today. Substitute required.</span>
              </p>
            ) : null}
          </div>
        )}

        {/* Section 2: Leave Time Duties Schedule */}
        {(activeTab === 'both' || activeTab === 'leave') && (
          <div className="p-4 rounded-xl bg-brand-bg/60 dark:bg-brand-panel/40 border border-brand-border flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-2 mb-3 pb-2.5 border-b border-brand-border/60">
                <div className="flex items-center gap-2">
                  <DoorOpen className="w-4 h-4 text-brand-text-secondary" />
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-brand-text-primary">
                      Leave Time Duties Schedule
                    </h4>
                    <span className="text-[10px] text-brand-text-tertiary">
                      {day === 'fri' ? '11:50 AM – 12:20 PM' : '1:20 PM – 1:50 PM'} (School Dismissal)
                    </span>
                  </div>
                </div>

                {currentActiveDuty === 'leave' && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-300 text-[10px] font-bold text-emerald-700 dark:text-emerald-300 animate-pulse">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    <span>ACTIVE NOW</span>
                  </span>
                )}
              </div>

              {/* Boys Ground (2 teachers) */}
              <div className="mb-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-bold text-blue-700 dark:text-blue-300 flex items-center gap-1">
                    <span>Boys Ground</span>
                    <span className="text-[10px] font-normal text-brand-text-tertiary">(2 Staff)</span>
                  </span>
                </div>
                <div className="grid gap-1.5">
                  {leaveBoys.map(item => renderStaffItem(item, 'Boys Ground'))}
                </div>
              </div>

              {/* Girls Ground (2 teachers) */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-bold text-rose-700 dark:text-rose-300 flex items-center gap-1">
                    <span>Girls Ground</span>
                    <span className="text-[10px] font-normal text-brand-text-tertiary">(2 Staff)</span>
                  </span>
                </div>
                <div className="grid gap-1.5">
                  {leaveGirls.map(item => renderStaffItem(item, 'Girls Ground'))}
                </div>
              </div>
            </div>

            {leaveBoys.some(b => b.isAbsent) || leaveGirls.some(g => g.isAbsent) ? (
              <p className="text-[11px] font-semibold text-rose-700 dark:text-rose-300 mt-3 pt-2 border-t border-rose-200 dark:border-rose-900/50 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>One or more dismissal duty teachers are absent today. Substitute required.</span>
              </p>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
};

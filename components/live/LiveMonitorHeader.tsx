import React from 'react';
import {
  DayKey,
  SchoolTimeStatus,
  StandardPeriod,
} from '../../services/timetable';
import { RefreshIcon } from '../icons/MiscIcons';
import { ClassTier } from '../../services/tierHelpers';
import { LiveDot } from './LiveCommon';
import { SegmentedControl } from '../ui/SegmentedControl';
import { motion } from 'motion/react';
import { SchoolStatusBadge } from './SchoolStatusBadge';
import { LivePeriodDaySelector } from './LivePeriodDaySelector';
import { LiveTierSearchToolbar } from './LiveTierSearchToolbar';

export interface LiveMonitorHeaderProps {
  monitorMode: 'classes' | 'duties' | 'substitutions';
  onMonitorModeChange: (mode: 'classes' | 'duties' | 'substitutions') => void;
  absentCount: number;
  isLive: boolean;
  onGoLive: () => void;
  effectiveDay: DayKey;
  liveDay: DayKey | null;
  onSelectDay: (day: DayKey) => void;
  effectiveCardPeriodIndex: number;
  livePeriodIndex: number;
  previewPeriod: number | null;
  onSelectPeriod: (index: number) => void;
  schedule: StandardPeriod[];
  currentPeriodInfo: StandardPeriod | null;
  clockDate: Date;
  schoolStatus: SchoolTimeStatus | null;
  classFilter: 'all' | ClassTier;
  onClassFilterChange: (tier: 'all' | ClassTier) => void;
  totalClassesCount: number;
  searchQuery: string;
  onSearchQueryChange: (q: string) => void;
}

const MONITOR_MODES = [
  { value: 'classes' as const, label: 'Classes & Staff' },
  { value: 'duties' as const, label: 'Ground Duties' },
  { value: 'substitutions' as const, label: 'Substitutions' },
];

export const LiveMonitorHeader: React.FC<LiveMonitorHeaderProps> = ({
  monitorMode,
  onMonitorModeChange,
  absentCount,
  isLive,
  onGoLive,
  effectiveDay,
  liveDay,
  onSelectDay,
  effectiveCardPeriodIndex,
  livePeriodIndex,
  onSelectPeriod,
  schedule,
  currentPeriodInfo,
  clockDate,
  schoolStatus,
  classFilter,
  onClassFilterChange,
  totalClassesCount,
  searchQuery,
  onSearchQueryChange,
}) => {
  const formattedDate = clockDate.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  const formattedTime = clockDate.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });

  return (
    <div className="space-y-4">
      {/* Top Bar: Mode switcher & Live sync status */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="w-full sm:w-auto sm:min-w-[340px]">
          <SegmentedControl
            size="sm"
            value={monitorMode}
            options={MONITOR_MODES}
            onChange={onMonitorModeChange}
          />
        </div>

        {/* Live sync status pill */}
        <div className="flex items-center gap-2 self-end sm:self-auto">
          {absentCount > 0 && monitorMode !== 'substitutions' && (
            <button
              type="button"
              onClick={() => onMonitorModeChange('substitutions')}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 cursor-pointer"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
              <span>{absentCount} Absent</span>
            </button>
          )}

          {isLive ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
              <LiveDot />
              <span>Live Clock</span>
            </span>
          ) : (
            <motion.button
              whileTap={{ scale: 0.96 }}
              type="button"
              onClick={onGoLive}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-xs font-semibold text-amber-700 dark:text-amber-300 hover:bg-amber-500/20 transition-all cursor-pointer"
              title="Reset to current real-time clock"
            >
              <RefreshIcon className="w-3.5 h-3.5" />
              <span>Return to Live</span>
            </motion.button>
          )}
        </div>
      </div>

      {/* Main Control Panel (Only in Classes Mode) */}
      {monitorMode === 'classes' && (
        <div className="rounded-2xl bg-white dark:bg-brand-surface p-5 shadow-soft border border-black/[0.06] dark:border-white/[0.08] space-y-4">
          {/* Top Info Line */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-brand-text-primary tracking-tight">
                Live Timetable Operations
              </h2>
              <span className="text-brand-text-tertiary">·</span>
              <span className="text-xs text-brand-text-secondary font-medium font-mono tabular-nums">
                {formattedDate} {formattedTime}
              </span>
            </div>

            <SchoolStatusBadge schoolStatus={schoolStatus} />
          </div>

          <LivePeriodDaySelector
            effectiveDay={effectiveDay}
            liveDay={liveDay}
            onSelectDay={onSelectDay}
            effectiveCardPeriodIndex={effectiveCardPeriodIndex}
            livePeriodIndex={livePeriodIndex}
            onSelectPeriod={onSelectPeriod}
            schedule={schedule}
            currentPeriodInfo={currentPeriodInfo}
          />

          <LiveTierSearchToolbar
            classFilter={classFilter}
            onClassFilterChange={onClassFilterChange}
            totalClassesCount={totalClassesCount}
            searchQuery={searchQuery}
            onSearchQueryChange={onSearchQueryChange}
          />
        </div>
      )}
    </div>
  );
};

export default LiveMonitorHeader;

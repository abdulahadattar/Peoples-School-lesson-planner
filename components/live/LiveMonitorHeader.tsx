import React from 'react';
import {
  DayKey,
  DAY_KEYS,
  DAY_LABELS,
  SchoolTimeStatus,
  StandardPeriod,
  formatMinutes,
} from '../../services/timetable';
import { RefreshIcon } from '../icons/MiscIcons';
import { ClassTier, TIER_CONFIG } from '../../services/tierHelpers';
import { LiveDot } from './LiveCommon';
import { SegmentedControl } from '../ui/SegmentedControl';
import { motion } from 'motion/react';
import { Search } from 'lucide-react';

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
  previewPeriod,
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

            {/* School status indicator */}
            {schoolStatus && (
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-black/[0.04] dark:border-white/[0.06] text-xs">
                {schoolStatus.state === 'in_period' && (
                  <>
                    <LiveDot />
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">
                      Period {schoolStatus.periodNo} in session
                    </span>
                    <span className="text-slate-400 font-mono tabular-nums text-[11px]">
                      ({schoolStatus.remainingMinutes}m left)
                    </span>
                  </>
                )}
                {schoolStatus.state === 'break' && (
                  <>
                    <span>☕</span>
                    <span className="font-bold text-amber-600 dark:text-amber-400">
                      Recess Break
                    </span>
                    <span className="text-slate-400 font-mono tabular-nums text-[11px]">
                      ({schoolStatus.remainingMinutes}m left · Next: P{schoolStatus.nextPeriodNo})
                    </span>
                  </>
                )}
                {schoolStatus.state === 'before_school' && (
                  <>
                    <span>🌅</span>
                    <span className="font-bold text-blue-600 dark:text-blue-400">
                      Pre-Assembly
                    </span>
                    <span className="text-slate-400 text-xs">
                      · P1 at {formatMinutes(schoolStatus.firstPeriodStart)}
                    </span>
                  </>
                )}
                {schoolStatus.state === 'after_school' && (
                  <>
                    <span>🏁</span>
                    <span className="font-bold text-slate-500">
                      Classes Dismissed
                    </span>
                    <span className="text-slate-400 text-[11px]">
                      (ended {formatMinutes(schoolStatus.lastPeriodEnd)})
                    </span>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Unified Controls Row: Day Pills + Period Pills */}
          <div className="pt-3 border-t border-black/[0.04] dark:border-white/[0.06] flex flex-col md:flex-row md:items-center justify-between gap-3">
            {/* Day Selector */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mr-1">
                Day:
              </span>
              {DAY_KEYS.map(d => {
                const isToday = liveDay === d;
                const isSelected = effectiveDay === d;
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => onSelectDay(d)}
                    className={`relative px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <span>{DAY_LABELS[d].slice(0, 3)}</span>
                    {isToday && !isSelected && (
                      <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Period Selector */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mr-0.5">
                Period:
              </span>
              <div className="flex items-center gap-1">
                {schedule.map((p, i) => {
                  const isSelected = effectiveCardPeriodIndex === i;
                  const isLiveInThisPeriod = livePeriodIndex === i;
                  return (
                    <button
                      key={p.no}
                      type="button"
                      onClick={() => onSelectPeriod(i)}
                      className={`relative px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer font-mono tabular-nums ${
                        isSelected
                          ? 'bg-blue-600 text-white shadow-xs'
                          : isLiveInThisPeriod
                            ? 'bg-emerald-500/15 border border-emerald-500/40 text-emerald-700 dark:text-emerald-300 font-bold'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                      }`}
                      title={p.formattedRange || `${p.start} – ${p.end}`}
                    >
                      <span>P{p.no}</span>
                      {isLiveInThisPeriod && (
                        <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      )}
                    </button>
                  );
                })}
              </div>

              {currentPeriodInfo && (
                <span className="text-xs font-mono tabular-nums text-slate-500 bg-slate-100 dark:bg-slate-800/80 px-2.5 py-1 rounded-lg border border-black/[0.04] dark:border-white/[0.06]">
                  {currentPeriodInfo.formattedRange || `${currentPeriodInfo.start} – ${currentPeriodInfo.end}`}
                </span>
              )}
            </div>
          </div>

          {/* Tiers & Search Filter */}
          <div className="pt-3 border-t border-black/[0.04] dark:border-white/[0.06] flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 w-full sm:w-auto flex-wrap text-xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mr-1">Tiers:</span>
              
              <button
                type="button"
                onClick={() => onClassFilterChange('all')}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                  classFilter === 'all'
                    ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 font-bold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                All ({totalClassesCount})
              </button>

              {(['primary', 'elementary', 'middle', 'secondary'] as ClassTier[]).map(tier => (
                <button
                  key={tier}
                  type="button"
                  onClick={() => onClassFilterChange(tier)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer capitalize ${
                    classFilter === tier
                      ? TIER_CONFIG[tier].badgeClass + ' font-bold'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${TIER_CONFIG[tier].dotClass}`} />
                  <span>{tier}</span>
                </button>
              ))}
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search class, teacher, subject..."
                value={searchQuery}
                onChange={e => onSearchQueryChange(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 rounded-xl text-xs bg-slate-50 dark:bg-slate-900/60 border border-black/[0.08] dark:border-white/[0.08] focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none text-slate-900 dark:text-white transition-all placeholder:text-slate-400"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

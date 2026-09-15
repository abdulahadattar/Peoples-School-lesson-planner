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
  });

  return (
    <div className="space-y-3.5">
      {/* Top Bar: Mode switcher & Live sync status */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center bg-brand-bg dark:bg-brand-panel p-1 rounded-xl border border-brand-border">
          <button
            type="button"
            onClick={() => onMonitorModeChange('classes')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
              monitorMode === 'classes'
                ? 'bg-white dark:bg-brand-surface text-brand-primary shadow-xs'
                : 'text-brand-text-secondary hover:text-brand-text-primary'
            }`}
          >
            Live Classes &amp; Staff Room
          </button>
          <button
            type="button"
            onClick={() => onMonitorModeChange('duties')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
              monitorMode === 'duties'
                ? 'bg-white dark:bg-brand-surface text-brand-primary shadow-xs'
                : 'text-brand-text-secondary hover:text-brand-text-primary'
            }`}
          >
            Ground Duties
          </button>
          <button
            type="button"
            onClick={() => onMonitorModeChange('substitutions')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
              monitorMode === 'substitutions'
                ? 'bg-white dark:bg-brand-surface text-brand-primary shadow-xs'
                : 'text-brand-text-secondary hover:text-brand-text-primary'
            }`}
          >
            <span>Substitutions</span>
            {absentCount > 0 && (
              <span className="px-1.5 py-0.2 text-[10px] font-bold rounded-full bg-rose-500 text-white leading-none">
                {absentCount}
              </span>
            )}
          </button>
        </div>

        {/* Live sync / Return to Live button */}
        <div>
          {isLive ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-300 dark:border-emerald-500/30 text-xs font-bold text-emerald-700 dark:text-emerald-300">
              <LiveDot />
              <span>Live Sync</span>
            </span>
          ) : (
            <button
              onClick={onGoLive}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 dark:bg-amber-500/10 border border-amber-300 dark:border-amber-500/30 text-xs font-bold text-amber-700 dark:text-amber-300 hover:bg-amber-100 transition-all shadow-xs"
              title="Reset to current real-time clock"
            >
              <RefreshIcon className="w-3.5 h-3.5" />
              <span>Return to Live Clock</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Control Panel (Only in Classes Mode) */}
      {monitorMode === 'classes' && (
        <div className="glass-card rounded-2xl p-4 md:p-5 shadow-soft border border-brand-border space-y-4">
          {/* Top Info Line: Title, Real-time clock & Live school status banner */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <h2 className="text-lg font-bold text-brand-text-primary tracking-tight">
                Live Classes Monitor
              </h2>
              <span className="text-xs text-brand-text-tertiary">·</span>
              <span className="text-xs text-brand-text-secondary font-medium">
                {formattedDate} · <strong className="font-mono text-brand-text-primary">{formattedTime}</strong>
              </span>
            </div>

            {/* School status indicator */}
            {schoolStatus && (
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-brand-bg dark:bg-brand-panel border border-brand-border text-xs font-medium">
                {schoolStatus.state === 'in_period' && (
                  <>
                    <LiveDot />
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">
                      Period {schoolStatus.periodNo} in session
                    </span>
                    <span className="text-brand-text-tertiary font-mono text-[11px]">
                      ({schoolStatus.remainingMinutes}m remaining)
                    </span>
                  </>
                )}
                {schoolStatus.state === 'break' && (
                  <>
                    <span>☕</span>
                    <span className="font-bold text-amber-600 dark:text-amber-400">
                      Recess Break
                    </span>
                    <span className="text-brand-text-tertiary font-mono text-[11px]">
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
                    <span className="text-brand-text-secondary">
                      · P1 starts at {formatMinutes(schoolStatus.firstPeriodStart)}
                    </span>
                  </>
                )}
                {schoolStatus.state === 'after_school' && (
                  <>
                    <span>🏁</span>
                    <span className="font-bold text-brand-text-secondary">
                      Classes Dismissed
                    </span>
                    <span className="text-brand-text-tertiary">
                      (ended at {formatMinutes(schoolStatus.lastPeriodEnd)})
                    </span>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Unified Controls Row: Day Pills + Period Pills + Single Period Time Label */}
          <div className="pt-3 border-t border-brand-border flex flex-col md:flex-row md:items-center justify-between gap-3">
            {/* Day Selector */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] font-bold uppercase tracking-wider text-brand-text-tertiary mr-1">
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
                    className={`relative px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                      isSelected
                        ? 'bg-brand-primary text-white shadow-xs'
                        : 'bg-white dark:bg-brand-panel border border-brand-border text-brand-text-secondary hover:text-brand-text-primary'
                    }`}
                  >
                    <span>{DAY_LABELS[d].slice(0, 3)}</span>
                    {isToday && !isSelected && (
                      <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-brand-panel" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Period Selector with Single Timing Label */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-bold uppercase tracking-wider text-brand-text-tertiary mr-0.5">
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
                      className={`relative px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                        isSelected
                          ? 'bg-brand-primary text-white shadow-xs'
                          : isLiveInThisPeriod
                            ? 'bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-500 text-emerald-800 dark:text-emerald-300 font-extrabold'
                            : 'bg-white dark:bg-brand-panel border border-brand-border text-brand-text-secondary hover:text-brand-text-primary'
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

              {/* Single timing label right here where needed */}
              {currentPeriodInfo && (
                <span className="text-xs font-medium text-brand-text-secondary bg-brand-bg dark:bg-brand-panel px-2.5 py-1 rounded-lg border border-brand-border">
                  {currentPeriodInfo.formattedRange || `${currentPeriodInfo.start} – ${currentPeriodInfo.end}`}
                </span>
              )}
            </div>
          </div>

          {/* Tiers & Search Filter */}
          <div className="pt-3 border-t border-brand-border/60 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 w-full sm:w-auto flex-wrap">
              <span className="text-[11px] font-bold text-brand-text-tertiary mr-1">Tiers:</span>
              
              <button
                type="button"
                onClick={() => onClassFilterChange('all')}
                className={`px-2 py-0.5 rounded-md text-xs font-semibold transition-all ${
                  classFilter === 'all'
                    ? 'bg-brand-primary-soft text-brand-primary dark:bg-brand-primary/20 dark:text-blue-300 font-bold'
                    : 'text-brand-text-secondary hover:text-brand-text-primary'
                }`}
              >
                All ({totalClassesCount})
              </button>

              <button
                type="button"
                onClick={() => onClassFilterChange('primary')}
                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-semibold transition-all border ${
                  classFilter === 'primary'
                    ? TIER_CONFIG.primary.badgeClass + ' font-bold'
                    : 'border-transparent text-brand-text-secondary hover:text-brand-text-primary'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${TIER_CONFIG.primary.dotClass}`} />
                <span>Primary</span>
              </button>

              <button
                type="button"
                onClick={() => onClassFilterChange('elementary')}
                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-semibold transition-all border ${
                  classFilter === 'elementary'
                    ? TIER_CONFIG.elementary.badgeClass + ' font-bold'
                    : 'border-transparent text-brand-text-secondary hover:text-brand-text-primary'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${TIER_CONFIG.elementary.dotClass}`} />
                <span>Elementary</span>
              </button>

              <button
                type="button"
                onClick={() => onClassFilterChange('middle')}
                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-semibold transition-all border ${
                  classFilter === 'middle'
                    ? TIER_CONFIG.middle.badgeClass + ' font-bold'
                    : 'border-transparent text-brand-text-secondary hover:text-brand-text-primary'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${TIER_CONFIG.middle.dotClass}`} />
                <span>Middle</span>
              </button>

              <button
                type="button"
                onClick={() => onClassFilterChange('secondary')}
                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-semibold transition-all border ${
                  classFilter === 'secondary'
                    ? TIER_CONFIG.secondary.badgeClass + ' font-bold'
                    : 'border-transparent text-brand-text-secondary hover:text-brand-text-primary'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${TIER_CONFIG.secondary.dotClass}`} />
                <span>Secondary</span>
              </button>
            </div>

            <div className="w-full sm:w-60">
              <input
                type="text"
                placeholder="Search class, teacher, subject..."
                value={searchQuery}
                onChange={e => onSearchQueryChange(e.target.value)}
                className="w-full px-3 py-1 rounded-xl text-xs bg-brand-bg dark:bg-brand-panel border border-brand-border focus:border-brand-primary outline-none text-brand-text-primary transition-all placeholder:text-brand-text-tertiary"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

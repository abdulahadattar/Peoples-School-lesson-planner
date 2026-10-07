import React from 'react';
import {
  DayKey,
  DAY_KEYS,
  DAY_LABELS,
  StandardPeriod,
} from '../../services/timetable';

export interface LivePeriodDaySelectorProps {
  effectiveDay: DayKey;
  liveDay: DayKey | null;
  onSelectDay: (day: DayKey) => void;
  effectiveCardPeriodIndex: number;
  livePeriodIndex: number;
  onSelectPeriod: (index: number) => void;
  schedule: StandardPeriod[];
  currentPeriodInfo: StandardPeriod | null;
}

export const LivePeriodDaySelector: React.FC<LivePeriodDaySelectorProps> = ({
  effectiveDay,
  liveDay,
  onSelectDay,
  effectiveCardPeriodIndex,
  livePeriodIndex,
  onSelectPeriod,
  schedule,
  currentPeriodInfo,
}) => {
  return (
    <div className="pt-3 border-t border-black/[0.04] dark:border-white/[0.06] flex flex-col md:flex-row md:items-center justify-between gap-3">
      {/* Day Selector */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mr-1">
          Day:
        </span>
        {DAY_KEYS.map((d) => {
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
  );
};

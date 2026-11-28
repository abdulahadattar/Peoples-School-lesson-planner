import React from 'react';
import { Trash2 } from 'lucide-react';
import { PeriodTiming } from '../../services/schoolConfigService';

export interface PeriodsMobileCardsProps {
  periods: PeriodTiming[];
  onPeriodChange: (index: number, field: keyof PeriodTiming, value: string | number | boolean) => void;
  onRemovePeriod: (index: number) => void;
}

export const PeriodsMobileCards: React.FC<PeriodsMobileCardsProps> = ({
  periods,
  onPeriodChange,
  onRemovePeriod,
}) => {
  return (
    <div className="md:hidden space-y-3">
      {periods.map((period, idx) => (
        <article
          key={`${period.no}-${idx}`}
          className={`p-4 rounded-2xl border space-y-3 ${
            period.isBreak
              ? 'bg-amber-50/45 dark:bg-amber-950/20 border-amber-300/70 dark:border-amber-800/60'
              : 'bg-brand-surface border-brand-border'
          }`}
        >
          <div className="flex items-end gap-2">
            <div className="flex-1 min-w-0">
              <label
                htmlFor={`mob-period-name-${idx}`}
                className="block text-[11px] font-semibold text-brand-text-secondary mb-1"
              >
                Period Name
              </label>
              <input
                id={`mob-period-name-${idx}`}
                type="text"
                aria-label={`Mobile Period ${idx + 1} name`}
                value={period.name}
                onChange={(e) => onPeriodChange(idx, 'name', e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl text-sm font-semibold bg-brand-panel/60 dark:bg-brand-panel border border-brand-border text-brand-text-primary focus:outline-none focus:border-brand-primary"
              />
            </div>

            <button
              type="button"
              onClick={() => onRemovePeriod(idx)}
              aria-label={`Remove ${period.name} card`}
              className="min-w-[44px] min-h-[44px] rounded-xl inline-flex items-center justify-center text-brand-text-secondary hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-brand-border bg-brand-surface transition-colors cursor-pointer shrink-0"
            >
              <Trash2 className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label
                htmlFor={`mob-start-${idx}`}
                className="block text-[11px] font-medium text-brand-text-secondary mb-1"
              >
                Mon–Thu Start
              </label>
              <input
                id={`mob-start-${idx}`}
                type="text"
                value={period.start}
                onChange={(e) => onPeriodChange(idx, 'start', e.target.value)}
                className="w-full px-3 py-2 rounded-xl text-xs font-mono tabular-nums bg-brand-panel/60 dark:bg-brand-panel border border-brand-border text-brand-text-primary focus:outline-none focus:border-brand-primary"
              />
            </div>

            <div>
              <label
                htmlFor={`mob-end-${idx}`}
                className="block text-[11px] font-medium text-brand-text-secondary mb-1"
              >
                Mon–Thu End
              </label>
              <input
                id={`mob-end-${idx}`}
                type="text"
                value={period.end}
                onChange={(e) => onPeriodChange(idx, 'end', e.target.value)}
                className="w-full px-3 py-2 rounded-xl text-xs font-mono tabular-nums bg-brand-panel/60 dark:bg-brand-panel border border-brand-border text-brand-text-primary focus:outline-none focus:border-brand-primary"
              />
            </div>

            <div>
              <label
                htmlFor={`mob-fri-start-${idx}`}
                className="block text-[11px] font-medium text-brand-text-secondary mb-1"
              >
                Friday Start
              </label>
              <input
                id={`mob-fri-start-${idx}`}
                type="text"
                value={period.friStart || ''}
                onChange={(e) => onPeriodChange(idx, 'friStart', e.target.value)}
                placeholder="—"
                className="w-full px-3 py-2 rounded-xl text-xs font-mono tabular-nums bg-brand-panel/60 dark:bg-brand-panel border border-brand-border text-brand-text-primary focus:outline-none focus:border-brand-primary"
              />
            </div>

            <div>
              <label
                htmlFor={`mob-fri-end-${idx}`}
                className="block text-[11px] font-medium text-brand-text-secondary mb-1"
              >
                Friday End
              </label>
              <input
                id={`mob-fri-end-${idx}`}
                type="text"
                value={period.friEnd || ''}
                onChange={(e) => onPeriodChange(idx, 'friEnd', e.target.value)}
                placeholder="—"
                className="w-full px-3 py-2 rounded-xl text-xs font-mono tabular-nums bg-brand-panel/60 dark:bg-brand-panel border border-brand-border text-brand-text-primary focus:outline-none focus:border-brand-primary"
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 pt-2 border-t border-brand-border/60">
            <div className="flex items-center gap-2">
              <label
                htmlFor={`mob-min-${idx}`}
                className="text-xs font-medium text-brand-text-secondary"
              >
                Minutes
              </label>
              <input
                id={`mob-min-${idx}`}
                type="number"
                inputMode="numeric"
                min={5}
                max={180}
                value={period.durationMinutes ?? 40}
                onChange={(e) =>
                  onPeriodChange(idx, 'durationMinutes', parseInt(e.target.value, 10) || 40)
                }
                className="w-16 px-2.5 py-1.5 rounded-lg text-xs text-center font-mono tabular-nums font-semibold bg-brand-panel/60 dark:bg-brand-panel border border-brand-border text-brand-primary focus:outline-none focus:border-brand-primary"
              />
            </div>

            <label className="inline-flex items-center gap-2 min-h-[44px] px-2 cursor-pointer text-xs font-semibold text-brand-text-primary">
              <input
                type="checkbox"
                checked={Boolean(period.isBreak)}
                onChange={(e) => onPeriodChange(idx, 'isBreak', e.target.checked)}
                className="w-4 h-4 rounded border-brand-border text-brand-primary cursor-pointer"
              />
              <span>Break / Recess</span>
            </label>
          </div>
        </article>
      ))}
    </div>
  );
};

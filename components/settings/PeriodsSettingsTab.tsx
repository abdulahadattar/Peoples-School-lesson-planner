import React from 'react';
import { Clock, Plus, Trash2 } from 'lucide-react';
import { PeriodTiming, SchoolConfig } from '../../services/schoolConfigService';
import { PeriodsMobileCards } from './PeriodsMobileCards';

export interface PeriodsSettingsTabProps {
  workingConfig: SchoolConfig;
  setWorkingConfig: React.Dispatch<React.SetStateAction<SchoolConfig>>;
  onAddPeriod: () => void;
  onPeriodChange: (index: number, field: keyof PeriodTiming, value: string | number | boolean) => void;
  onRemovePeriod: (index: number) => void;
}

export const PeriodsSettingsTab: React.FC<PeriodsSettingsTabProps> = ({
  workingConfig,
  setWorkingConfig,
  onAddPeriod,
  onPeriodChange,
  onRemovePeriod,
}) => {
  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header & Schedule Summary Note */}
      <section className="p-4 sm:p-5 rounded-2xl bg-brand-surface border border-brand-border space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <h2 className="text-sm font-bold text-brand-text-primary flex items-center gap-2">
              <Clock className="w-4 h-4 text-brand-primary" aria-hidden="true" />
              <span>Daily Bell Schedule</span>
            </h2>
            <p className="text-xs text-brand-text-secondary">
              Set morning assembly, class period windows, recess break, and Friday short-day timings.
            </p>
          </div>

          <button
            type="button"
            onClick={onAddPeriod}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 min-h-[44px] sm:min-h-[40px] w-full sm:w-auto rounded-xl text-xs font-semibold text-white bg-brand-primary hover:bg-brand-primary-hover shadow-soft active:scale-[0.98] transition-[background-color,transform] cursor-pointer whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Add Period</span>
          </button>
        </div>

        <div>
          <label
            htmlFor="timetable-note-input"
            className="block text-xs font-semibold text-brand-text-secondary mb-1.5"
          >
            Printed Schedule Summary Note
          </label>
          <input
            id="timetable-note-input"
            type="text"
            value={workingConfig.timetableNote || ''}
            onChange={(e) =>
              setWorkingConfig((prev) => ({ ...prev, timetableNote: e.target.value }))
            }
            placeholder="Regular Schedule: Mon-Thu 7 Periods, Friday 5 Periods"
            className="w-full px-3.5 py-2 rounded-xl text-xs bg-brand-panel/50 dark:bg-brand-panel border border-brand-border text-brand-text-primary focus:outline-none focus:border-brand-primary"
          />
        </div>
      </section>

      {/* Mobile Cards View */}
      <PeriodsMobileCards
        periods={workingConfig.periods}
        onPeriodChange={onPeriodChange}
        onRemovePeriod={onRemovePeriod}
      />

      {/* Desktop Periods Table */}
      <div className="hidden md:block rounded-2xl border border-brand-border bg-brand-surface overflow-hidden">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left text-xs border-collapse min-w-[720px]">
            <thead>
              <tr className="bg-brand-panel/60 border-b border-brand-border font-semibold text-brand-text-secondary">
                <th className="py-3 px-4">Period Name</th>
                <th className="py-3 px-4">Mon–Thu Start</th>
                <th className="py-3 px-4">Mon–Thu End</th>
                <th className="py-3 px-4">Friday Start</th>
                <th className="py-3 px-4">Friday End</th>
                <th className="py-3 px-3 text-center">Minutes</th>
                <th className="py-3 px-3 text-center">Break</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-border/70">
              {workingConfig.periods.map((period, idx) => (
                <tr
                  key={`${period.no}-${idx}`}
                  className={
                    period.isBreak
                      ? 'bg-amber-50/45 dark:bg-amber-950/20'
                      : 'hover:bg-brand-panel/40 transition-colors'
                  }
                >
                  <td className="py-2.5 px-4">
                    <input
                      type="text"
                      aria-label={`Period ${idx + 1} name`}
                      value={period.name}
                      onChange={(e) => onPeriodChange(idx, 'name', e.target.value)}
                      className="w-full max-w-[180px] px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-brand-panel/60 dark:bg-brand-panel border border-brand-border text-brand-text-primary focus:outline-none focus:border-brand-primary"
                    />
                  </td>
                  <td className="py-2.5 px-4">
                    <input
                      type="text"
                      aria-label={`${period.name} Monday to Thursday start`}
                      value={period.start}
                      onChange={(e) => onPeriodChange(idx, 'start', e.target.value)}
                      className="w-24 px-2.5 py-1.5 rounded-lg text-xs font-mono tabular-nums bg-brand-panel/60 dark:bg-brand-panel border border-brand-border text-brand-text-primary focus:outline-none focus:border-brand-primary"
                    />
                  </td>
                  <td className="py-2.5 px-4">
                    <input
                      type="text"
                      aria-label={`${period.name} Monday to Thursday end`}
                      value={period.end}
                      onChange={(e) => onPeriodChange(idx, 'end', e.target.value)}
                      className="w-24 px-2.5 py-1.5 rounded-lg text-xs font-mono tabular-nums bg-brand-panel/60 dark:bg-brand-panel border border-brand-border text-brand-text-primary focus:outline-none focus:border-brand-primary"
                    />
                  </td>
                  <td className="py-2.5 px-4">
                    <input
                      type="text"
                      aria-label={`${period.name} Friday start`}
                      value={period.friStart || ''}
                      onChange={(e) => onPeriodChange(idx, 'friStart', e.target.value)}
                      placeholder="—"
                      className="w-24 px-2.5 py-1.5 rounded-lg text-xs font-mono tabular-nums bg-brand-panel/60 dark:bg-brand-panel border border-brand-border text-brand-text-primary focus:outline-none focus:border-brand-primary"
                    />
                  </td>
                  <td className="py-2.5 px-4">
                    <input
                      type="text"
                      aria-label={`${period.name} Friday end`}
                      value={period.friEnd || ''}
                      onChange={(e) => onPeriodChange(idx, 'friEnd', e.target.value)}
                      placeholder="—"
                      className="w-24 px-2.5 py-1.5 rounded-lg text-xs font-mono tabular-nums bg-brand-panel/60 dark:bg-brand-panel border border-brand-border text-brand-text-primary focus:outline-none focus:border-brand-primary"
                    />
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <input
                      type="number"
                      min={5}
                      max={180}
                      aria-label={`${period.name} duration in minutes`}
                      value={period.durationMinutes ?? 40}
                      onChange={(e) =>
                        onPeriodChange(idx, 'durationMinutes', parseInt(e.target.value, 10) || 40)
                      }
                      className="w-16 px-2 py-1.5 rounded-lg text-xs text-center font-mono tabular-nums font-semibold bg-brand-panel/60 dark:bg-brand-panel border border-brand-border text-brand-primary focus:outline-none focus:border-brand-primary"
                    />
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <input
                      type="checkbox"
                      aria-label={`Mark ${period.name} as break`}
                      checked={Boolean(period.isBreak)}
                      onChange={(e) => onPeriodChange(idx, 'isBreak', e.target.checked)}
                      className="w-4 h-4 rounded border-brand-border text-brand-primary cursor-pointer"
                    />
                  </td>
                  <td className="py-2.5 px-4 text-right">
                    <button
                      type="button"
                      onClick={() => onRemovePeriod(idx)}
                      aria-label={`Remove ${period.name}`}
                      className="p-2 rounded-lg min-w-[36px] min-h-[36px] inline-flex items-center justify-center text-brand-text-secondary hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

import React from 'react';
import { Clock, Plus, Trash2 } from 'lucide-react';
import { PeriodTiming, SchoolConfig } from '../../services/schoolConfigService';

export interface PeriodsSettingsTabProps {
  workingConfig: SchoolConfig;
  onAddPeriod: () => void;
  onPeriodChange: (index: number, field: keyof PeriodTiming, value: any) => void;
  onRemovePeriod: (index: number) => void;
}

export const PeriodsSettingsTab: React.FC<PeriodsSettingsTabProps> = ({
  workingConfig,
  onAddPeriod,
  onPeriodChange,
  onRemovePeriod,
}) => {
  return (
    <div className="space-y-5 animate-fadeIn">
      <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-brand-surface border border-brand-border shadow-soft flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h3 className="text-sm font-bold text-brand-text-primary flex items-center gap-2">
            <Clock className="w-4 h-4 text-brand-primary" />
            <span>School Bell Timetable & Period Duration</span>
          </h3>
          <p className="text-xs text-brand-text-secondary">
            Adjust morning assembly, class period start/end timings, and Friday timings.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onAddPeriod}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-brand-primary hover:bg-brand-primary/90 shadow-soft active:scale-95 transition-all cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Period</span>
          </button>
        </div>
      </div>

      {/* Periods Table */}
      <div className="rounded-2xl border border-brand-border bg-white dark:bg-brand-surface shadow-soft overflow-hidden">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left text-xs border-collapse min-w-[640px]">
            <thead>
              <tr className="bg-slate-50/75 dark:bg-slate-900/40 border-b border-brand-border font-bold text-brand-text-secondary">
                <th className="py-3 px-4">Period Name</th>
                <th className="py-3 px-4">Mon–Thu Start</th>
                <th className="py-3 px-4">Mon–Thu End</th>
                <th className="py-3 px-4">Friday Start</th>
                <th className="py-3 px-4">Friday End</th>
                <th className="py-3 px-3 text-center">Duration</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-border/60">
              {workingConfig.periods.map((period, idx) => (
                <tr
                  key={idx}
                  className={
                    period.isBreak
                      ? 'bg-amber-50/40 dark:bg-amber-950/20 font-semibold'
                      : 'hover:bg-slate-50/50 dark:hover:bg-slate-800/30'
                  }
                >
                  <td className="py-3 px-4">
                    <input
                      type="text"
                      value={period.name}
                      onChange={(e) => onPeriodChange(idx, 'name', e.target.value)}
                      className="w-full max-w-[180px] px-2 py-1 rounded-lg text-xs font-bold bg-white dark:bg-brand-panel border border-brand-border text-brand-text-primary focus:outline-none focus:border-brand-primary"
                    />
                  </td>
                  <td className="py-3 px-4">
                    <input
                      type="text"
                      value={period.start}
                      onChange={(e) => onPeriodChange(idx, 'start', e.target.value)}
                      className="w-24 px-2 py-1 rounded-lg text-xs font-mono bg-white dark:bg-brand-panel border border-brand-border text-brand-text-primary focus:outline-none focus:border-brand-primary"
                    />
                  </td>
                  <td className="py-3 px-4">
                    <input
                      type="text"
                      value={period.end}
                      onChange={(e) => onPeriodChange(idx, 'end', e.target.value)}
                      className="w-24 px-2 py-1 rounded-lg text-xs font-mono bg-white dark:bg-brand-panel border border-brand-border text-brand-text-primary focus:outline-none focus:border-brand-primary"
                    />
                  </td>
                  <td className="py-3 px-4">
                    <input
                      type="text"
                      value={period.friStart || ''}
                      onChange={(e) => onPeriodChange(idx, 'friStart', e.target.value)}
                      placeholder="e.g. 8:15 AM"
                      className="w-24 px-2 py-1 rounded-lg text-xs font-mono bg-white dark:bg-brand-panel border border-brand-border text-brand-text-primary focus:outline-none focus:border-brand-primary"
                    />
                  </td>
                  <td className="py-3 px-4">
                    <input
                      type="text"
                      value={period.friEnd || ''}
                      onChange={(e) => onPeriodChange(idx, 'friEnd', e.target.value)}
                      placeholder="e.g. 8:50 AM"
                      className="w-24 px-2 py-1 rounded-lg text-xs font-mono bg-white dark:bg-brand-panel border border-brand-border text-brand-text-primary focus:outline-none focus:border-brand-primary"
                    />
                  </td>
                  <td className="py-3 px-3 text-center font-mono font-bold text-brand-primary">
                    {period.durationMinutes || 40}m
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button
                      type="button"
                      onClick={() => onRemovePeriod(idx)}
                      className="p-1 rounded-lg min-w-[36px] min-h-[36px] flex items-center justify-center text-brand-text-secondary hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors active:bg-rose-50 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
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

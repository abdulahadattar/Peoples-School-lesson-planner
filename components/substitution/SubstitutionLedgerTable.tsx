import React from 'react';
import { TeacherProxyStats } from '../../services/substitutionService';

export interface SubstitutionLedgerTableProps {
  filteredLedger: TeacherProxyStats[];
  searchLedger: string;
  setSearchLedger: (val: string) => void;
  equitySummary: {
    totalWeekProxies: number;
    avgLoad: string;
    heavyCount: number;
    moderateCount: number;
    optimalCount: number;
  };
  onInspectTeacher: (stats: TeacherProxyStats) => void;
}

export const SubstitutionLedgerTable: React.FC<SubstitutionLedgerTableProps> = ({
  filteredLedger,
  searchLedger,
  setSearchLedger,
  equitySummary,
  onInspectTeacher,
}) => {
  return (
    <div className="space-y-5 animate-fadeIn">
      {/* Equity Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-4 rounded-xl bg-white dark:bg-brand-surface border border-brand-border shadow-soft">
          <span className="text-[10px] uppercase font-bold text-brand-text-secondary">
            Proxies This Week
          </span>
          <span className="text-xl font-extrabold text-brand-primary font-mono block mt-0.5">
            {equitySummary.totalWeekProxies}
          </span>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-brand-surface border border-brand-border shadow-soft">
          <span className="text-[10px] uppercase font-bold text-brand-text-secondary">
            Avg Weekly Load / Staff
          </span>
          <span className="text-xl font-extrabold text-brand-text-primary font-mono block mt-0.5">
            {equitySummary.avgLoad} periods
          </span>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-brand-surface border border-brand-border shadow-soft">
          <span className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400">
            Optimal Load Staff
          </span>
          <span className="text-xl font-extrabold text-emerald-700 dark:text-emerald-300 font-mono block mt-0.5">
            {equitySummary.optimalCount}
          </span>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-brand-surface border border-brand-border shadow-soft">
          <span className="text-[10px] uppercase font-bold text-rose-600 dark:text-rose-400">
            High Burden Staff (≥3)
          </span>
          <span className="text-xl font-extrabold text-rose-700 dark:text-rose-300 font-mono block mt-0.5">
            {equitySummary.heavyCount}
          </span>
        </div>
      </div>

      {/* Search & Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-brand-text-secondary">
            Staff Workload Distribution & Assignment History
          </h4>
          <p className="text-[11px] text-brand-text-secondary">
            Monitors proxy fairness over the current week and month to prevent faculty burnout.
          </p>
        </div>
        <div className="w-full sm:w-64">
          <input
            type="text"
            value={searchLedger}
            onChange={e => setSearchLedger(e.target.value)}
            placeholder="Search teacher by name..."
            className="w-full px-3 py-1.5 text-xs rounded-xl bg-brand-surface border border-brand-border text-brand-text-primary outline-hidden focus:border-brand-primary"
          />
        </div>
      </div>

      {/* Faculty Ledger Table */}
      <div className="bg-brand-surface rounded-2xl border border-brand-border overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-brand-bg/80 border-b border-brand-border text-brand-text-secondary font-semibold">
                <th className="py-3 px-4">Faculty Member</th>
                <th className="py-3 px-3 text-center">Today</th>
                <th className="py-3 px-3 text-center">This Week</th>
                <th className="py-3 px-3 text-center">This Month</th>
                <th className="py-3 px-3 text-center">Total Lifetime</th>
                <th className="py-3 px-3 text-center">Equity Status</th>
                <th className="py-3 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-border">
              {filteredLedger.map(stats => {
                return (
                  <tr key={stats.teacherId} className="hover:bg-brand-bg/30 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-bold text-brand-text-primary text-xs">
                        {stats.teacherName}
                      </div>
                      <div className="text-[11px] text-brand-text-secondary">
                        {stats.designation || 'Faculty Member'}
                      </div>
                    </td>

                    <td className="py-3 px-3 text-center font-mono font-bold text-brand-text-primary">
                      {stats.todayCount > 0 ? (
                        <span className="px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300">
                          {stats.todayCount}
                        </span>
                      ) : (
                        <span className="text-brand-text-secondary/40">0</span>
                      )}
                    </td>

                    <td className="py-3 px-3 text-center font-mono font-bold">
                      <span
                        className={`px-2.5 py-0.5 rounded-full ${
                          stats.thisWeekCount === 0
                            ? 'bg-slate-100 dark:bg-slate-800 text-brand-text-secondary'
                            : stats.thisWeekCount < 3
                            ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300'
                            : 'bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300'
                        }`}
                      >
                        {stats.thisWeekCount}
                      </span>
                    </td>

                    <td className="py-3 px-3 text-center font-mono text-brand-text-primary font-semibold">
                      {stats.thisMonthCount}
                    </td>

                    <td className="py-3 px-3 text-center font-mono text-brand-text-secondary font-medium">
                      {stats.totalCount}
                    </td>

                    <td className="py-3 px-3 text-center">
                      {stats.loadLevel === 'heavy' ? (
                        <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900/40">
                          Heavy (≥3)
                        </span>
                      ) : stats.loadLevel === 'moderate' ? (
                        <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-900/40">
                          Moderate (2)
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/40">
                          Optimal (0-1)
                        </span>
                      )}
                    </td>

                    <td className="py-3 px-3 text-right">
                      <button
                        type="button"
                        onClick={() => onInspectTeacher(stats)}
                        className="px-2.5 py-1 text-xs rounded-lg bg-brand-bg hover:bg-brand-border text-brand-text-secondary hover:text-brand-text-primary border border-brand-border transition-colors cursor-pointer"
                      >
                        View Log ({stats.recentAssignments.length})
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

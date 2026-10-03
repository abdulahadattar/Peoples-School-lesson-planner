import React from 'react';

export interface RecordsStats {
  total: number;
  promoted: number;
  newEnrollment: number;
  dropOut: number;
  male: number;
  female: number;
}

export interface RecordsStatsStripProps {
  stats: RecordsStats;
}

export const RecordsStatsStrip: React.FC<RecordsStatsStripProps> = React.memo(({ stats }) => {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-black/[0.06] dark:border-white/[0.08] shadow-xs">
        <span className="text-[10px] uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400 block">
          Total Students
        </span>
        <span className="text-xl font-extrabold text-slate-900 dark:text-white font-mono mt-0.5 block">
          {stats.total.toLocaleString()}
        </span>
      </div>
      <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-black/[0.06] dark:border-white/[0.08] shadow-xs">
        <span className="text-[10px] uppercase tracking-wider font-bold text-emerald-600 dark:text-emerald-400 block">
          Promoted / Active
        </span>
        <span className="text-xl font-extrabold text-emerald-700 dark:text-emerald-300 font-mono mt-0.5 block">
          {stats.promoted.toLocaleString()}
        </span>
      </div>
      <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-black/[0.06] dark:border-white/[0.08] shadow-xs">
        <span className="text-[10px] uppercase tracking-wider font-bold text-sky-600 dark:text-sky-400 block">
          New Enrollment
        </span>
        <span className="text-xl font-extrabold text-sky-700 dark:text-sky-300 font-mono mt-0.5 block">
          {stats.newEnrollment.toLocaleString()}
        </span>
      </div>
      <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-black/[0.06] dark:border-white/[0.08] shadow-xs">
        <span className="text-[10px] uppercase tracking-wider font-bold text-rose-600 dark:text-rose-400 block">
          Drop Outs
        </span>
        <span className="text-xl font-extrabold text-rose-700 dark:text-rose-300 font-mono mt-0.5 block">
          {stats.dropOut.toLocaleString()}
        </span>
      </div>
      <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-black/[0.06] dark:border-white/[0.08] shadow-xs">
        <span className="text-[10px] uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400 block">
          Male Students
        </span>
        <span className="text-xl font-extrabold text-slate-900 dark:text-white font-mono mt-0.5 block">
          {stats.male.toLocaleString()}
        </span>
      </div>
      <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-black/[0.06] dark:border-white/[0.08] shadow-xs">
        <span className="text-[10px] uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400 block">
          Female Students
        </span>
        <span className="text-xl font-extrabold text-slate-900 dark:text-white font-mono mt-0.5 block">
          {stats.female.toLocaleString()}
        </span>
      </div>
    </div>
  );
});

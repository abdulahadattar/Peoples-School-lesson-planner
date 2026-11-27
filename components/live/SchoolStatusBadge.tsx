import React from 'react';
import { SchoolTimeStatus, formatMinutes } from '../../services/timetable';
import { LiveDot } from './LiveCommon';

export interface SchoolStatusBadgeProps {
  schoolStatus: SchoolTimeStatus | null;
}

export const SchoolStatusBadge: React.FC<SchoolStatusBadgeProps> = ({ schoolStatus }) => {
  if (!schoolStatus) return null;

  return (
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
          <span className="font-bold text-amber-600 dark:text-amber-400">Recess Break</span>
          <span className="text-slate-400 font-mono tabular-nums text-[11px]">
            ({schoolStatus.remainingMinutes}m left · Next: P{schoolStatus.nextPeriodNo})
          </span>
        </>
      )}
      {schoolStatus.state === 'before_school' && (
        <>
          <span>🌅</span>
          <span className="font-bold text-blue-600 dark:text-blue-400">Pre-Assembly</span>
          <span className="text-slate-400 text-xs">
            · P1 at {formatMinutes(schoolStatus.firstPeriodStart)}
          </span>
        </>
      )}
      {schoolStatus.state === 'after_school' && (
        <>
          <span>🏁</span>
          <span className="font-bold text-slate-500">Classes Dismissed</span>
          <span className="text-slate-400 text-[11px]">
            (ended {formatMinutes(schoolStatus.lastPeriodEnd)})
          </span>
        </>
      )}
    </div>
  );
};

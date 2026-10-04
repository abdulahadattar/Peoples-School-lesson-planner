import React from 'react';
import { ClassAttendanceRow } from '../../services/attendanceService';
import {
  getAttendanceProgressColor as getProgressColor,
  getAttendanceTextColor as getTextColor,
  getAttendanceBadgeBg as getBadgeBg,
} from './attendanceUtils';

export interface AttendanceTableRowProps {
  row: ClassAttendanceRow;
  index: number;
  onInputChange: (classKey: string, field: 'presentBoys' | 'presentGirls', val: string, maxVal: number) => void;
}

export const AttendanceTableRow: React.FC<AttendanceTableRowProps> = React.memo(({
  row,
  index,
  onInputChange,
}) => {
  const isGrade9 = row.classKey === 'IX';

  return (
    <tr
      className={`hover:bg-brand-surface/70 transition-colors ${
        isGrade9 ? 'bg-brand-primary/5' : index % 2 === 1 ? 'bg-brand-bg/30' : ''
      }`}
    >
      {/* Grade Name */}
      <td className="py-3 px-4 font-semibold text-brand-text-primary">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-lg bg-brand-primary/10 text-brand-primary flex items-center justify-center text-[10px] font-bold shrink-0">
              {row.romanName}
            </span>
            <div>
              <div className="font-bold text-xs">{row.displayName}</div>
              {row.classTeacher && (
                <div className="text-[10px] text-brand-text-secondary mt-0.5">
                  Teacher: {row.classTeacher}
                </div>
              )}
            </div>
          </div>
        </div>
      </td>

      {/* Enrolled */}
      <td className="py-3 px-3 text-center">
        <div className="font-bold text-sm text-brand-text-primary">
          {row.totalEnrolled}
        </div>
        <div className="text-[10px] text-brand-text-secondary">
          B: {row.enrolledBoys} | G: {row.enrolledGirls}
        </div>
      </td>

      {/* Present Boys Input */}
      <td className="py-2.5 px-3 text-center bg-blue-50/20 dark:bg-blue-950/10">
        <div className="flex items-center justify-center">
          <div className="relative w-20">
            <input
              type="number"
              inputMode="numeric"
              autoComplete="off"
              min="0"
              max={row.enrolledBoys}
              placeholder="0"
              value={row.presentBoys}
              onChange={(e) =>
                onInputChange(row.classKey, 'presentBoys', e.target.value, row.enrolledBoys)
              }
              className={`w-full h-9 text-center font-bold text-sm rounded-xl border bg-brand-bg text-brand-text-primary focus:outline-none focus:ring-2 transition-all ${
                typeof row.presentBoys === 'number' && row.presentBoys > row.enrolledBoys
                  ? 'border-rose-500 focus:ring-rose-200'
                  : 'border-brand-border focus:border-blue-500 focus:ring-blue-100 dark:focus:ring-blue-950'
              }`}
            />
            <span className="absolute right-2 top-2.5 text-[10px] text-brand-text-secondary/60 pointer-events-none">
              /{row.enrolledBoys}
            </span>
          </div>
        </div>
      </td>

      {/* Present Girls Input */}
      <td className="py-2.5 px-3 text-center bg-pink-50/20 dark:bg-pink-950/10">
        <div className="flex items-center justify-center">
          <div className="relative w-20">
            <input
              type="number"
              inputMode="numeric"
              autoComplete="off"
              min="0"
              max={row.enrolledGirls}
              placeholder="0"
              value={row.presentGirls}
              onChange={(e) =>
                onInputChange(row.classKey, 'presentGirls', e.target.value, row.enrolledGirls)
              }
              className={`w-full h-9 text-center font-bold text-sm rounded-xl border bg-brand-bg text-brand-text-primary focus:outline-none focus:ring-2 transition-all ${
                typeof row.presentGirls === 'number' && row.presentGirls > row.enrolledGirls
                  ? 'border-rose-500 focus:ring-rose-200'
                  : 'border-brand-border focus:border-pink-500 focus:ring-pink-100 dark:focus:ring-pink-950'
              }`}
            />
            <span className="absolute right-2 top-2.5 text-[10px] text-brand-text-secondary/60 pointer-events-none">
              /{row.enrolledGirls}
            </span>
          </div>
        </div>
      </td>

      {/* Total Present (Formula Sum) */}
      <td className="py-3 px-3 text-center font-bold">
        <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 font-bold text-xs border border-emerald-200 dark:border-emerald-800">
          {row.totalPresent}
        </span>
      </td>

      {/* Absent Count */}
      <td className="py-3 px-3 text-center">
        <span
          className={`font-semibold ${
            row.absentTotal > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600'
          }`}
        >
          {row.absentTotal}
        </span>
        {row.absentTotal > 0 && (
          <div className="text-[10px] text-brand-text-secondary">
            B:{row.absentBoys} G:{row.absentGirls}
          </div>
        )}
      </td>

      {/* Percentage */}
      <td className="py-3 px-3 text-center">
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-md font-bold text-xs border ${getBadgeBg(
            row.percentage
          )} ${getTextColor(row.percentage)}`}
        >
          {row.percentage}%
        </span>
      </td>

      {/* Proportional Percentage Bar */}
      <td className="py-3 px-4">
        <div className="space-y-1">
          <div className="w-full h-3 bg-brand-bg rounded-full overflow-hidden p-0.5 border border-brand-border">
            <div
              className={`h-full rounded-full transition-all duration-300 ${getProgressColor(
                row.percentage
              )}`}
              style={{ width: `${row.percentage}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-brand-text-secondary font-medium">
            <span>B: {row.boysPercentage}%</span>
            <span>G: {row.girlsPercentage}%</span>
          </div>
        </div>
      </td>
    </tr>
  );
});

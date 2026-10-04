import React from 'react';
import { ClassAttendanceRow, SchoolAttendanceSummary } from '../../services/attendanceService';
import { AttendanceTableRow } from './AttendanceTableRow';
import {
  getAttendanceProgressColor as getProgressColor,
  getAttendanceTextColor as getTextColor,
  getAttendanceBadgeBg as getBadgeBg,
} from './attendanceUtils';

export interface AttendanceTableProps {
  rows: ClassAttendanceRow[];
  schoolSummary: SchoolAttendanceSummary;
  recordedBy: string;
  onRecordedByChange: (val: string) => void;
  onInputChange: (classKey: string, field: 'presentBoys' | 'presentGirls', val: string, maxVal: number) => void;
}

export const AttendanceTable: React.FC<AttendanceTableProps> = ({
  rows,
  schoolSummary,
  recordedBy,
  onRecordedByChange,
  onInputChange,
}) => {
  return (
    <div className="glass-card rounded-2xl border border-brand-border shadow-soft overflow-hidden">
      <div className="p-4 sm:p-5 border-b border-brand-border flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-brand-text-primary">
            All Grades Roster (ECCE to Grade 12)
          </h3>
          <p className="text-xs text-brand-text-secondary mt-0.5">
            Separate input cells for Boys and Girls. Formulas calculate total present, absentees, and percentages automatically.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-brand-text-secondary font-medium">Attendance In-Charge:</span>
          <input
            type="text"
            value={recordedBy}
            onChange={e => onRecordedByChange(e.target.value)}
            placeholder="e.g. Miss Shahida"
            className="h-8 px-2.5 text-xs rounded-lg bg-brand-bg border border-brand-border text-brand-text-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
          />
        </div>
      </div>

      {/* Responsive Table */}
      <div className="overflow-x-auto custom-scrollbar">
        <table className="w-full text-left text-xs border-collapse min-w-[840px]">
          <thead>
            <tr className="bg-brand-bg/80 border-b border-brand-border text-brand-text-secondary font-bold uppercase tracking-wider text-[10px]">
              <th className="py-3 px-4 min-w-[140px]">Grade / Class</th>
              <th className="py-3 px-3 text-center min-w-[90px]">Enrolled</th>
              <th className="py-3 px-3 text-center min-w-[110px] bg-blue-50/40 dark:bg-blue-950/20 text-blue-700 dark:text-blue-300">
                Present Boys
              </th>
              <th className="py-3 px-3 text-center min-w-[110px] bg-pink-50/40 dark:bg-pink-950/20 text-pink-700 dark:text-pink-300">
                Present Girls
              </th>
              <th className="py-3 px-3 text-center min-w-[100px]">Total Present</th>
              <th className="py-3 px-3 text-center min-w-[80px]">Absent</th>
              <th className="py-3 px-3 text-center min-w-[80px]">Att. %</th>
              <th className="py-3 px-4 min-w-[180px]">Attendance Bar</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-border/60">
            {rows.map((row, index) => (
              <AttendanceTableRow
                key={row.classKey}
                row={row}
                index={index}
                onInputChange={onInputChange}
              />
            ))}
          </tbody>

          {/* Total Attendance Row */}
          <tfoot>
            <tr className="bg-brand-bg/90 border-t-2 border-brand-border font-bold text-brand-text-primary text-xs">
              <td className="py-4 px-4 font-black">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-brand-primary" />
                  <span>TOTAL ATTENDANCE</span>
                </div>
              </td>
              <td className="py-4 px-3 text-center font-extrabold text-sm">
                {schoolSummary.totalEnrolled}
              </td>
              <td className="py-4 px-3 text-center text-blue-700 dark:text-blue-300 font-extrabold text-sm bg-blue-50/40 dark:bg-blue-950/20">
                {schoolSummary.presentBoys}
              </td>
              <td className="py-4 px-3 text-center text-pink-700 dark:text-pink-300 font-extrabold text-sm bg-pink-50/40 dark:bg-pink-950/20">
                {schoolSummary.presentGirls}
              </td>
              <td className="py-4 px-3 text-center">
                <span className="inline-flex items-center justify-center px-3 py-1.5 rounded-xl bg-emerald-600 text-white font-black text-sm shadow-xs">
                  {schoolSummary.totalPresent}
                </span>
              </td>
              <td className="py-4 px-3 text-center text-rose-600 font-extrabold text-sm">
                {schoolSummary.totalAbsent}
              </td>
              <td className="py-4 px-3 text-center">
                <span
                  className={`inline-flex items-center px-2.5 py-1 rounded-lg font-black text-xs border ${getBadgeBg(
                    schoolSummary.overallPercentage
                  )} ${getTextColor(schoolSummary.overallPercentage)}`}
                >
                  {schoolSummary.overallPercentage}%
                </span>
              </td>
              <td className="py-4 px-4">
                <div className="w-full h-3.5 bg-brand-bg rounded-full overflow-hidden p-0.5 border border-brand-border">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${getProgressColor(
                      schoolSummary.overallPercentage
                    )}`}
                    style={{ width: `${schoolSummary.overallPercentage}%` }}
                  />
                </div>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};

import React from 'react';
import { ClassEnrollment } from '../../services/attendanceService';

export interface EnrollmentTableBodyProps {
  enrollments: ClassEnrollment[];
  isAdmin: boolean;
  onFieldChange: (
    index: number,
    field: 'totalEnrollment' | 'enrolledBoys' | 'enrolledGirls',
    value: string
  ) => void;
}

export const EnrollmentTableBody: React.FC<EnrollmentTableBodyProps> = ({
  enrollments,
  isAdmin,
  onFieldChange,
}) => {
  return (
    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
      {enrollments.map((enr, idx) => (
        <tr key={enr.classKey} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
          <td className="py-2 px-3 font-medium text-slate-800 dark:text-slate-200">
            <span className="inline-block px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold mr-2">
              {enr.romanName}
            </span>
            <span className="text-xs text-slate-400 font-mono">({enr.classKey})</span>
          </td>
          <td className="py-2 px-3 text-center">
            <input
              type="number"
              inputMode="numeric"
              autoComplete="off"
              min="0"
              disabled={!isAdmin}
              value={enr.totalEnrollment ?? (enr.enrolledBoys + enr.enrolledGirls)}
              onChange={(e) => onFieldChange(idx, 'totalEnrollment', e.target.value)}
              className={`w-20 px-2.5 py-1.5 text-center text-sm font-semibold rounded-lg border transition-colors ${
                isAdmin
                  ? 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-900 dark:text-white shadow-2xs'
                  : 'bg-slate-100 dark:bg-slate-800/60 border-transparent text-slate-500 cursor-not-allowed'
              }`}
            />
          </td>
          <td className="py-2 px-3 text-center">
            <input
              type="number"
              inputMode="numeric"
              autoComplete="off"
              min="0"
              disabled={!isAdmin}
              value={enr.enrolledBoys}
              onChange={(e) => onFieldChange(idx, 'enrolledBoys', e.target.value)}
              className={`w-20 px-2.5 py-1.5 text-center text-sm font-semibold rounded-lg border transition-colors ${
                isAdmin
                  ? 'bg-white dark:bg-slate-900 border-blue-200 dark:border-blue-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-blue-900 dark:text-blue-300 shadow-2xs'
                  : 'bg-slate-100 dark:bg-slate-800/60 border-transparent text-slate-500 cursor-not-allowed'
              }`}
            />
          </td>
          <td className="py-2 px-3 text-center">
            <input
              type="number"
              inputMode="numeric"
              autoComplete="off"
              min="0"
              disabled={!isAdmin}
              value={enr.enrolledGirls}
              onChange={(e) => onFieldChange(idx, 'enrolledGirls', e.target.value)}
              className={`w-20 px-2.5 py-1.5 text-center text-sm font-semibold rounded-lg border transition-colors ${
                isAdmin
                  ? 'bg-white dark:bg-slate-900 border-pink-200 dark:border-pink-800 focus:border-pink-500 focus:ring-1 focus:ring-pink-500 text-pink-900 dark:text-pink-300 shadow-2xs'
                  : 'bg-slate-100 dark:bg-slate-800/60 border-transparent text-slate-500 cursor-not-allowed'
              }`}
            />
          </td>
        </tr>
      ))}
    </tbody>
  );
};

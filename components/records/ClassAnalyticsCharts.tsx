import React, { useState, useMemo } from 'react';
import {
  BarChart3,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { StudentRecord } from '../../services/googleSheetsService';
import { ClassChartsKpiCards } from './analytics/ClassChartsKpiCards';
import { ClassBarChart } from './analytics/ClassBarChart';
import { EnrollmentStatusPieChart } from './analytics/EnrollmentStatusPieChart';

export const CLASS_ORDER: Record<string, number> = {
  KACHI: 0,
  KGA: 0,
  KGB: 0,
  NURSERY: 0,
  'PRE-K': 0,
  I: 1,
  '1': 1,
  II: 2,
  '2': 2,
  III: 3,
  '3': 3,
  IV: 4,
  '4': 4,
  V: 5,
  '5': 5,
  VI: 6,
  '6': 6,
  VII: 7,
  '7': 7,
  VIII: 8,
  '8': 8,
  IX: 9,
  '9': 9,
  X: 10,
  '10': 10,
  XI: 11,
  '11': 11,
  XII: 12,
  '12': 12,
};

export interface ClassAnalyticsChartsProps {
  records: StudentRecord[];
  selectedClass: string;
  onSelectClass: (className: string) => void;
}

export type ChartTab = 'students' | 'gender' | 'status';

export const ClassAnalyticsCharts: React.FC<ClassAnalyticsChartsProps> = ({
  records,
  selectedClass,
  onSelectClass,
}) => {
  const [activeTab, setActiveTab] = useState<ChartTab>('students');
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);

  const { classData, statusData, largestClass, totalStudents, maleCount, femaleCount } =
    useMemo(() => {
      const classMap: Record<
        string,
        { className: string; total: number; male: number; female: number; order: number }
      > = {};

      const statusMap: Record<string, number> = {};
      let male = 0;
      let female = 0;

      records.forEach((r) => {
        const rawClass = (r.currentClass || 'Unassigned').trim();
        const upperClass = rawClass.toUpperCase();
        const order = CLASS_ORDER[upperClass] ?? 99;

        if (!classMap[rawClass]) {
          classMap[rawClass] = {
            className: rawClass,
            total: 0,
            male: 0,
            female: 0,
            order,
          };
        }

        classMap[rawClass].total += 1;

        const g = (r.gender || '').trim().toLowerCase();
        if (g.startsWith('m')) {
          classMap[rawClass].male += 1;
          male += 1;
        } else if (g.startsWith('f')) {
          classMap[rawClass].female += 1;
          female += 1;
        }

        const s = (r.status || 'Active').trim();
        statusMap[s] = (statusMap[s] || 0) + 1;
      });

      const sortedClasses = Object.values(classMap).sort((a, b) => {
        if (a.order !== b.order) return a.order - b.order;
        return a.className.localeCompare(b.className);
      });

      const sortedStatus = Object.entries(statusMap)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value);

      let largest = { className: '—', total: 0 };
      sortedClasses.forEach((c) => {
        if (c.total > largest.total) {
          largest = { className: c.className, total: c.total };
        }
      });

      return {
        classData: sortedClasses,
        statusData: sortedStatus,
        largestClass: largest,
        totalStudents: records.length,
        maleCount: male,
        femaleCount: female,
      };
    }, [records]);

  return (
    <div className="rounded-2xl bg-white dark:bg-brand-surface border border-brand-border shadow-card overflow-hidden transition-all">
      <div className="p-4 sm:p-5 border-b border-brand-border flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 bg-slate-50/50 dark:bg-slate-900/40">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-primary/10 text-brand-primary flex items-center justify-center flex-shrink-0 border border-brand-primary/20">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-extrabold text-brand-text-primary tracking-tight">
              Class Distribution
            </h2>
            <p className="text-xs text-brand-text-secondary mt-0.5">
              Students across {classData.length} classes. Click a bar to filter the records table.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
          <div className="flex items-center bg-brand-bg border border-brand-border rounded-xl p-1 text-xs">
            <button
              type="button"
              onClick={() => {
                setActiveTab('students');
                setIsCollapsed(false);
              }}
              className={`px-3 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                activeTab === 'students' && !isCollapsed
                  ? 'bg-white dark:bg-brand-surface text-brand-primary shadow-xs'
                  : 'text-brand-text-secondary hover:text-brand-text-primary'
              }`}
            >
              Students per Class
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('gender');
                setIsCollapsed(false);
              }}
              className={`px-3 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                activeTab === 'gender' && !isCollapsed
                  ? 'bg-white dark:bg-brand-surface text-brand-primary shadow-xs'
                  : 'text-brand-text-secondary hover:text-brand-text-primary'
              }`}
            >
              Boys vs Girls
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('status');
                setIsCollapsed(false);
              }}
              className={`px-3 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                activeTab === 'status' && !isCollapsed
                  ? 'bg-white dark:bg-brand-surface text-brand-primary shadow-xs'
                  : 'text-brand-text-secondary hover:text-brand-text-primary'
              }`}
            >
              Enrollment Status
            </button>
          </div>

          <button
            type="button"
            onClick={() => setIsCollapsed((prev) => !prev)}
            title={isCollapsed ? 'Expand Charts' : 'Collapse Charts'}
            className="p-1.5 rounded-xl min-w-[36px] min-h-[36px] flex items-center justify-center border border-brand-border bg-white dark:bg-brand-surface text-brand-text-secondary hover:text-brand-text-primary transition-colors active:bg-brand-bg cursor-pointer"
          >
            {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {!isCollapsed && (
        <div className="p-4 sm:p-6 space-y-6 animate-fadeIn">
          <ClassChartsKpiCards
            largestClass={largestClass}
            totalStudents={totalStudents}
            classCount={classData.length}
            maleCount={maleCount}
            femaleCount={femaleCount}
            selectedClass={selectedClass}
            onSelectClass={onSelectClass}
          />

          <div className="h-72 w-full pt-2">
            {activeTab === 'status' ? (
              <EnrollmentStatusPieChart statusData={statusData} totalStudents={totalStudents} />
            ) : (
              <ClassBarChart
                data={classData}
                selectedClass={selectedClass}
                mode={activeTab}
                totalStudents={totalStudents}
                onSelectClass={onSelectClass}
              />
            )}
          </div>

          <div className="flex items-center justify-between text-[11px] text-brand-text-secondary pt-2 border-t border-brand-border/60">
            <span>Showing student distribution for Peoples Higher Secondary School Jamshoro</span>
            <span className="hidden sm:inline-block">Click any bar to filter student register below</span>
          </div>
        </div>
      )}
    </div>
  );
};

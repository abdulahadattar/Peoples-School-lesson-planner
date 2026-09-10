import React, { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  Cell,
  PieChart,
  Pie,
} from 'recharts';
import {
  BarChart3,
  Users,
  PieChart as PieIcon,
  Filter,
  ArrowUpRight,
  Sparkles,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { StudentRecord } from '../../services/googleSheetsService';

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

interface ClassAnalyticsChartsProps {
  records: StudentRecord[];
  selectedClass: string;
  onSelectClass: (className: string) => void;
}

type ChartTab = 'students' | 'gender' | 'status';

export const ClassAnalyticsCharts: React.FC<ClassAnalyticsChartsProps> = ({
  records,
  selectedClass,
  onSelectClass,
}) => {
  const [activeTab, setActiveTab] = useState<ChartTab>('students');
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);

  // Compute aggregated class data
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

        // Status
        const s = (r.status || 'Active').trim();
        statusMap[s] = (statusMap[s] || 0) + 1;
      });

      // Sort classes in educational progression
      const sortedClasses = Object.values(classMap).sort((a, b) => {
        if (a.order !== b.order) return a.order - b.order;
        return a.className.localeCompare(b.className);
      });

      // Status array
      const sortedStatus = Object.entries(statusMap)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value);

      // Largest class
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

  // Color palette for charts
  const STATUS_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const pct = totalStudents > 0 ? ((data.total / totalStudents) * 100).toFixed(1) : '0';
      return (
        <div className="bg-slate-900/95 text-white p-3 rounded-xl shadow-xl text-xs border border-slate-700/60 backdrop-blur-md">
          <p className="font-bold text-sm text-emerald-400 mb-1">Class {data.className}</p>
          <div className="space-y-1">
            <p className="flex justify-between gap-4 text-slate-300">
              <span>Total Students:</span>
              <span className="font-bold text-white font-mono">{data.total}</span>
            </p>
            <p className="flex justify-between gap-4 text-slate-300">
              <span>School Share:</span>
              <span className="font-semibold text-slate-200">{pct}%</span>
            </p>
            <div className="pt-1.5 mt-1 border-t border-slate-800 flex items-center justify-between gap-3 text-[11px]">
              <span className="text-sky-400">Boys: {data.male}</span>
              <span className="text-rose-400">Girls: {data.female}</span>
            </div>
            <p className="text-[10px] text-emerald-300/80 pt-1 italic">Click bar to filter table</p>
          </div>
        </div>
      );
    }
    return null;
  };

  const CustomStatusTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0];
      const pct = totalStudents > 0 ? ((data.value / totalStudents) * 100).toFixed(1) : '0';
      return (
        <div className="bg-slate-900/95 text-white p-2.5 rounded-xl shadow-xl text-xs border border-slate-700/60 backdrop-blur-md">
          <p className="font-bold text-sm text-white mb-0.5">{data.name}</p>
          <p className="text-slate-300">
            Count: <strong className="text-white font-mono">{data.value}</strong> ({pct}%)
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="rounded-2xl bg-white dark:bg-brand-surface border border-brand-border shadow-card overflow-hidden transition-all">
      {/* Header with Title and Tab Navigation */}
      <div className="p-4 sm:p-5 border-b border-brand-border flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 bg-slate-50/50 dark:bg-slate-900/40">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-primary/10 text-brand-primary flex items-center justify-center flex-shrink-0 border border-brand-primary/20">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-extrabold text-brand-text-primary tracking-tight">
              Class Distribution & Student Visualizations
            </h2>
            <p className="text-xs text-brand-text-secondary mt-0.5">
              Interactive breakdown across {classData.length} grade levels. Click any bar to instantly filter the records table.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
          {/* Tab Selector */}
          <div className="flex items-center bg-brand-bg border border-brand-border rounded-xl p-1 text-xs">
            <button
              type="button"
              onClick={() => {
                setActiveTab('students');
                setIsCollapsed(false);
              }}
              className={`px-3 py-1 rounded-lg font-semibold transition-all ${
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
              className={`px-3 py-1 rounded-lg font-semibold transition-all ${
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
              className={`px-3 py-1 rounded-lg font-semibold transition-all ${
                activeTab === 'status' && !isCollapsed
                  ? 'bg-white dark:bg-brand-surface text-brand-primary shadow-xs'
                  : 'text-brand-text-secondary hover:text-brand-text-primary'
              }`}
            >
              Enrollment Status
            </button>
          </div>

          {/* Expand / Collapse Button */}
          <button
            type="button"
            onClick={() => setIsCollapsed((prev) => !prev)}
            title={isCollapsed ? 'Expand Charts' : 'Collapse Charts'}
            className="p-1.5 rounded-xl border border-brand-border bg-white dark:bg-brand-surface text-brand-text-secondary hover:text-brand-text-primary transition-colors"
          >
            {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Collapsible Chart Body */}
      {!isCollapsed && (
        <div className="p-4 sm:p-6 space-y-6 animate-fadeIn">
          {/* Quick KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-xl bg-slate-50/70 dark:bg-slate-900/40 border border-brand-border/80">
              <span className="text-[10px] font-bold uppercase tracking-wider text-brand-text-secondary block">
                Largest Class Strength
              </span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-lg font-extrabold text-brand-primary font-mono">
                  Class {largestClass.className}
                </span>
                <span className="text-xs text-brand-text-secondary font-semibold">
                  ({largestClass.total} students)
                </span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50/70 dark:bg-slate-900/40 border border-brand-border/80">
              <span className="text-[10px] font-bold uppercase tracking-wider text-brand-text-secondary block">
                Average Class Strength
              </span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-lg font-extrabold text-brand-text-primary font-mono">
                  {classData.length > 0 ? Math.round(totalStudents / classData.length) : 0}
                </span>
                <span className="text-xs text-brand-text-secondary">students / grade</span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50/70 dark:bg-slate-900/40 border border-brand-border/80">
              <span className="text-[10px] font-bold uppercase tracking-wider text-sky-600 dark:text-sky-400 block">
                Boys Enrolled
              </span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-lg font-extrabold text-sky-700 dark:text-sky-300 font-mono">
                  {maleCount.toLocaleString()}
                </span>
                <span className="text-xs text-brand-text-secondary">
                  ({totalStudents > 0 ? ((maleCount / totalStudents) * 100).toFixed(0) : 0}%)
                </span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50/70 dark:bg-slate-900/40 border border-brand-border/80">
              <span className="text-[10px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400 block">
                Girls Enrolled
              </span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-lg font-extrabold text-rose-700 dark:text-rose-300 font-mono">
                  {femaleCount.toLocaleString()}
                </span>
                <span className="text-xs text-brand-text-secondary">
                  ({totalStudents > 0 ? ((femaleCount / totalStudents) * 100).toFixed(0) : 0}%)
                </span>
              </div>
            </div>
          </div>

          {/* Selected Class Filter Pill Hint */}
          {selectedClass !== 'all' && (
            <div className="flex items-center justify-between px-3.5 py-2 rounded-xl bg-brand-primary/10 border border-brand-primary/20 text-xs">
              <span className="font-semibold text-brand-primary flex items-center gap-1.5">
                <Filter className="w-3.5 h-3.5" />
                Filtering student records by: <strong>Class {selectedClass}</strong>
              </span>
              <button
                type="button"
                onClick={() => onSelectClass('all')}
                className="text-xs font-bold text-brand-primary hover:underline"
              >
                Reset to All Classes
              </button>
            </div>
          )}

          {/* Chart Display Area */}
          <div className="h-72 w-full pt-2">
            {activeTab === 'students' && (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={classData}
                  margin={{ top: 15, right: 10, left: -10, bottom: 20 }}
                  onClick={(state: any) => {
                    if (state?.activePayload && state.activePayload.length > 0) {
                      const clickedClass = state.activePayload[0].payload?.className;
                      if (clickedClass) {
                        onSelectClass(selectedClass === clickedClass ? 'all' : clickedClass);
                      }
                    }
                  }}
                  className="cursor-pointer"
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.6} vertical={false} />
                  <XAxis
                    dataKey="className"
                    stroke="#64748b"
                    fontSize={11}
                    tickLine={false}
                    interval={0}
                    angle={-20}
                    textAnchor="end"
                  />
                  <YAxis stroke="#64748b" fontSize={11} tickLine={false} allowDecimals={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="total" radius={[6, 6, 0, 0]}>
                    {classData.map((entry) => {
                      const isSelected = selectedClass === entry.className;
                      return (
                        <Cell
                          key={`cell-${entry.className}`}
                          fill={isSelected ? '#059669' : '#10b981'}
                          className="transition-all hover:opacity-80"
                        />
                      );
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}

            {activeTab === 'gender' && (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={classData}
                  margin={{ top: 15, right: 10, left: -10, bottom: 20 }}
                  onClick={(state: any) => {
                    if (state?.activePayload && state.activePayload.length > 0) {
                      const clickedClass = state.activePayload[0].payload?.className;
                      if (clickedClass) {
                        onSelectClass(selectedClass === clickedClass ? 'all' : clickedClass);
                      }
                    }
                  }}
                  className="cursor-pointer"
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.6} vertical={false} />
                  <XAxis
                    dataKey="className"
                    stroke="#64748b"
                    fontSize={11}
                    tickLine={false}
                    interval={0}
                    angle={-20}
                    textAnchor="end"
                  />
                  <YAxis stroke="#64748b" fontSize={11} tickLine={false} allowDecimals={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend
                    verticalAlign="top"
                    align="right"
                    wrapperStyle={{ fontSize: 12, paddingBottom: 10 }}
                  />
                  <Bar name="Boys" dataKey="male" fill="#0284c7" stackId="a" radius={[0, 0, 0, 0]} />
                  <Bar name="Girls" dataKey="female" fill="#ec4899" stackId="a" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}

            {activeTab === 'status' && (
              <div className="h-full flex flex-col sm:flex-row items-center justify-center gap-6">
                <div className="w-full sm:w-1/2 h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={statusData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={85}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {statusData.map((entry, index) => (
                          <Cell
                            key={`status-cell-${index}`}
                            fill={STATUS_COLORS[index % STATUS_COLORS.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip content={<CustomStatusTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="w-full sm:w-1/2 flex flex-col justify-center space-y-2 text-xs">
                  <p className="font-bold text-brand-text-primary text-sm mb-1">Status Legend</p>
                  {statusData.map((s, idx) => (
                    <div key={s.name} className="flex items-center justify-between pr-4">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: STATUS_COLORS[idx % STATUS_COLORS.length] }}
                        />
                        <span className="text-brand-text-primary font-medium">{s.name}</span>
                      </div>
                      <span className="font-mono font-bold text-brand-text-secondary">
                        {s.value} students ({((s.value / totalStudents) * 100).toFixed(1)}%)
                      </span>
                    </div>
                  ))}
                </div>
              </div>
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

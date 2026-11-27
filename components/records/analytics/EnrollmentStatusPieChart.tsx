import React from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';

export interface StatusItem {
  name: string;
  value: number;
}

export interface EnrollmentStatusPieChartProps {
  statusData: StatusItem[];
  totalStudents: number;
}

const STATUS_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

export const EnrollmentStatusPieChart: React.FC<EnrollmentStatusPieChartProps> = ({
  statusData,
  totalStudents,
}) => {
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
              {statusData.map((_, index) => (
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
  );
};

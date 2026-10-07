import React from 'react';
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
} from 'recharts';

export interface ClassBarItem {
  className: string;
  total: number;
  male: number;
  female: number;
  order: number;
}

export interface ClassBarChartProps {
  data: ClassBarItem[];
  selectedClass: string;
  mode: 'students' | 'gender';
  totalStudents: number;
  onSelectClass: (className: string) => void;
}

export const ClassBarChart: React.FC<ClassBarChartProps> = ({
  data,
  selectedClass,
  mode,
  totalStudents,
  onSelectClass,
}) => {
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const item = payload[0].payload;
      const pct = totalStudents > 0 ? ((item.total / totalStudents) * 100).toFixed(1) : '0';
      return (
        <div className="bg-slate-900/95 text-white p-3 rounded-xl shadow-xl text-xs border border-slate-700/60 backdrop-blur-md">
          <p className="font-bold text-sm text-emerald-400 mb-1">Class {item.className}</p>
          <div className="space-y-1">
            <p className="flex justify-between gap-4 text-slate-300">
              <span>Total Students:</span>
              <span className="font-bold text-white font-mono">{item.total}</span>
            </p>
            <p className="flex justify-between gap-4 text-slate-300">
              <span>School Share:</span>
              <span className="font-semibold text-slate-200">{pct}%</span>
            </p>
            <div className="pt-1.5 mt-1 border-t border-slate-800 flex items-center justify-between gap-3 text-[11px]">
              <span className="text-sky-400">Boys: {item.male}</span>
              <span className="text-rose-400">Girls: {item.female}</span>
            </div>
            <p className="text-[10px] text-emerald-300/80 pt-1 italic">Click bar to filter table</p>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={data}
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

        {mode === 'students' ? (
          <Bar dataKey="total" radius={[6, 6, 0, 0]}>
            {data.map((entry) => {
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
        ) : (
          <>
            <Legend
              verticalAlign="top"
              align="right"
              wrapperStyle={{ fontSize: 12, paddingBottom: 10 }}
            />
            <Bar name="Boys" dataKey="male" fill="#0284c7" stackId="a" radius={[0, 0, 0, 0]} />
            <Bar name="Girls" dataKey="female" fill="#ec4899" stackId="a" radius={[6, 6, 0, 0]} />
          </>
        )}
      </BarChart>
    </ResponsiveContainer>
  );
};

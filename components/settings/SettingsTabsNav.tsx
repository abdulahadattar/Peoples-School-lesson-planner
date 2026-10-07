import React from 'react';
import {
  GraduationCap,
  Users,
  Calendar,
  FileSpreadsheet,
  Clock,
  Building2,
} from 'lucide-react';

export type SettingsTab = 'classes' | 'teachers' | 'timetable' | 'safeguards' | 'periods' | 'identity';

export interface SettingsTabsNavProps {
  activeTab: SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
  classesBadge: number;
  teachersBadge: number;
  timetableBadge: number;
  periodsBadge: number;
}

export const SettingsTabsNav: React.FC<SettingsTabsNavProps> = ({
  activeTab,
  onTabChange,
  classesBadge,
  teachersBadge,
  timetableBadge,
  periodsBadge,
}) => {
  const tabs = [
    { id: 'classes' as const, label: 'Classes & Enrollments', icon: GraduationCap, badge: classesBadge },
    { id: 'teachers' as const, label: 'Faculty & Subject In-Charge', icon: Users, badge: teachersBadge },
    { id: 'timetable' as const, label: 'Timetable & Schedules', icon: Calendar, badge: timetableBadge },
    { id: 'safeguards' as const, label: 'Sheet & Attendance Safeguards', icon: FileSpreadsheet },
    { id: 'periods' as const, label: 'Bell Schedule & Timings', icon: Clock, badge: periodsBadge },
    { id: 'identity' as const, label: 'School Identity', icon: Building2 },
  ];

  return (
    <div className="flex items-center gap-1.5 border-b border-brand-border/80 overflow-x-auto custom-scrollbar pb-px">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            className={`relative px-4 py-2.5 rounded-t-xl text-xs font-semibold whitespace-nowrap flex items-center gap-2 transition-all cursor-pointer ${
              isActive
                ? 'text-brand-primary bg-white dark:bg-brand-surface border-t-2 border-brand-primary shadow-xs'
                : 'text-brand-text-secondary hover:text-brand-text-primary hover:bg-brand-bg/50'
            }`}
          >
            <tab.icon className={`w-4 h-4 ${isActive ? 'text-brand-primary' : 'text-brand-text-secondary'}`} />
            <span>{tab.label}</span>
            {typeof tab.badge === 'number' && (
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold ${
                  isActive
                    ? 'bg-brand-primary/10 text-brand-primary'
                    : 'bg-slate-100 dark:bg-slate-800 text-brand-text-secondary'
                }`}
              >
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};

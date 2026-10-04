import React from 'react';
import { LucideIcon } from 'lucide-react';

export interface StatTileProps {
  label: string;
  value: string | number;
  subtext?: React.ReactNode;
  icon?: LucideIcon;
  variant?: 'emerald' | 'blue' | 'indigo' | 'purple' | 'amber' | 'rose' | 'slate';
  active?: boolean;
  onClick?: () => void;
  className?: string;
}

const VARIANT_MAP = {
  emerald: {
    bg: 'bg-emerald-500/10 dark:bg-emerald-500/15',
    border: 'border-emerald-500/20 dark:border-emerald-500/30',
    iconBg: 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400',
    valueText: 'text-emerald-700 dark:text-emerald-300',
    hoverBorder: 'hover:border-emerald-500/40',
  },
  blue: {
    bg: 'bg-blue-500/10 dark:bg-blue-500/15',
    border: 'border-blue-500/20 dark:border-blue-500/30',
    iconBg: 'bg-blue-500/20 text-blue-600 dark:text-blue-400',
    valueText: 'text-blue-700 dark:text-blue-300',
    hoverBorder: 'hover:border-blue-500/40',
  },
  indigo: {
    bg: 'bg-indigo-500/10 dark:bg-indigo-500/15',
    border: 'border-indigo-500/20 dark:border-indigo-500/30',
    iconBg: 'bg-indigo-500/20 text-indigo-600 dark:text-indigo-400',
    valueText: 'text-indigo-700 dark:text-indigo-300',
    hoverBorder: 'hover:border-indigo-500/40',
  },
  purple: {
    bg: 'bg-purple-500/10 dark:bg-purple-500/15',
    border: 'border-purple-500/20 dark:border-purple-500/30',
    iconBg: 'bg-purple-500/20 text-purple-600 dark:text-purple-400',
    valueText: 'text-purple-700 dark:text-purple-300',
    hoverBorder: 'hover:border-purple-500/40',
  },
  amber: {
    bg: 'bg-amber-500/10 dark:bg-amber-500/15',
    border: 'border-amber-500/20 dark:border-amber-500/30',
    iconBg: 'bg-amber-500/20 text-amber-600 dark:text-amber-400',
    valueText: 'text-amber-700 dark:text-amber-300',
    hoverBorder: 'hover:border-amber-500/40',
  },
  rose: {
    bg: 'bg-rose-500/10 dark:bg-rose-500/15',
    border: 'border-rose-500/20 dark:border-rose-500/30',
    iconBg: 'bg-rose-500/20 text-rose-600 dark:text-rose-400',
    valueText: 'text-rose-700 dark:text-rose-300',
    hoverBorder: 'hover:border-rose-500/40',
  },
  slate: {
    bg: 'bg-slate-500/10 dark:bg-slate-500/15',
    border: 'border-slate-500/20 dark:border-slate-500/30',
    iconBg: 'bg-slate-500/20 text-slate-600 dark:text-slate-400',
    valueText: 'text-slate-700 dark:text-slate-200',
    hoverBorder: 'hover:border-slate-500/40',
  },
};

export const StatTile: React.FC<StatTileProps> = ({
  label,
  value,
  subtext,
  icon: Icon,
  variant = 'slate',
  active = false,
  onClick,
  className = '',
}) => {
  const styles = VARIANT_MAP[variant] || VARIANT_MAP.slate;
  const isClickable = !!onClick;

  return (
    <div
      onClick={onClick}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      className={`relative rounded-xl p-4 transition-all duration-200 border ${styles.bg} ${styles.border} ${
        isClickable ? `cursor-pointer ${styles.hoverBorder} active:scale-[0.98]` : ''
      } ${active ? 'ring-2 ring-primary ring-offset-1 ring-offset-white dark:ring-offset-slate-900 shadow-md' : ''} ${className}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 truncate">
            {label}
          </p>
          <div className="flex items-baseline gap-2 mt-1">
            <span className={`text-2xl font-black tracking-tight ${styles.valueText}`}>
              {value}
            </span>
          </div>
          {subtext && (
            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 truncate">
              {subtext}
            </div>
          )}
        </div>
        {Icon && (
          <div className={`p-2.5 rounded-xl shrink-0 ${styles.iconBg}`}>
            <Icon className="w-5 h-5" />
          </div>
        )}
      </div>
    </div>
  );
};

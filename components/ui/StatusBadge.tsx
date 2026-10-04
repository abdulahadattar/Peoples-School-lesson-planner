import React from 'react';

export type BadgeTone = 'emerald' | 'rose' | 'amber' | 'blue' | 'indigo' | 'purple' | 'slate' | 'cyan';

export interface StatusBadgeProps {
  label: string;
  tone?: BadgeTone;
  dot?: boolean;
  size?: 'xs' | 'sm' | 'md';
  className?: string;
  icon?: React.ReactNode;
}

const TONE_MAP: Record<BadgeTone, { bg: string; text: string; border: string; dot: string }> = {
  emerald: {
    bg: 'bg-emerald-50 dark:bg-emerald-950/40',
    text: 'text-emerald-700 dark:text-emerald-400',
    border: 'border-emerald-200 dark:border-emerald-800/60',
    dot: 'bg-emerald-500',
  },
  rose: {
    bg: 'bg-rose-50 dark:bg-rose-950/40',
    text: 'text-rose-700 dark:text-rose-400',
    border: 'border-rose-200 dark:border-rose-800/60',
    dot: 'bg-rose-500',
  },
  amber: {
    bg: 'bg-amber-50 dark:bg-amber-950/40',
    text: 'text-amber-700 dark:text-amber-400',
    border: 'border-amber-200 dark:border-amber-800/60',
    dot: 'bg-amber-500',
  },
  blue: {
    bg: 'bg-blue-50 dark:bg-blue-950/40',
    text: 'text-blue-700 dark:text-blue-400',
    border: 'border-blue-200 dark:border-blue-800/60',
    dot: 'bg-blue-500',
  },
  indigo: {
    bg: 'bg-indigo-50 dark:bg-indigo-950/40',
    text: 'text-indigo-700 dark:text-indigo-400',
    border: 'border-indigo-200 dark:border-indigo-800/60',
    dot: 'bg-indigo-500',
  },
  purple: {
    bg: 'bg-purple-50 dark:bg-purple-950/40',
    text: 'text-purple-700 dark:text-purple-400',
    border: 'border-purple-200 dark:border-purple-800/60',
    dot: 'bg-purple-500',
  },
  cyan: {
    bg: 'bg-cyan-50 dark:bg-cyan-950/40',
    text: 'text-cyan-700 dark:text-cyan-400',
    border: 'border-cyan-200 dark:border-cyan-800/60',
    dot: 'bg-cyan-500',
  },
  slate: {
    bg: 'bg-slate-100 dark:bg-slate-800/60',
    text: 'text-slate-700 dark:text-slate-300',
    border: 'border-slate-200 dark:border-slate-700',
    dot: 'bg-slate-400',
  },
};

const SIZE_MAP = {
  xs: 'text-[10px] px-1.5 py-0.5 font-medium gap-1',
  sm: 'text-xs px-2 py-0.5 font-semibold gap-1.5',
  md: 'text-sm px-2.5 py-1 font-semibold gap-2',
};

/**
 * Automatically resolves a badge tone based on status keywords.
 */
export function getStatusTone(statusText: string | undefined): BadgeTone {
  if (!statusText) return 'slate';
  const s = statusText.toLowerCase();

  if (s.includes('active') || s.includes('present') || s.includes('enrolled') || s.includes('complete') || s.includes('pass')) {
    return 'emerald';
  }
  if (s.includes('withdrawn') || s.includes('absent') || s.includes('fail') || s.includes('strike') || s.includes('left') || s.includes('missing')) {
    return 'rose';
  }
  if (s.includes('leave') || s.includes('late') || s.includes('partial') || s.includes('pending') || s.includes('review') || s.includes('warn')) {
    return 'amber';
  }
  if (s.includes('sync') || s.includes('info') || s.includes('tier 1')) {
    return 'blue';
  }
  if (s.includes('tier 2')) {
    return 'indigo';
  }
  if (s.includes('tier 3')) {
    return 'purple';
  }
  return 'slate';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  label,
  tone,
  dot = false,
  size = 'sm',
  className = '',
  icon,
}) => {
  const effectiveTone = tone || getStatusTone(label);
  const styles = TONE_MAP[effectiveTone] || TONE_MAP.slate;

  return (
    <span
      className={`inline-flex items-center rounded-full border shadow-2xs font-mono tracking-tight transition-colors select-none ${styles.bg} ${styles.text} ${styles.border} ${SIZE_MAP[size]} ${className}`}
    >
      {dot && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${styles.dot}`} />}
      {icon && <span className="shrink-0">{icon}</span>}
      <span className="truncate">{label}</span>
    </span>
  );
};

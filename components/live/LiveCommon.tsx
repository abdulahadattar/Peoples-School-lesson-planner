import React from 'react';

export function initials(name?: string): string {
  if (!name || typeof name !== 'string') return '?';
  const parts = name.replace(/^(sir|miss|ma'am|mrs|mr)\s+/i, '').trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}

export const Avatar: React.FC<{ name?: string; size?: 'sm' | 'md' }> = ({ name = '', size = 'sm' }) => {
  const dim = size === 'md' ? 'h-8 w-8 text-[11px]' : 'h-6 w-6 text-[9px]';
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full font-bold ${dim} bg-brand-primary-soft text-brand-primary dark:bg-brand-primary/20 dark:text-blue-300 ring-1 ring-brand-border shrink-0`}
      title={name}
    >
      {initials(name)}
    </span>
  );
};

export const LiveDot: React.FC<{ className?: string }> = ({ className = '' }) => {
  return (
    <span className={`relative inline-flex h-2.5 w-2.5 ${className}`}>
      <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
    </span>
  );
};

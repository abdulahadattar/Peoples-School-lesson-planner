import React, { useId } from 'react';
import { motion } from 'motion/react';

export const EXPORT_FORMATS = [
  { value: 'docx', label: 'Word (.docx)' },
  { value: 'pdf', label: 'PDF (.pdf)' },
  { value: 'both', label: 'Both' },
] as const;

/**
 * Apple-grade Segmented Control with a hardware-accelerated spring sliding thumb.
 */
interface SegmentedControlProps<T extends string = string> {
  value: T;
  options: readonly { value: T; label: string; icon?: React.FC<React.SVGProps<SVGSVGElement>> }[];
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
  className?: string;
}

export const SegmentedControl = <T extends string>({
  value,
  options,
  onChange,
  size = 'md',
  className = '',
}: SegmentedControlProps<T>) => {
  const instanceId = useId();

  return (
    <div
      role="radiogroup"
      className={`relative inline-flex w-full items-center p-1 bg-slate-200/75 dark:bg-slate-800/80 rounded-xl border border-black/[0.04] dark:border-white/[0.06] select-none ${className}`}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((option) => {
        const isActive = value === option.value;
        const Icon = option.icon;

        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => onChange(option.value)}
            className={`relative flex-1 flex items-center justify-center gap-1.5 ${
              size === 'sm' ? 'px-2.5 py-1.5 text-xs' : 'px-3.5 py-2 text-xs sm:text-sm'
            } font-medium tracking-tight rounded-lg transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 cursor-pointer ${
              isActive
                ? 'text-slate-900 dark:text-white font-semibold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            {isActive && (
              <motion.span
                layoutId={`segmented-thumb-${instanceId}`}
                className="absolute inset-0 bg-white dark:bg-slate-700/90 rounded-lg shadow-sm border border-black/[0.04] dark:border-white/[0.08]"
                transition={{
                  type: 'spring',
                  stiffness: 500,
                  damping: 38,
                  mass: 0.8,
                }}
              />
            )}
            {Icon && <Icon className="relative z-10 w-3.5 h-3.5 shrink-0" />}
            <span className="relative z-10 truncate">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
};

export default SegmentedControl;

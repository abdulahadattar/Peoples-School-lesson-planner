import React from 'react';

export interface NumberFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  hint?: string;
  onChange: (value: number) => void;
  className?: string;
}

const clampNumber = (value: string, min: number, max: number): number => {
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed)) return min;
  return Math.max(min, Math.min(max, parsed));
};

/**
 * Styled numeric stepper input with plus/minus increment buttons.
 * Supports touch targets, direct keyboard entry, bounds enforcement, and min/max display.
 */
export const NumberField: React.FC<NumberFieldProps> = ({
  label,
  value,
  min,
  max,
  step = 1,
  hint,
  onChange,
  className = '',
}) => {
  return (
    <div className={`space-y-1 ${className}`}>
      <div className="flex items-center justify-between">
        <label className="block text-xs text-brand-text-secondary font-medium">{label}</label>
        <span className="text-[10px] font-mono tabular-nums text-brand-text-tertiary">
          [{min}–{max}]
        </span>
      </div>
      <div className="flex items-center rounded-xl border border-black/[0.08] dark:border-white/[0.1] bg-slate-50 dark:bg-slate-900/40 overflow-hidden focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500 transition-all">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - step))}
          disabled={value <= min}
          className="w-10 h-10 flex items-center justify-center text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-black/[0.04] dark:hover:bg-white/[0.04] disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-base font-bold shrink-0 active:scale-90 select-none cursor-pointer"
          aria-label={`Decrease ${label}`}
        >
          −
        </button>
        <input
          type="number"
          inputMode="numeric"
          autoComplete="off"
          min={min}
          max={max}
          value={value}
          onChange={e => onChange(clampNumber(e.target.value, min, max))}
          className="w-full h-10 px-1 bg-transparent text-center text-sm font-semibold text-brand-text-primary placeholder:text-slate-400 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none font-mono tabular-nums"
        />
        <button
          type="button"
          onClick={() => onChange(Math.min(max, value + step))}
          disabled={value >= max}
          className="w-10 h-10 flex items-center justify-center text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-black/[0.04] dark:hover:bg-white/[0.04] disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-base font-bold shrink-0 active:scale-90 select-none cursor-pointer"
          aria-label={`Increase ${label}`}
        >
          +
        </button>
      </div>
      {hint && <p className="text-[10px] text-brand-text-tertiary leading-tight">{hint}</p>}
    </div>
  );
};

export default NumberField;

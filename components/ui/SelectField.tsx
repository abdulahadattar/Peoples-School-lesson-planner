import React from 'react';
import { ChevronDownIcon } from '../icons/MiscIcons';

interface SelectFieldProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  icon?: React.ReactNode;
  hint?: string;
}

/**
 * Shared labeled dropdown: consistent styling, chevron overlay and
 * focus/hover states used across the selection panels.
 */
const SelectField: React.FC<SelectFieldProps> = ({ label, icon, hint, id, className = '', children, ...rest }) => {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label
          htmlFor={id}
          className="flex items-center gap-1.5 text-[11px] font-semibold text-brand-text-secondary uppercase tracking-wide"
        >
          {icon}
          {label}
        </label>
        {hint && <span className="text-[10px] text-brand-text-secondary/70">{hint}</span>}
      </div>
      <div className="relative group">
        <select
          id={id}
          {...rest}
          className={`w-full h-12 px-4 pr-11 bg-brand-bg dark:bg-brand-bg/90 border border-brand-border rounded-xl text-sm text-brand-text-primary appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-primary/25 focus:border-brand-primary transition-all duration-200 hover:border-brand-text-secondary/40 disabled:opacity-40 disabled:cursor-not-allowed shadow-soft [&>option]:bg-white [&>option]:dark:bg-[#131c30] [&>option]:text-slate-900 [&>option]:dark:text-slate-100 ${className}`}
        >
          {children}
        </select>
        <div className="absolute right-3.5 top-1/2 -translate-y-1/2 text-brand-text-secondary/70 group-hover:text-brand-text-primary transition-colors pointer-events-none">
          <ChevronDownIcon className="w-4.5 h-4.5" />
        </div>
      </div>
    </div>
  );
};

export default SelectField;
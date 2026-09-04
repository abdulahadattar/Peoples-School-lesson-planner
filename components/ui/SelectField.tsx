import React from 'react';
import { ChevronDownIcon } from '../icons/MiscIcons';

interface SelectFieldProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  icon?: React.ReactNode;
}

/**
 * Shared labeled dropdown: consistent styling, chevron overlay and
 * focus/hover states used across the selection panels.
 */
const SelectField: React.FC<SelectFieldProps> = ({ label, icon, id, className = '', children, ...rest }) => {
  return (
    <div>
      <label
        htmlFor={id}
        className="flex items-center gap-1.5 text-[11px] font-semibold text-brand-text-secondary mb-2 uppercase tracking-wide"
      >
        {icon}
        {label}
      </label>
      <div className="relative">
        <select
          id={id}
          {...rest}
          className={`w-full h-12 px-4 pr-11 bg-brand-bg border border-brand-border rounded-xl text-sm text-brand-text-primary appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary transition-all duration-200 hover:border-brand-text-secondary/40 disabled:opacity-40 disabled:cursor-not-allowed ${className}`}
        >
          {children}
        </select>
        <div className="absolute right-4 top-1/2 -translate-y-1/2 text-brand-text-secondary pointer-events-none">
          <ChevronDownIcon className="w-5 h-5" />
        </div>
      </div>
    </div>
  );
};

export default SelectField;
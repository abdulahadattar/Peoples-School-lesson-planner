import React from 'react';
import { ChevronDown, X } from 'lucide-react';
import { SelectOptionItem } from './selectHelpers';

export interface SelectTriggerProps {
  selectId: string;
  disabled: boolean;
  isOpen: boolean;
  size?: 'sm' | 'md';
  inline?: boolean;
  prefixLabel?: string;
  className?: string;
  selectedOption: SelectOptionItem | null;
  defaultPlaceholderText: string;
  clearable: boolean;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  onToggleOpen: () => void;
  onClear: () => void;
}

export const SelectTrigger: React.FC<SelectTriggerProps> = ({
  selectId,
  disabled,
  isOpen,
  size = 'md',
  inline = false,
  prefixLabel,
  className = '',
  selectedOption,
  defaultPlaceholderText,
  clearable,
  triggerRef,
  onToggleOpen,
  onClear,
}) => {
  const sizeClasses =
    size === 'sm'
      ? 'min-h-9 h-9 px-2.5 py-1.5 rounded-xl gap-1.5'
      : 'min-h-11 px-3.5 py-2 rounded-xl gap-2.5';

  return (
    <button
      ref={triggerRef}
      type="button"
      id={selectId}
      disabled={disabled}
      onClick={onToggleOpen}
      aria-haspopup="listbox"
      aria-expanded={isOpen}
      className={`${inline ? 'w-auto min-w-[96px]' : 'w-full'} ${sizeClasses} flex items-center justify-between border text-left transition-[color,background-color,border-color,box-shadow] select-none cursor-pointer outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/35 focus-visible:border-blue-500 ${
        disabled
          ? 'opacity-40 cursor-not-allowed bg-slate-100/60 dark:bg-slate-800/40 border-black/[0.04] dark:border-white/[0.06]'
          : isOpen
          ? 'bg-white dark:bg-slate-800 border-blue-500 ring-2 ring-blue-500/20 shadow-sm'
          : 'bg-white dark:bg-brand-surface border-black/[0.08] dark:border-white/[0.1] hover:border-blue-500/40 dark:hover:border-blue-400/40 shadow-soft'
      } ${className}`}
    >
      <div className="flex items-center gap-1.5 min-w-0 flex-1">
        {prefixLabel && (
          <span className="shrink-0 text-[11px] font-medium text-slate-400 dark:text-slate-500">
            {prefixLabel}:
          </span>
        )}
        {selectedOption ? (
          <div className="flex items-center gap-1.5 min-w-0 flex-1 truncate">
            {selectedOption.badge && (
              <span className="shrink-0 px-1.5 py-0.5 text-[10px] font-bold rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                {selectedOption.badge}
              </span>
            )}
            <div className="min-w-0 flex-1 truncate">
              <span
                className={`${
                  size === 'sm' ? 'text-xs' : 'text-xs sm:text-sm'
                } font-semibold text-brand-text-primary truncate`}
                title={selectedOption.label}
              >
                {selectedOption.label}
              </span>
              {selectedOption.sublabel && (
                <span
                  className="text-xs text-brand-text-secondary ml-1.5 truncate"
                  title={selectedOption.sublabel}
                >
                  ({selectedOption.sublabel})
                </span>
              )}
            </div>
          </div>
        ) : (
          <span
            className={`${
              size === 'sm' ? 'text-xs' : 'text-xs sm:text-sm'
            } text-slate-400 font-normal truncate`}
          >
            {defaultPlaceholderText}
          </span>
        )}
      </div>

      <div className="flex items-center gap-1 shrink-0 text-slate-400 ml-0.5">
        {clearable && selectedOption && !disabled && (
          <span
            role="button"
            tabIndex={0}
            onClick={e => {
              e.stopPropagation();
              onClear();
            }}
            className="p-0.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors cursor-pointer"
            title="Clear selection"
          >
            <X className="w-3.5 h-3.5" />
          </span>
        )}
        <ChevronDown
          className={`${size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4'} text-slate-400 transition-transform duration-200 ${
            isOpen ? 'rotate-180 text-blue-600 dark:text-blue-400' : ''
          }`}
        />
      </div>
    </button>
  );
};

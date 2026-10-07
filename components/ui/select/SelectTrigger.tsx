import React from 'react';
import { ChevronDown, X } from 'lucide-react';
import { SelectOptionItem } from './selectHelpers';

export interface SelectTriggerProps {
  selectId: string;
  disabled: boolean;
  isOpen: boolean;
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
  className = '',
  selectedOption,
  defaultPlaceholderText,
  clearable,
  triggerRef,
  onToggleOpen,
  onClear,
}) => {
  return (
    <button
      ref={triggerRef}
      type="button"
      id={selectId}
      disabled={disabled}
      onClick={onToggleOpen}
      aria-haspopup="listbox"
      aria-expanded={isOpen}
      className={`w-full min-h-11 px-3.5 py-2 flex items-center justify-between gap-2.5 rounded-xl border text-left transition-all select-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 ${
        disabled
          ? 'opacity-40 cursor-not-allowed bg-slate-100/60 dark:bg-slate-800/40 border-black/[0.04] dark:border-white/[0.06]'
          : isOpen
          ? 'bg-white dark:bg-slate-800 border-blue-500 ring-2 ring-blue-500/20 shadow-sm'
          : 'bg-white dark:bg-brand-surface border-black/[0.08] dark:border-white/[0.1] hover:border-black/[0.15] dark:hover:border-white/[0.2] shadow-soft'
      } ${className}`}
    >
      <div className="flex items-center gap-2 min-w-0 flex-1">
        {selectedOption ? (
          <div className="flex items-center gap-2 min-w-0 flex-1 truncate">
            {selectedOption.badge && (
              <span className="shrink-0 px-2 py-0.5 text-[10px] font-bold rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                {selectedOption.badge}
              </span>
            )}
            <div className="min-w-0 flex-1 truncate">
              <span
                className="text-xs sm:text-sm font-semibold text-brand-text-primary truncate"
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
          <span className="text-xs sm:text-sm text-slate-400 font-normal truncate">
            {defaultPlaceholderText}
          </span>
        )}
      </div>

      <div className="flex items-center gap-1 shrink-0 text-slate-400 ml-1">
        {clearable && selectedOption && !disabled && (
          <span
            role="button"
            tabIndex={0}
            onClick={e => {
              e.stopPropagation();
              onClear();
            }}
            className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors cursor-pointer"
            title="Clear selection"
          >
            <X className="w-3.5 h-3.5" />
          </span>
        )}
        <ChevronDown
          className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${
            isOpen ? 'rotate-180 text-blue-600 dark:text-blue-400' : ''
          }`}
        />
      </div>
    </button>
  );
};

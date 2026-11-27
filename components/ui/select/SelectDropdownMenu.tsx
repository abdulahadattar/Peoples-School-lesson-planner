import React from 'react';
import { createPortal } from 'react-dom';
import { Check, Search, X } from 'lucide-react';
import { SelectOptionItem } from './selectHelpers';

export interface SelectDropdownMenuProps {
  isOpen: boolean;
  disabled: boolean;
  portalStyle: React.CSSProperties;
  menuRef: React.RefObject<HTMLDivElement | null>;
  isSearchEnabled: boolean;
  searchQuery: string;
  onSearchQueryChange: (q: string) => void;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  listRef: React.RefObject<HTMLDivElement | null>;
  label?: string;
  placeholderOption?: SelectOptionItem;
  defaultPlaceholderText: string;
  value: any;
  filteredOptions: SelectOptionItem[];
  highlightedIndex: number;
  onHighlightIndex: (idx: number) => void;
  onSelectValue: (val: string) => void;
}

export const SelectDropdownMenu: React.FC<SelectDropdownMenuProps> = ({
  isOpen,
  disabled,
  portalStyle,
  menuRef,
  isSearchEnabled,
  searchQuery,
  onSearchQueryChange,
  searchInputRef,
  listRef,
  label,
  placeholderOption,
  defaultPlaceholderText,
  value,
  filteredOptions,
  highlightedIndex,
  onHighlightIndex,
  onSelectValue,
}) => {
  if (!isOpen || disabled) return null;

  const menuContent = (
    <div
      ref={menuRef}
      style={portalStyle}
      onMouseDown={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
      className="flex flex-col rounded-2xl bg-white/95 dark:bg-slate-900/95 border border-black/[0.08] dark:border-white/[0.1] shadow-2xl shadow-slate-900/20 dark:shadow-black/70 backdrop-blur-2xl overflow-hidden animate-scaleIn"
    >
      {isSearchEnabled && (
        <div className="shrink-0 p-2 border-b border-black/[0.06] dark:border-white/[0.08] bg-slate-50/80 dark:bg-slate-800/60">
          <div className="relative flex items-center">
            <Search className="absolute left-3 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={e => onSearchQueryChange(e.target.value)}
              placeholder="Search options..."
              className="w-full h-8 pl-8 pr-7 text-xs font-medium bg-white dark:bg-slate-900 border border-black/[0.08] dark:border-white/[0.1] rounded-lg text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchQueryChange('')}
                className="absolute right-2 p-0.5 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                title="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      <div
        ref={listRef}
        role="listbox"
        aria-label={label || 'Select options'}
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-1.5 space-y-0.5 custom-scrollbar"
      >
        {placeholderOption && !searchQuery && (
          <button
            type="button"
            role="option"
            aria-selected={!value}
            data-dropdown-item
            onClick={() => onSelectValue('')}
            className={`w-full px-3 py-2 flex items-center justify-between rounded-xl text-xs font-medium text-left transition-colors cursor-pointer ${
              !value
                ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 font-bold'
                : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <span className="leading-snug break-words">
              {placeholderOption.label || defaultPlaceholderText}
            </span>
            {!value && (
              <Check className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0 ml-2" />
            )}
          </button>
        )}

        {filteredOptions.length === 0 ? (
          <div className="py-6 px-4 text-center">
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              No matching options
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {searchQuery ? `Nothing matches "${searchQuery}"` : 'No items available'}
            </p>
          </div>
        ) : (
          filteredOptions.map((opt, index) => {
            const isSelected = String(value ?? '') === opt.value;
            const isHighlighted = highlightedIndex === index;
            const prevGroup = index > 0 ? filteredOptions[index - 1]?.group : undefined;
            const showGroupHeader = Boolean(opt.group && opt.group !== prevGroup);

            return (
              <React.Fragment key={`${opt.group || 'root'}-${opt.value}-${index}`}>
                {showGroupHeader && (
                  <div className="px-2.5 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 select-none">
                    {opt.group}
                  </div>
                )}
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  aria-disabled={opt.disabled || undefined}
                  data-dropdown-item
                  disabled={opt.disabled}
                  onClick={() => !opt.disabled && onSelectValue(opt.value)}
                  onMouseEnter={() => onHighlightIndex(index)}
                  className={`relative w-full px-3 py-2 rounded-xl flex items-start sm:items-center justify-between gap-2.5 text-left transition-[color,background-color,box-shadow] cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 ${
                    opt.disabled
                      ? 'opacity-40 cursor-not-allowed'
                      : isSelected
                      ? 'bg-blue-50/90 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300 ring-1 ring-blue-500/25 dark:ring-blue-400/30 font-semibold shadow-2xs'
                      : isHighlighted
                      ? 'bg-slate-100 dark:bg-slate-800/80 text-slate-900 dark:text-white'
                      : 'text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/80'
                  }`}
                >
                  <div className="min-w-0 flex-1 flex items-center gap-2">
                    {opt.badge && (
                      <span
                        className={`shrink-0 px-2 py-0.5 text-[10px] font-bold rounded-md uppercase tracking-wider ${
                          isSelected
                            ? 'bg-blue-600 text-white shadow-2xs'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-black/[0.04] dark:border-white/[0.06]'
                        }`}
                      >
                        {opt.badge}
                      </span>
                    )}

                    <div className="min-w-0 flex-1">
                      <span
                        className={`text-xs sm:text-sm leading-snug break-words ${
                          isSelected
                            ? 'font-semibold text-blue-700 dark:text-blue-300'
                            : 'font-medium'
                        }`}
                      >
                        {opt.label}
                      </span>
                      {opt.sublabel && (
                        <span className="text-xs text-slate-500 dark:text-slate-400 ml-1.5">
                          ({opt.sublabel})
                        </span>
                      )}
                    </div>
                  </div>

                  {isSelected && (
                    <span className="shrink-0 w-5 h-5 rounded-full bg-blue-600/10 dark:bg-blue-400/15 flex items-center justify-center ml-2">
                      <Check className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                    </span>
                  )}
                </button>
              </React.Fragment>
            );
          })
        )}
      </div>
    </div>
  );

  if (typeof document === 'undefined') {
    return menuContent;
  }
  return createPortal(menuContent, document.body);
};

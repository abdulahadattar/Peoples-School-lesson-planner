import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';

export interface SelectOptionItem {
  value: string;
  label: string;
  sublabel?: string;
  badge?: string;
  icon?: React.ReactNode;
  disabled?: boolean;
}

export interface SelectFieldProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'onChange'> {
  label?: string;
  icon?: React.ReactNode;
  hint?: string;
  options?: SelectOptionItem[];
  searchable?: boolean;
  clearable?: boolean;
  placeholder?: string;
  dropdownWidth?: 'match' | 'wide' | 'xl' | string;
  onChange?: (e: React.ChangeEvent<HTMLSelectElement> | { target: { value: string; name?: string; id?: string } }) => void;
}

/**
 * Recursively extracts text from React children without comma-joining arrays.
 */
function getTextFromReactChildren(children: React.ReactNode): string {
  if (children === null || children === undefined || typeof children === 'boolean') {
    return '';
  }
  if (typeof children === 'string' || typeof children === 'number') {
    return String(children);
  }
  if (Array.isArray(children)) {
    return children.map(getTextFromReactChildren).join('');
  }
  if (React.isValidElement(children)) {
    return getTextFromReactChildren((children.props as any)?.children);
  }
  return '';
}

/**
 * Parses raw text from <option> into structured label, sublabel, and badges.
 */
function parseOptionText(raw: string): { label: string; sublabel?: string; badge?: string } {
  const trimmed = raw.trim();
  if (
    !trimmed ||
    trimmed.startsWith('--') ||
    trimmed.toLowerCase().startsWith('choose') ||
    trimmed.toLowerCase().startsWith('select')
  ) {
    return { label: trimmed.replace(/^--\s*|\s*--$/g, '') };
  }

  // Check for chapter pattern: "Chapter 1: Title" or "Ch 1 - Title" or "Unit 1: Title"
  const chapterMatch = trimmed.match(/^(?:Chapter|Unit|Ch\.?)\s*(\d+)[:\s–—\-]+(.+)$/i);
  if (chapterMatch) {
    return {
      label: chapterMatch[2].trim(),
      badge: `Ch ${chapterMatch[1]}`,
    };
  }

  // Check for dash separator: "Name — Subject1, Subject2"
  if (trimmed.includes('—')) {
    const [main, ...rest] = trimmed.split('—');
    const label = main.trim().replace(/,+$/, '').trim();
    const sublabel = rest.join('—').trim().replace(/^,+/, '').trim();
    return { label, sublabel };
  }
  if (trimmed.includes(' – ')) {
    const [main, ...rest] = trimmed.split(' – ');
    const label = main.trim().replace(/,+$/, '').trim();
    const sublabel = rest.join(' – ').trim().replace(/^,+/, '').trim();
    return { label, sublabel };
  }
  if (trimmed.includes(' - ') && !trimmed.toLowerCase().includes('class') && !trimmed.toLowerCase().includes('grade')) {
    const [main, ...rest] = trimmed.split(' - ');
    const label = main.trim().replace(/,+$/, '').trim();
    const sublabel = rest.join(' - ').trim().replace(/^,+/, '').trim();
    return { label, sublabel };
  }

  // Check for parenthesis: "Name (Designation)"
  const parenMatch = trimmed.match(/^(.+?)\s*\((.+?)\)$/);
  if (parenMatch) {
    return { label: parenMatch[1].trim().replace(/,+$/, '').trim(), badge: parenMatch[2].trim() };
  }

  return { label: trimmed };
}

/**
 * Recursively extracts options from children, handling arrays, fragments, and native option elements.
 */
function extractOptionsFromChildren(children: React.ReactNode): SelectOptionItem[] {
  const items: SelectOptionItem[] = [];

  const processChild = (child: React.ReactNode) => {
    if (child === null || child === undefined || typeof child === 'boolean') {
      return;
    }
    if (Array.isArray(child)) {
      child.forEach(processChild);
      return;
    }
    if (React.isValidElement(child)) {
      if (child.type === React.Fragment) {
        React.Children.forEach((child.props as any)?.children, processChild);
        return;
      }
      if (
        child.type === 'option' ||
        (typeof child.type === 'string' && child.type.toLowerCase() === 'option')
      ) {
        const { value = '', disabled = false, children: textContent } = child.props as any;
        const rawText = getTextFromReactChildren(textContent) || String(value ?? '');
        const parsed = parseOptionText(rawText);
        items.push({
          value: String(value),
          label: parsed.label,
          sublabel: parsed.sublabel,
          badge: parsed.badge,
          disabled: Boolean(disabled),
        });
      }
    }
  };

  React.Children.forEach(children, processChild);
  return items;
}

/**
 * Apple-grade Accessible and Robust Dropdown Menu:
 * - Immediate responsive interaction on desktop, touch, and tablets
 * - Search filter for long lists
 * - Keyboard navigation (Arrow keys, Enter, Space, Escape)
 * - Safe outside click detection that never drops clicks or closes prematurely
 */
export const SelectField: React.FC<SelectFieldProps> = ({
  label,
  icon,
  hint,
  id,
  className = '',
  children,
  options: explicitOptions,
  value = '',
  onChange,
  disabled = false,
  searchable,
  clearable = false,
  placeholder = 'Select an option...',
  dropdownWidth = 'wide',
  name,
  required,
  ...rest
}) => {
  const generatedId = useId();
  const selectId = id || generatedId;

  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Parse options from explicit props or JSX children
  const allOptions = useMemo<SelectOptionItem[]>(() => {
    if (explicitOptions && explicitOptions.length > 0) {
      return explicitOptions;
    }
    if (children) {
      return extractOptionsFromChildren(children);
    }
    return [];
  }, [explicitOptions, children]);

  // Separate placeholder/unselected option from selectable choices
  const placeholderOption = useMemo(() => {
    return allOptions.find(o => o.value === '');
  }, [allOptions]);

  const selectableOptions = useMemo(() => {
    return allOptions.filter(o => o.value !== '');
  }, [allOptions]);

  const defaultPlaceholderText = placeholderOption?.label || placeholder;

  // Selected option resolution
  const selectedOption = useMemo(() => {
    const strVal = String(value ?? '');
    if (!strVal) return null;
    return allOptions.find(o => String(o.value) === strVal) || null;
  }, [allOptions, value]);

  // Search filtering
  const isSearchEnabled = searchable ?? selectableOptions.length >= 6;

  const filteredOptions = useMemo(() => {
    if (!searchQuery.trim()) return selectableOptions;
    const q = searchQuery.toLowerCase().trim();
    return selectableOptions.filter(
      opt =>
        opt.label.toLowerCase().includes(q) ||
        (opt.sublabel && opt.sublabel.toLowerCase().includes(q)) ||
        (opt.badge && opt.badge.toLowerCase().includes(q)),
    );
  }, [selectableOptions, searchQuery]);

  // Handle clicking outside safely
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearchQuery('');
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchend', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchend', handlePointerDown);
    };
  }, [isOpen]);

  // Focus search input on open
  useEffect(() => {
    if (isOpen) {
      setHighlightedIndex(
        selectedOption ? filteredOptions.findIndex(o => o.value === selectedOption.value) : 0,
      );
      if (isSearchEnabled) {
        const timer = setTimeout(() => {
          searchInputRef.current?.focus();
        }, 50);
        return () => clearTimeout(timer);
      }
    } else {
      setSearchQuery('');
      setHighlightedIndex(-1);
    }
  }, [isOpen, isSearchEnabled, selectedOption, filteredOptions]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (isOpen && highlightedIndex >= 0 && listRef.current) {
      const items = listRef.current.querySelectorAll('[data-dropdown-item]');
      const activeEl = items[highlightedIndex] as HTMLElement | undefined;
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex, isOpen]);

  const selectValue = (val: string) => {
    if (disabled) return;
    setIsOpen(false);
    setSearchQuery('');

    if (onChange) {
      const syntheticEvent = {
        target: {
          value: val,
          name: name || selectId,
          id: selectId,
        },
        currentTarget: {
          value: val,
          name: name || selectId,
          id: selectId,
        },
        persist: () => {},
      } as unknown as React.ChangeEvent<HTMLSelectElement>;
      onChange(syntheticEvent);
    }
    triggerRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;

    if (!isOpen) {
      if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(e.key)) {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex(prev => (prev < filteredOptions.length - 1 ? prev + 1 : 0));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex(prev => (prev > 0 ? prev - 1 : filteredOptions.length - 1));
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < filteredOptions.length) {
          const opt = filteredOptions[highlightedIndex];
          if (!opt.disabled) {
            selectValue(opt.value);
          }
        }
        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        triggerRef.current?.focus();
        break;
      case 'Tab':
        setIsOpen(false);
        break;
    }
  };

  const [alignment, setAlignment] = useState<'left' | 'right' | 'center'>('left');

  useEffect(() => {
    if (!isOpen) return;

    const checkPlacement = () => {
      if (!triggerRef.current) return;
      const rect = triggerRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const triggerCenter = rect.left + rect.width / 2;
      const spaceOnRight = viewportWidth - rect.left;
      const spaceOnLeft = rect.right;

      const targetMenuWidth = 380;

      if (spaceOnRight < targetMenuWidth && spaceOnLeft >= targetMenuWidth - 100) {
        setAlignment('right');
      } else if (triggerCenter > viewportWidth * 0.6) {
        setAlignment('right');
      } else if (triggerCenter < viewportWidth * 0.4) {
        setAlignment('left');
      } else if (spaceOnRight < targetMenuWidth && spaceOnLeft < targetMenuWidth) {
        setAlignment('center');
      } else {
        setAlignment('left');
      }
    };

    checkPlacement();
    window.addEventListener('resize', checkPlacement);
    return () => window.removeEventListener('resize', checkPlacement);
  }, [isOpen, dropdownWidth]);

  const dropdownWidthClass = useMemo(() => {
    if (dropdownWidth === 'match') return 'w-full min-w-full left-0 right-0';

    const baseWidth =
      dropdownWidth === 'xl'
        ? 'w-full min-w-full sm:w-[460px] sm:min-w-[380px] sm:max-w-[540px]'
        : dropdownWidth === 'wide'
        ? 'w-full min-w-full sm:w-[380px] sm:min-w-[320px] sm:max-w-[460px]'
        : 'w-full min-w-full sm:w-[360px] sm:max-w-[440px]';

    if (alignment === 'right') {
      return `${baseWidth} right-0 left-auto`;
    }
    if (alignment === 'center') {
      return `${baseWidth} sm:left-1/2 sm:-translate-x-1/2 left-0`;
    }
    return `${baseWidth} left-0 right-auto`;
  }, [dropdownWidth, alignment]);

  return (
    <div className={`space-y-1.5 w-full relative ${isOpen ? 'z-50' : 'z-auto'}`} ref={containerRef} onKeyDown={handleKeyDown}>
      {/* Label and Hint Header */}
      {label && (
        <div className="flex items-center justify-between">
          <label
            htmlFor={selectId}
            className="flex items-center gap-1.5 text-xs font-semibold text-brand-text-secondary select-none cursor-pointer"
            onClick={() => !disabled && setIsOpen(prev => !prev)}
          >
            {icon && <span className="text-blue-600 dark:text-blue-400">{icon}</span>}
            <span>{label}</span>
            {required && <span className="text-rose-500 text-xs">*</span>}
          </label>
          {hint && <span className="text-[10px] font-medium text-brand-text-tertiary">{hint}</span>}
        </div>
      )}

      {/* Dropdown Container */}
      <div className="relative">
        {/* Trigger Button */}
        <button
          ref={triggerRef}
          type="button"
          id={selectId}
          disabled={disabled}
          onClick={() => !disabled && setIsOpen(prev => !prev)}
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
          {/* Selected Item Content */}
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {selectedOption ? (
              <div className="flex items-center gap-2 min-w-0 flex-1 truncate">
                {selectedOption.badge && (
                  <span className="shrink-0 px-2 py-0.5 text-[10px] font-bold rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                    {selectedOption.badge}
                  </span>
                )}
                <div className="min-w-0 flex-1 truncate">
                  <span className="text-xs sm:text-sm font-semibold text-brand-text-primary truncate" title={selectedOption.label}>
                    {selectedOption.label}
                  </span>
                  {selectedOption.sublabel && (
                    <span className="text-xs text-brand-text-secondary ml-1.5 truncate" title={selectedOption.sublabel}>
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

          {/* Action Icons: Clear & Chevron */}
          <div className="flex items-center gap-1 shrink-0 text-slate-400 ml-1">
            {clearable && selectedOption && !disabled && (
              <span
                role="button"
                tabIndex={0}
                onClick={e => {
                  e.stopPropagation();
                  selectValue('');
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

        {/* Floating Dropdown Menu */}
        {isOpen && !disabled && (
          <div
            className={`absolute top-full mt-1.5 z-[999] rounded-2xl bg-white/95 dark:bg-slate-900/95 border border-black/[0.08] dark:border-white/[0.1] shadow-2xl shadow-slate-900/20 dark:shadow-black/70 backdrop-blur-2xl overflow-hidden max-w-[calc(100vw-2rem)] animate-scaleIn ${dropdownWidthClass}`}
            style={{ maxHeight: '26rem' }}
          >
            {/* Search Box Header */}
            {isSearchEnabled && (
              <div className="p-2 border-b border-black/[0.06] dark:border-white/[0.08] bg-slate-50/80 dark:bg-slate-800/60">
                <div className="relative flex items-center">
                  <Search className="absolute left-3 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search options..."
                    className="w-full h-8 pl-8 pr-7 text-xs font-medium bg-white dark:bg-slate-900 border border-black/[0.08] dark:border-white/[0.1] rounded-lg text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 transition-all"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2 p-0.5 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                      title="Clear search"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Options List */}
            <div
              ref={listRef}
              role="listbox"
              aria-label={label || 'Select options'}
              className="max-h-64 overflow-y-auto overscroll-contain p-1.5 space-y-0.5 custom-scrollbar"
            >
              {/* Optional Placeholder / Unselect Option */}
              {placeholderOption && !searchQuery && (
                <button
                  type="button"
                  data-dropdown-item
                  onClick={() => selectValue('')}
                  className={`w-full px-3 py-2 flex items-center justify-between rounded-xl text-xs font-medium text-left transition-colors cursor-pointer ${
                    !value
                      ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 font-bold'
                      : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-300'
                  }`}
                >
                  <span className="leading-snug break-words">{placeholderOption.label || defaultPlaceholderText}</span>
                  {!value && <Check className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0 ml-2" />}
                </button>
              )}

              {filteredOptions.length === 0 ? (
                <div className="py-6 px-4 text-center">
                  <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">No matching options</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {searchQuery ? `Nothing matches "${searchQuery}"` : 'No items available'}
                  </p>
                </div>
              ) : (
                filteredOptions.map((opt, index) => {
                  const isSelected = String(value ?? '') === opt.value;
                  const isHighlighted = highlightedIndex === index;

                  return (
                    <button
                      key={opt.value}
                      type="button"
                      data-dropdown-item
                      disabled={opt.disabled}
                      onClick={() => !opt.disabled && selectValue(opt.value)}
                      onMouseEnter={() => setHighlightedIndex(index)}
                      className={`w-full px-3 py-2 rounded-xl flex items-start sm:items-center justify-between gap-2.5 text-left transition-all cursor-pointer ${
                        opt.disabled
                          ? 'opacity-40 cursor-not-allowed'
                          : isSelected
                          ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 dark:bg-blue-500/20 font-bold'
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
                                ? 'bg-blue-600 text-white'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-black/[0.04] dark:border-white/[0.06]'
                            }`}
                          >
                            {opt.badge}
                          </span>
                        )}

                        <div className="min-w-0 flex-1">
                          <span className={`text-xs sm:text-sm leading-snug break-words ${isSelected ? 'font-bold text-blue-600 dark:text-blue-400' : 'font-medium'}`}>
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
                        <Check className="shrink-0 w-3.5 h-3.5 text-blue-600 dark:text-blue-400 ml-2" />
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Hidden native select for form integration and accessibility */}
        <select
          aria-hidden="true"
          tabIndex={-1}
          value={value}
          onChange={onChange as any}
          disabled={disabled}
          name={name}
          required={required}
          className="sr-only"
          {...rest}
        >
          {children ||
            allOptions.map(o => (
              <option key={o.value} value={o.value} disabled={o.disabled}>
                {o.label} {o.sublabel ? `— ${o.sublabel}` : ''}
              </option>
            ))}
        </select>
      </div>
    </div>
  );
};

export default SelectField;

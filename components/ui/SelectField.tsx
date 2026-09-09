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
 * Parses raw text from <option> into structured label, sublabel, and badges.
 * E.g. "Sir Ahmed — Physics, Chemistry" -> { label: "Sir Ahmed", sublabel: "Physics, Chemistry" }
 * E.g. "Chapter 1: Physical Quantities" -> { label: "Physical Quantities", badge: "Ch 1" }
 */
function parseOptionText(raw: string): { label: string; sublabel?: string; badge?: string } {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.startsWith('--') || trimmed.toLowerCase().startsWith('choose') || trimmed.toLowerCase().startsWith('select')) {
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
    return { label: main.trim(), sublabel: rest.join('—').trim() };
  }
  if (trimmed.includes(' – ')) {
    const [main, ...rest] = trimmed.split(' – ');
    return { label: main.trim(), sublabel: rest.join(' – ').trim() };
  }
  if (trimmed.includes(' - ') && !trimmed.toLowerCase().includes('class')) {
    const [main, ...rest] = trimmed.split(' - ');
    return { label: main.trim(), sublabel: rest.join(' - ').trim() };
  }

  // Check for parenthesis: "Name (Designation)"
  const parenMatch = trimmed.match(/^(.+?)\s*\((.+?)\)$/);
  if (parenMatch) {
    return { label: parenMatch[1].trim(), badge: parenMatch[2].trim() };
  }

  return { label: trimmed };
}

/**
 * Extracts options from children if passed as standard <option> tags.
 */
function extractOptionsFromChildren(children: React.ReactNode): SelectOptionItem[] {
  const items: SelectOptionItem[] = [];
  React.Children.forEach(children, child => {
    if (!React.isValidElement(child)) return;
    if (child.type === 'option') {
      const { value = '', disabled = false, children: textContent } = child.props as any;
      const rawText = typeof textContent === 'string' ? textContent : String(textContent ?? value);
      const parsed = parseOptionText(rawText);
      items.push({
        value: String(value),
        label: parsed.label,
        sublabel: parsed.sublabel,
        badge: parsed.badge,
        disabled: Boolean(disabled),
      });
    }
  });
  return items;
}

/**
 * Modern Aesthetic Dropdown Menu:
 * - Displays complete, untruncated names for chapters, subjects, and teachers
 * - Expanded minimum dropdown panel widths with generous padding and line-wrapping
 * - Auto-search filter for lists with >= 5 items
 * - Sublabel and badge support for chapter numbers, classes, and subjects
 * - Keyboard navigation (Arrow keys, Enter, Escape)
 * - Accessible and fully backwards-compatible with native <select> event contracts
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
  const isSearchEnabled = searchable ?? selectableOptions.length >= 5;

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

  // Handle clicking outside to close
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearchQuery('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isOpen]);

  // Focus search input on open
  useEffect(() => {
    if (isOpen) {
      setHighlightedIndex(
        selectedOption ? filteredOptions.findIndex(o => o.value === selectedOption.value) : 0,
      );
      if (isSearchEnabled) {
        setTimeout(() => {
          searchInputRef.current?.focus();
        }, 30);
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

  // Dynamically compute optimal alignment (left, right, or center) so dropdown never overflows viewport or shifts page
  useEffect(() => {
    if (!isOpen) return;

    const checkPlacement = () => {
      if (!triggerRef.current) return;
      const rect = triggerRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const triggerCenter = rect.left + rect.width / 2;
      const spaceOnRight = viewportWidth - rect.left;
      const spaceOnLeft = rect.right;

      // Desired width for expanded dropdown
      const targetMenuWidth = 440;

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

  // Determine dropdown popup width and alignment positioning classes
  const dropdownWidthClass = useMemo(() => {
    if (dropdownWidth === 'match') return 'w-full min-w-full left-0 right-0';

    const baseWidth =
      dropdownWidth === 'xl'
        ? 'w-full min-w-full sm:w-[460px] sm:min-w-[400px] sm:max-w-[540px]'
        : dropdownWidth === 'wide'
        ? 'w-full min-w-full sm:w-[400px] sm:min-w-[340px] sm:max-w-[480px]'
        : 'w-full min-w-full sm:w-[420px] sm:max-w-[500px]';

    if (alignment === 'right') {
      return `${baseWidth} right-0 left-auto`;
    }
    if (alignment === 'center') {
      return `${baseWidth} sm:left-1/2 sm:-translate-x-1/2 left-0`;
    }
    return `${baseWidth} left-0 right-auto`;
  }, [dropdownWidth, alignment]);

  return (
    <div className="space-y-1.5 w-full" ref={containerRef} onKeyDown={handleKeyDown}>
      {/* Label and Hint Header */}
      {label && (
        <div className="flex items-center justify-between">
          <label
            htmlFor={selectId}
            className="flex items-center gap-1.5 text-[11px] font-bold text-brand-text-secondary uppercase tracking-wider select-none cursor-pointer"
            onClick={() => !disabled && setIsOpen(prev => !prev)}
          >
            {icon && <span className="text-brand-primary">{icon}</span>}
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
          className={`w-full min-h-12 px-3.5 py-2.5 flex items-center justify-between gap-3 rounded-xl border text-left transition-all duration-200 select-none ${
            disabled
              ? 'opacity-40 cursor-not-allowed bg-brand-bg/50 border-brand-border'
              : isOpen
              ? 'bg-brand-surface border-brand-primary ring-2 ring-brand-primary/20 shadow-md'
              : 'bg-brand-surface dark:bg-brand-surface/90 border-brand-border hover:border-brand-primary/40 hover:bg-brand-surface shadow-soft'
          } ${className}`}
        >
          {/* Selected Item Content: Clean full text representation */}
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            {selectedOption ? (
              <div className="flex items-start sm:items-center gap-2 min-w-0 flex-1">
                {selectedOption.badge && (
                  <span className="shrink-0 px-2 py-0.5 text-[10px] font-bold rounded-md bg-brand-primary/10 text-brand-primary border border-brand-primary/20 mt-0.5 sm:mt-0">
                    {selectedOption.badge}
                  </span>
                )}
                <div className="min-w-0 flex-1 flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-2">
                  <span
                    className="text-sm font-semibold text-brand-text-primary leading-snug break-words whitespace-normal text-left"
                    title={selectedOption.label}
                  >
                    {selectedOption.label}
                  </span>
                  {selectedOption.sublabel && (
                    <span
                      className="text-xs text-brand-text-secondary leading-normal break-words whitespace-normal text-left"
                      title={selectedOption.sublabel}
                    >
                      {selectedOption.sublabel}
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <span className="text-sm text-brand-text-tertiary font-normal">
                {defaultPlaceholderText}
              </span>
            )}
          </div>

          {/* Action Icons: Clear & Chevron */}
          <div className="flex items-center gap-1.5 shrink-0 text-brand-text-secondary/70 ml-1">
            {clearable && selectedOption && !disabled && (
              <span
                role="button"
                tabIndex={0}
                onClick={e => {
                  e.stopPropagation();
                  selectValue('');
                }}
                className="p-1 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 text-brand-text-tertiary hover:text-brand-text-primary transition-colors cursor-pointer"
                title="Clear selection"
              >
                <X className="w-3.5 h-3.5" />
              </span>
            )}
            <ChevronDown
              className={`w-4 h-4 text-brand-text-secondary transition-transform duration-300 ${
                isOpen ? 'rotate-180 text-brand-primary' : 'group-hover:text-brand-text-primary'
              }`}
            />
          </div>
        </button>

        {/* Floating Dropdown Menu */}
        {isOpen && !disabled && (
          <div
            className={`absolute top-full mt-1.5 z-[120] rounded-2xl bg-brand-surface dark:bg-[#131c30] border border-brand-border/90 shadow-2xl shadow-slate-900/25 dark:shadow-black/80 backdrop-blur-md overflow-hidden max-w-[calc(100vw-2rem)] animate-scaleIn ${dropdownWidthClass}`}
            style={{ maxHeight: '28rem' }}
          >
            {/* Search Box Header */}
            {isSearchEnabled && (
              <div className="p-2.5 border-b border-brand-border/60 bg-brand-bg/60 dark:bg-white/[0.03]">
                <div className="relative flex items-center">
                  <Search className="absolute left-3 w-4 h-4 text-brand-text-tertiary pointer-events-none" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search or filter options..."
                    className="w-full h-9 pl-9 pr-8 text-xs font-medium bg-brand-surface dark:bg-brand-panel border border-brand-border rounded-xl text-brand-text-primary placeholder:text-brand-text-tertiary focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary/30 transition-all"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2.5 p-0.5 rounded text-brand-text-tertiary hover:text-brand-text-primary"
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
              className="max-h-72 overflow-y-auto p-2 space-y-1.5 custom-scrollbar"
            >
              {/* Optional Placeholder / Unselect Option */}
              {placeholderOption && !searchQuery && (
                <button
                  type="button"
                  data-dropdown-item
                  onClick={() => selectValue('')}
                  className={`w-full px-3.5 py-2.5 flex items-center justify-between rounded-xl text-xs font-medium text-left transition-colors ${
                    !value
                      ? 'bg-brand-primary/10 text-brand-primary font-bold'
                      : 'text-brand-text-tertiary hover:bg-slate-100 dark:hover:bg-white/5 hover:text-brand-text-secondary'
                  }`}
                >
                  <span className="leading-snug break-words">{placeholderOption.label || defaultPlaceholderText}</span>
                  {!value && <Check className="w-4 h-4 text-brand-primary shrink-0 ml-2" />}
                </button>
              )}

              {filteredOptions.length === 0 ? (
                <div className="py-8 px-4 text-center">
                  <p className="text-xs font-semibold text-brand-text-secondary">No matching options</p>
                  <p className="text-[11px] text-brand-text-tertiary mt-0.5">
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
                      className={`w-full px-3.5 py-2.5 rounded-xl flex items-start sm:items-center justify-between gap-3 text-left transition-all duration-150 ${
                        opt.disabled
                          ? 'opacity-40 cursor-not-allowed'
                          : isSelected
                          ? 'bg-brand-primary/10 text-brand-primary dark:bg-brand-primary/20 shadow-xs ring-1 ring-brand-primary/30'
                          : isHighlighted
                          ? 'bg-slate-100 dark:bg-white/5 text-brand-text-primary'
                          : 'text-brand-text-primary hover:bg-slate-100 dark:hover:bg-white/5'
                      }`}
                    >
                      <div className="min-w-0 flex-1 flex items-start sm:items-center gap-2.5">
                        {/* Option Leading Badge (e.g. Ch 1, Grade 9) */}
                        {opt.badge && (
                          <span
                            className={`shrink-0 px-2 py-0.5 text-[10px] font-bold rounded-md uppercase tracking-wider mt-0.5 sm:mt-0 ${
                              isSelected
                                ? 'bg-brand-primary text-white'
                                : 'bg-brand-bg dark:bg-brand-panel text-brand-text-secondary border border-brand-border'
                            }`}
                          >
                            {opt.badge}
                          </span>
                        )}

                        {/* Title and Sublabel with complete wrapping */}
                        <div className="min-w-0 flex-1">
                          <div
                            className={`text-xs sm:text-sm leading-snug break-words whitespace-normal text-left ${
                              isSelected ? 'font-bold text-brand-primary' : 'font-semibold text-brand-text-primary'
                            }`}
                          >
                            {opt.label}
                          </div>
                          {opt.sublabel && (
                            <div className="text-[11px] text-brand-text-secondary leading-normal mt-0.5 break-words whitespace-normal text-left">
                              {opt.sublabel}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Selected Indicator */}
                      {isSelected && (
                        <div className="shrink-0 w-5 h-5 rounded-full bg-brand-primary text-white flex items-center justify-center ml-2 mt-0.5 sm:mt-0">
                          <Check className="w-3 h-3 stroke-[3]" />
                        </div>
                      )}
                    </button>
                  );
                })
              )}
            </div>

            {/* Footer Summary / Item Count */}
            {selectableOptions.length > 5 && (
              <div className="px-3.5 py-2 bg-brand-bg/60 dark:bg-white/[0.02] border-t border-brand-border/60 flex items-center justify-between text-[10px] text-brand-text-tertiary">
                <span>{filteredOptions.length} of {selectableOptions.length} options</span>
                <span className="hidden sm:inline">Use ↑↓ keys to navigate</span>
              </div>
            )}
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

import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  SelectOptionItem,
  extractOptionsFromChildren,
} from './select/selectHelpers';
import { SelectDropdownMenu } from './select/SelectDropdownMenu';
import { SelectTrigger } from './select/SelectTrigger';
import { useDropdownPlacement } from './select/useDropdownPlacement';

export type { SelectOptionItem };

export interface SelectFieldProps
  extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'onChange'> {
  label?: string;
  icon?: React.ReactNode;
  hint?: string;
  options?: SelectOptionItem[];
  searchable?: boolean;
  clearable?: boolean;
  placeholder?: string;
  dropdownWidth?: 'match' | 'wide' | 'xl' | string;
  onChange?: (
    e:
      | React.ChangeEvent<HTMLSelectElement>
      | { target: { value: string; name?: string; id?: string } },
  ) => void;
}

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

  const allOptions = useMemo<SelectOptionItem[]>(() => {
    if (explicitOptions && explicitOptions.length > 0) return explicitOptions;
    if (children) return extractOptionsFromChildren(children);
    return [];
  }, [explicitOptions, children]);

  const placeholderOption = useMemo(
    () => allOptions.find(o => o.value === ''),
    [allOptions],
  );

  const selectableOptions = useMemo(
    () => allOptions.filter(o => o.value !== ''),
    [allOptions],
  );

  const defaultPlaceholderText = placeholderOption?.label || placeholder;

  const selectedOption = useMemo(() => {
    const strVal = String(value ?? '');
    if (!strVal) return null;
    return allOptions.find(o => String(o.value) === strVal) || null;
  }, [allOptions, value]);

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

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
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

  useEffect(() => {
    if (isOpen) {
      setHighlightedIndex(
        selectedOption
          ? filteredOptions.findIndex(o => o.value === selectedOption.value)
          : 0,
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
        setHighlightedIndex(prev =>
          prev < filteredOptions.length - 1 ? prev + 1 : 0,
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex(prev =>
          prev > 0 ? prev - 1 : filteredOptions.length - 1,
        );
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

  const { dropdownWidthClass } = useDropdownPlacement(isOpen, triggerRef, dropdownWidth);

  return (
    <div
      className={`space-y-1.5 w-full relative ${isOpen ? 'z-50' : 'z-auto'}`}
      ref={containerRef}
      onKeyDown={handleKeyDown}
    >
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
          {hint && (
            <span className="text-[10px] font-medium text-brand-text-tertiary">
              {hint}
            </span>
          )}
        </div>
      )}

      <div className="relative">
        <SelectTrigger
          selectId={selectId}
          disabled={disabled}
          isOpen={isOpen}
          className={className}
          selectedOption={selectedOption}
          defaultPlaceholderText={defaultPlaceholderText}
          clearable={clearable}
          triggerRef={triggerRef}
          onToggleOpen={() => !disabled && setIsOpen(prev => !prev)}
          onClear={() => selectValue('')}
        />

        <SelectDropdownMenu
          isOpen={isOpen}
          disabled={disabled}
          dropdownWidthClass={dropdownWidthClass}
          isSearchEnabled={isSearchEnabled}
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
          searchInputRef={searchInputRef}
          listRef={listRef}
          label={label}
          placeholderOption={placeholderOption}
          defaultPlaceholderText={defaultPlaceholderText}
          value={value}
          filteredOptions={filteredOptions}
          highlightedIndex={highlightedIndex}
          onHighlightIndex={setHighlightedIndex}
          onSelectValue={selectValue}
        />

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

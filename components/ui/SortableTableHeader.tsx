import React from 'react';
import { ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';

export interface SortableTableHeaderProps<T extends string = string> {
  field: T;
  label?: React.ReactNode;
  children?: React.ReactNode;
  currentField?: T | null;
  currentSortField?: T | null;
  currentDirection?: 'asc' | 'desc';
  sortDirection?: 'asc' | 'desc';
  onSort: (field: T) => void;
  align?: 'left' | 'center' | 'right';
  className?: string;
}

export function SortableTableHeader<T extends string = string>({
  field,
  label,
  children,
  currentField,
  currentSortField,
  currentDirection,
  sortDirection,
  onSort,
  align = 'left',
  className = '',
}: SortableTableHeaderProps<T>) {
  const activeSortField = currentField !== undefined ? currentField : currentSortField;
  const activeSortDir = currentDirection !== undefined ? currentDirection : sortDirection || 'asc';
  const isSorted = activeSortField === field;
  const content = label !== undefined ? label : children;
  const alignClass = align === 'center' ? 'text-center justify-center' : align === 'right' ? 'text-right justify-end' : 'text-left justify-start';

  return (
    <th
      scope="col"
      className={`px-3 py-3 text-xs font-bold text-slate-700 dark:text-slate-200 tracking-wider uppercase select-none ${className}`}
    >
      <button
        type="button"
        onClick={() => onSort(field)}
        className={`group inline-flex items-center gap-1.5 hover:text-primary transition-colors cursor-pointer w-full ${alignClass}`}
        aria-label={`Sort by ${typeof content === 'string' ? content : field}`}
      >
        <span>{content}</span>
        <span className="shrink-0 transition-opacity">
          {isSorted ? (
            activeSortDir === 'asc' ? (
              <ArrowUp className="w-3.5 h-3.5 text-primary" />
            ) : (
              <ArrowDown className="w-3.5 h-3.5 text-primary" />
            )
          ) : (
            <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-0 group-hover:opacity-70 transition-opacity" />
          )}
        </span>
      </button>
    </th>
  );
}

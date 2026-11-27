import React from 'react';
import { List, LayoutGrid } from 'lucide-react';
import { SearchInput } from '../ui/SearchInput';
import SelectField from '../ui/SelectField';

export interface RecordsFilterToolbarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  selectedClass: string;
  onClassChange: (c: string) => void;
  classOptions: string[];
  selectedSection: string;
  onSectionChange: (s: string) => void;
  sectionOptions: string[];
  selectedStatus: string;
  onStatusChange: (st: string) => void;
  statusOptions: string[];
  selectedGender: string;
  onGenderChange: (g: string) => void;
  filteredCount: number;
  totalCount: number;
  viewMode: 'auto' | 'table' | 'cards';
  onViewModeChange: (m: 'auto' | 'table' | 'cards') => void;
  pageSize: number;
  onPageSizeChange: (size: number) => void;
  onClearFilters: () => void;
}

export const RecordsFilterToolbar: React.FC<RecordsFilterToolbarProps> = React.memo(({
  searchQuery,
  onSearchChange,
  selectedClass,
  onClassChange,
  classOptions,
  selectedSection,
  onSectionChange,
  sectionOptions,
  selectedStatus,
  onStatusChange,
  statusOptions,
  selectedGender,
  onGenderChange,
  filteredCount,
  totalCount,
  viewMode,
  onViewModeChange,
  pageSize,
  onPageSizeChange,
  onClearFilters,
}) => {
  const hasActiveFilters =
    selectedClass !== 'all' ||
    selectedSection !== 'all' ||
    selectedStatus !== 'all' ||
    selectedGender !== 'all' ||
    Boolean(searchQuery);

  return (
    <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-black/[0.06] dark:border-white/[0.08] shadow-xs space-y-3">
      <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
        {/* Main Search Input */}
        <SearchInput
          className="flex-1"
          inputClassName="pl-10 pr-10 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-black/[0.08] dark:border-white/[0.08] focus:outline-hidden focus:ring-2 focus:ring-blue-500/30 text-xs text-slate-900 dark:text-white placeholder:text-slate-400"
          value={searchQuery}
          onChange={onSearchChange}
          placeholder="Find student name, father name, contact number, GR#, B.Form, CNIC..."
          resultCount={searchQuery ? filteredCount : undefined}
          aria-label="Search student records"
        />

        {/* Filter Dropdowns */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <SelectField
            aria-label="Filter by class"
            value={selectedClass}
            onChange={(e) => onClassChange(e.target.value)}
            size="sm"
            inline
            prefixLabel="Class"
            dropdownWidth="compact"
            searchable={classOptions.length >= 8}
            options={[
              { value: 'all', label: 'All' },
              ...classOptions.map((c) => ({ value: c, label: c })),
            ]}
          />

          <SelectField
            aria-label="Filter by section"
            value={selectedSection}
            onChange={(e) => onSectionChange(e.target.value)}
            size="sm"
            inline
            prefixLabel="Sec"
            dropdownWidth="compact"
            searchable={false}
            options={[
              { value: 'all', label: 'All' },
              ...sectionOptions.map((s) => ({ value: s, label: s })),
            ]}
          />

          <SelectField
            aria-label="Filter by status"
            value={selectedStatus}
            onChange={(e) => onStatusChange(e.target.value)}
            size="sm"
            inline
            prefixLabel="Status"
            dropdownWidth="compact"
            searchable={false}
            options={[
              { value: 'all', label: 'All' },
              ...statusOptions.map((s) => ({ value: s, label: s })),
            ]}
          />

          <SelectField
            aria-label="Filter by gender"
            value={selectedGender}
            onChange={(e) => onGenderChange(e.target.value)}
            size="sm"
            inline
            prefixLabel="Gender"
            dropdownWidth="compact"
            searchable={false}
            options={[
              { value: 'all', label: 'All' },
              { value: 'male', label: 'Male' },
              { value: 'female', label: 'Female' },
            ]}
          />

          {hasActiveFilters && (
            <button
              type="button"
              onClick={onClearFilters}
              className="px-2.5 py-1.5 rounded-xl text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer"
            >
              Clear Filters
            </button>
          )}
        </div>
      </div>

      {/* Results summary bar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 text-xs text-slate-600 dark:text-slate-300 pt-2 border-t border-black/[0.04] dark:border-white/[0.06]">
        <span className="tabular-nums">
          Showing <strong className="text-slate-900 dark:text-white">{filteredCount}</strong> of{' '}
          <strong className="text-slate-900 dark:text-white">{totalCount}</strong> school records
        </span>
        <div className="flex items-center gap-2.5 sm:gap-3">
          {/* View Mode Toggle */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-800/70 rounded-xl p-0.5 border border-black/[0.06] dark:border-white/[0.08]">
            <button
              type="button"
              onClick={() => onViewModeChange('auto')}
              className={`px-2.5 py-1 min-h-[36px] rounded-lg text-xs font-semibold transition-[color,background-color,box-shadow,transform] flex items-center justify-center gap-1 cursor-pointer active:scale-[0.97] ${
                viewMode === 'auto'
                  ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-white shadow-xs ring-1 ring-black/[0.04] dark:ring-white/[0.08]'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
              title="Auto Layout (Cards on mobile, Table on desktop)"
            >
              Auto
            </button>
            <button
              type="button"
              onClick={() => onViewModeChange('table')}
              className={`px-2.5 py-1 min-h-[36px] rounded-lg text-xs font-semibold transition-[color,background-color,box-shadow,transform] flex items-center justify-center gap-1 cursor-pointer active:scale-[0.97] ${
                viewMode === 'table'
                  ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-white shadow-xs ring-1 ring-black/[0.04] dark:ring-white/[0.08]'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
              title="Force Table View"
            >
              <List className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Table</span>
            </button>
            <button
              type="button"
              onClick={() => onViewModeChange('cards')}
              className={`px-2.5 py-1 min-h-[36px] rounded-lg text-xs font-semibold transition-[color,background-color,box-shadow,transform] flex items-center justify-center gap-1 cursor-pointer active:scale-[0.97] ${
                viewMode === 'cards'
                  ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-white shadow-xs ring-1 ring-black/[0.04] dark:ring-white/[0.08]'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
              title="Card View (Mobile Optimized)"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Cards</span>
            </button>
          </div>

          <SelectField
            aria-label="Rows per page"
            value={String(pageSize)}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            size="sm"
            inline
            prefixLabel="Rows"
            dropdownWidth="compact"
            searchable={false}
            options={[25, 50, 100, 200].map((n) => ({
              value: String(n),
              label: String(n),
            }))}
          />
        </div>
      </div>
    </div>
  );
});

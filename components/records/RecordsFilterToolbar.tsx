import React from 'react';
import { Search, X, List, LayoutGrid } from 'lucide-react';

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
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Find student name, father name, contact number, GR#, B.Form, CNIC..."
            className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-black/[0.08] dark:border-white/[0.08] focus:outline-none focus:ring-2 focus:ring-blue-500/30 text-xs text-slate-900 dark:text-white placeholder:text-slate-400"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 min-w-[32px] min-h-[32px] flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-md transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filter Dropdowns */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {/* Class Filter */}
          <div className="flex items-center gap-1 bg-slate-50 dark:bg-slate-800/60 border border-black/[0.08] dark:border-white/[0.08] rounded-xl px-2.5 py-1.5">
            <span className="text-slate-500 font-medium">Class:</span>
            <select
              value={selectedClass}
              onChange={(e) => onClassChange(e.target.value)}
              className="bg-transparent border-0 font-semibold text-slate-800 dark:text-slate-200 focus:outline-none cursor-pointer min-h-[32px]"
            >
              <option value="all">All</option>
              {classOptions.map((c) => (
                <option key={c} value={c}>
                  Class {c}
                </option>
              ))}
            </select>
          </div>

          {/* Section Filter */}
          <div className="flex items-center gap-1 bg-slate-50 dark:bg-slate-800/60 border border-black/[0.08] dark:border-white/[0.08] rounded-xl px-2.5 py-1.5">
            <span className="text-slate-500 font-medium">Sec:</span>
            <select
              value={selectedSection}
              onChange={(e) => onSectionChange(e.target.value)}
              className="bg-transparent border-0 font-semibold text-slate-800 dark:text-slate-200 focus:outline-none cursor-pointer min-h-[32px]"
            >
              <option value="all">All</option>
              {sectionOptions.map((s) => (
                <option key={s} value={s}>
                  Sec {s}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-1 bg-slate-50 dark:bg-slate-800/60 border border-black/[0.08] dark:border-white/[0.08] rounded-xl px-2.5 py-1.5">
            <span className="text-slate-500 font-medium">Status:</span>
            <select
              value={selectedStatus}
              onChange={(e) => onStatusChange(e.target.value)}
              className="bg-transparent border-0 font-semibold text-slate-800 dark:text-slate-200 focus:outline-none cursor-pointer min-h-[32px]"
            >
              <option value="all">All</option>
              {statusOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          {/* Gender Filter */}
          <div className="flex items-center gap-1 bg-slate-50 dark:bg-slate-800/60 border border-black/[0.08] dark:border-white/[0.08] rounded-xl px-2.5 py-1.5">
            <span className="text-slate-500 font-medium">Gender:</span>
            <select
              value={selectedGender}
              onChange={(e) => onGenderChange(e.target.value)}
              className="bg-transparent border-0 font-semibold text-slate-800 dark:text-slate-200 focus:outline-none cursor-pointer min-h-[32px]"
            >
              <option value="all">All</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </div>

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
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 pt-1 border-t border-black/[0.04] dark:border-white/[0.06]">
        <span>
          Showing <strong className="text-slate-900 dark:text-white">{filteredCount}</strong> of{' '}
          <strong className="text-slate-900 dark:text-white">{totalCount}</strong> school records
        </span>
        <div className="flex items-center gap-3">
          {/* View Mode Toggle */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-800/60 rounded-lg p-0.5 border border-black/[0.06] dark:border-white/[0.08]">
            <button
              type="button"
              onClick={() => onViewModeChange('auto')}
              className={`px-2.5 py-1 min-h-[32px] rounded text-xs font-semibold transition-colors flex items-center justify-center gap-1 cursor-pointer active:scale-[0.97] ${
                viewMode === 'auto'
                  ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
              title="Auto Layout (Cards on mobile, Table on desktop)"
            >
              Auto
            </button>
            <button
              type="button"
              onClick={() => onViewModeChange('table')}
              className={`px-2.5 py-1 min-h-[32px] rounded text-xs font-semibold transition-colors flex items-center justify-center gap-1 cursor-pointer active:scale-[0.97] ${
                viewMode === 'table'
                  ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
              title="Force Table View"
            >
              <List className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Table</span>
            </button>
            <button
              type="button"
              onClick={() => onViewModeChange('cards')}
              className={`px-2.5 py-1 min-h-[32px] rounded text-xs font-semibold transition-colors flex items-center justify-center gap-1 cursor-pointer active:scale-[0.97] ${
                viewMode === 'cards'
                  ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
              title="Card View (Mobile Optimized)"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Cards</span>
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <span>Rows:</span>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="bg-slate-50 dark:bg-slate-800/60 border border-black/[0.08] dark:border-white/[0.08] rounded-lg px-2 min-h-[32px] py-1 text-xs text-slate-800 dark:text-slate-200 focus:outline-none cursor-pointer"
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
});

import React from 'react';
import { Search } from 'lucide-react';
import { ClassTier, TIER_CONFIG } from '../../services/tierHelpers';

export interface LiveTierSearchToolbarProps {
  classFilter: 'all' | ClassTier;
  onClassFilterChange: (tier: 'all' | ClassTier) => void;
  totalClassesCount: number;
  searchQuery: string;
  onSearchQueryChange: (q: string) => void;
}

export const LiveTierSearchToolbar: React.FC<LiveTierSearchToolbarProps> = ({
  classFilter,
  onClassFilterChange,
  totalClassesCount,
  searchQuery,
  onSearchQueryChange,
}) => {
  return (
    <div className="pt-3 border-t border-black/[0.04] dark:border-white/[0.06] flex flex-col sm:flex-row items-center justify-between gap-3">
      <div className="flex items-center gap-1.5 w-full sm:w-auto flex-wrap text-xs">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mr-1">
          Tiers:
        </span>

        <button
          type="button"
          onClick={() => onClassFilterChange('all')}
          className={`px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
            classFilter === 'all'
              ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 font-bold'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          All ({totalClassesCount})
        </button>

        {(['primary', 'elementary', 'middle', 'secondary'] as ClassTier[]).map((tier) => (
          <button
            key={tier}
            type="button"
            onClick={() => onClassFilterChange(tier)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer capitalize ${
              classFilter === tier
                ? TIER_CONFIG[tier].badgeClass + ' font-bold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${TIER_CONFIG[tier].dotClass}`} />
            <span>{tier}</span>
          </button>
        ))}
      </div>

      <div className="relative w-full sm:w-64">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
        <input
          type="text"
          placeholder="Search class, teacher, subject..."
          value={searchQuery}
          onChange={(e) => onSearchQueryChange(e.target.value)}
          className="w-full pl-8 pr-3 py-1.5 rounded-xl text-xs bg-slate-50 dark:bg-slate-900/60 border border-black/[0.08] dark:border-white/[0.08] focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none text-slate-900 dark:text-white transition-all placeholder:text-slate-400"
        />
      </div>
    </div>
  );
};

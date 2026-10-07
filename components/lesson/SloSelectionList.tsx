import React from 'react';
import { motion } from 'motion/react';
import { SkeletonList } from '../ui/Skeleton';
import { CurriculumChapter } from '../../types';

export interface SloSelectionListProps {
  selectedChapter: CurriculumChapter | null;
  chapterSlos: any[];
  isLoadingSlos: boolean;
  selectedSloIds: string[];
  onSelectedSloIdsChange: (ids: string[]) => void;
}

export const SloSelectionList: React.FC<SloSelectionListProps> = ({
  selectedChapter,
  chapterSlos,
  isLoadingSlos,
  selectedSloIds,
  onSelectedSloIdsChange,
}) => {
  if (!selectedChapter) return null;

  const handleSloToggle = (sloId: string) => {
    onSelectedSloIdsChange(
      selectedSloIds.includes(sloId)
        ? selectedSloIds.filter((id) => id !== sloId)
        : [...selectedSloIds, sloId]
    );
  };

  const handleSelectAllSlos = () => {
    onSelectedSloIdsChange(
      selectedSloIds.length === chapterSlos.length
        ? []
        : chapterSlos.map((s) => s.uniqueId || s.SLO_ID)
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <div className="flex items-center justify-between mb-2">
        <label className="block text-[11px] font-semibold text-brand-text-secondary uppercase tracking-wide">
          Select SLO(s) from {selectedChapter.name}
        </label>
        {chapterSlos.length > 0 && (
          <button
            type="button"
            onClick={handleSelectAllSlos}
            className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
          >
            {selectedSloIds.length === chapterSlos.length ? 'Deselect All' : 'Select All'}
          </button>
        )}
      </div>

      <div className="bg-slate-50 dark:bg-slate-900/40 border border-black/[0.06] dark:border-white/[0.08] rounded-xl p-3 max-h-64 overflow-y-auto custom-scrollbar">
        {isLoadingSlos ? (
          <SkeletonList rows={4} />
        ) : chapterSlos.length === 0 ? (
          <div className="text-sm text-brand-text-secondary text-center py-4">
            No SLOs available for this chapter
          </div>
        ) : (
          <div className="space-y-2">
            {chapterSlos.map((slo, idx) => {
              const sloId = slo.uniqueId || slo.SLO_ID || slo.id || `slo-${idx}`;
              const isSelected = selectedSloIds.includes(sloId);
              return (
                <label
                  key={sloId}
                  className={`flex items-start gap-3 p-3 rounded-xl cursor-pointer transition-all duration-150 ${
                    isSelected
                      ? 'bg-blue-50/80 dark:bg-blue-950/40 border border-blue-500/30'
                      : 'bg-white dark:bg-brand-surface border border-black/[0.04] dark:border-white/[0.06] hover:border-black/[0.1]'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => handleSloToggle(sloId)}
                    className="mt-1 w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500/20 accent-blue-600 cursor-pointer"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-brand-text-primary mb-1">
                      {slo.SLO_Text || slo.text || 'SLO content'}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-brand-text-secondary">
                      <span className="font-mono tabular-nums">
                        {slo.SLO_ID || slo.id || `SLO-${idx + 1}`}
                      </span>
                      {slo.Cognitive_Level_Code && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-semibold text-blue-600 dark:text-blue-400">
                            {slo.Cognitive_Level_Code}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
        )}
      </div>
      {selectedSloIds.length > 0 && (
        <div className="mt-2 text-xs text-brand-text-secondary font-mono tabular-nums">
          {selectedSloIds.length} SLO(s) selected
        </div>
      )}
    </motion.div>
  );
};

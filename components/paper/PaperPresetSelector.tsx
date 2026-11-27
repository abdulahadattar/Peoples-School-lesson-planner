import React from 'react';
import { Check } from 'lucide-react';
import { PaperFormat } from '../../types';
import {
  getPresetsForFormat,
  PAPER_PRESETS,
  type PaperPreset,
} from '../../services/paper/paperFormatPresets';

export { PAPER_PRESETS, type PaperPreset };

export interface PaperPresetSelectorProps {
  paperFormat: PaperFormat;
  activePresetId: string;
  onSelectPreset: (preset: PaperPreset) => void;
}

const FORMAT_LABELS: Record<PaperFormat, { title: string; subtitle: string }> = {
  full: { title: 'Full Paper Presets', subtitle: 'Section A + B + C templates' },
  section_ab: { title: 'Section A + B Presets', subtitle: 'MCQs + Short questions' },
  mcq_only: { title: 'Unit Test Presets', subtitle: 'Answer Key & OMR ready' },
};

export const PaperPresetSelector: React.FC<PaperPresetSelectorProps> = ({
  paperFormat,
  activePresetId,
  onSelectPreset,
}) => {
  const presets = getPresetsForFormat(paperFormat);
  const labels = FORMAT_LABELS[paperFormat];

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="block text-xs text-brand-text-secondary font-medium">
          {labels.title}
        </label>
        <span className="text-[11px] text-brand-text-tertiary">{labels.subtitle}</span>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        {presets.map((preset) => {
          const isActive = activePresetId === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              aria-pressed={isActive}
              onClick={() => onSelectPreset(preset)}
              className={`relative p-3 rounded-xl border text-left transition-[color,background-color,border-color,box-shadow,transform] cursor-pointer outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 active:scale-[0.985] ${
                isActive
                  ? 'border-blue-600/60 dark:border-blue-400/60 bg-blue-50/90 dark:bg-blue-950/45 ring-1 ring-blue-500/25 dark:ring-blue-400/25 shadow-sm'
                  : 'border-brand-border bg-brand-surface hover:border-blue-500/35 hover:bg-slate-50/60 dark:hover:bg-slate-800/50'
              }`}
            >
              <div className="flex items-start justify-between gap-1.5">
                <div
                  className={`font-semibold text-xs truncate ${
                    isActive ? 'text-blue-700 dark:text-blue-300' : 'text-brand-text-primary'
                  }`}
                >
                  {preset.name}
                </div>
                {isActive && (
                  <span className="shrink-0 w-4 h-4 rounded-full bg-blue-600 text-white flex items-center justify-center">
                    <Check className="w-2.5 h-2.5 stroke-[3]" />
                  </span>
                )}
              </div>
              <div className="text-[10px] text-brand-text-tertiary mt-0.5 font-mono truncate">
                {preset.formulaLabel}
              </div>
              <div className="text-[10px] text-brand-text-secondary mt-1.5 flex items-center justify-between tabular-nums font-medium">
                <span>{preset.total} Marks</span>
                <span>{preset.duration}m</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

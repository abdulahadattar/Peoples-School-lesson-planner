import React from 'react';
import { Check } from 'lucide-react';
import type { ClassroomTestFrequency } from '../../services/omr/types';

export interface PaperPreset {
  id: string;
  name: string;
  total: number;
  duration: number;
  mcq: number;
  testFrequency: ClassroomTestFrequency;
  formulaLabel: string;
}

export const PAPER_PRESETS: PaperPreset[] = [
  {
    id: 'weekly-30',
    name: 'Weekly Test (30 MCQs)',
    total: 30,
    duration: 30,
    mcq: 30,
    testFrequency: 'weekly',
    formulaLabel: '30 MCQs · Weekly',
  },
  {
    id: 'weekly-35',
    name: 'Weekly Review (35 MCQs)',
    total: 35,
    duration: 35,
    mcq: 35,
    testFrequency: 'weekly',
    formulaLabel: '35 MCQs · Weekly',
  },
  {
    id: 'monthly-40',
    name: 'Unit Test (40 MCQs)',
    total: 40,
    duration: 45,
    mcq: 40,
    testFrequency: 'monthly',
    formulaLabel: '40 MCQs · Monthly',
  },
  {
    id: 'monthly-50',
    name: 'Monthly Test (50 MCQs)',
    total: 50,
    duration: 50,
    mcq: 50,
    testFrequency: 'monthly',
    formulaLabel: '50 MCQs · Monthly',
  },
];

export interface PaperPresetSelectorProps {
  activePresetId: string;
  onSelectPreset: (preset: PaperPreset) => void;
}

export const PaperPresetSelector: React.FC<PaperPresetSelectorProps> = ({
  activePresetId,
  onSelectPreset,
}) => {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="block text-xs text-brand-text-secondary font-medium">
          Classroom Test Presets (30–50 MCQs)
        </label>
        <span className="text-[11px] text-brand-text-tertiary">Weekly &amp; monthly OMR-ready tests</span>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        {PAPER_PRESETS.map((preset) => {
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

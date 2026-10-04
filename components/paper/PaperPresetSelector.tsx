import React from 'react';

export interface PaperPreset {
  id: string;
  name: string;
  total: number;
  duration: number;
  mcq: number;
  shortListed: number;
  shortAttempt: number;
  shortMarks: number;
  longListed: number;
  longAttempt: number;
  longMarks: number;
  formulaLabel: string;
}

export const PAPER_PRESETS: PaperPreset[] = [
  {
    id: 'class-test',
    name: 'Class Test (25M)',
    total: 25,
    duration: 45,
    mcq: 5,
    shortListed: 8,
    shortAttempt: 6,
    shortMarks: 2,
    longListed: 3,
    longAttempt: 2,
    longMarks: 4,
    formulaLabel: '5(1M) + 6(2M) + 2(4M)',
  },
  {
    id: 'mcq-quiz',
    name: '30 MCQs Quiz (30M)',
    total: 30,
    duration: 35,
    mcq: 30,
    shortListed: 0,
    shortAttempt: 0,
    shortMarks: 2,
    longListed: 0,
    longAttempt: 0,
    longMarks: 4,
    formulaLabel: '30 MCQs only',
  },
  {
    id: 'unit-quiz',
    name: 'Unit Quiz (20M)',
    total: 20,
    duration: 30,
    mcq: 4,
    shortListed: 6,
    shortAttempt: 4,
    shortMarks: 2,
    longListed: 3,
    longAttempt: 2,
    longMarks: 4,
    formulaLabel: '4(1M) + 4(2M) + 2(4M)',
  },
  {
    id: 'midterm',
    name: 'Midterm Exam (50M)',
    total: 50,
    duration: 90,
    mcq: 10,
    shortListed: 12,
    shortAttempt: 8,
    shortMarks: 3,
    longListed: 5,
    longAttempt: 4,
    longMarks: 4,
    formulaLabel: '10(1M) + 8(3M) + 4(4M)',
  },
  {
    id: 'board-model',
    name: 'Board Model (75M)',
    total: 75,
    duration: 120,
    mcq: 15,
    shortListed: 12,
    shortAttempt: 9,
    shortMarks: 4,
    longListed: 4,
    longAttempt: 3,
    longMarks: 8,
    formulaLabel: '15(1M) + 9(4M) + 3(8M)',
  },
  {
    id: 'annual',
    name: 'Annual Exam (100M)',
    total: 100,
    duration: 180,
    mcq: 20,
    shortListed: 14,
    shortAttempt: 10,
    shortMarks: 4,
    longListed: 6,
    longAttempt: 5,
    longMarks: 8,
    formulaLabel: '20(1M) + 10(4M) + 5(8M)',
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
          Quick Structure Presets
        </label>
        <span className="text-[11px] text-brand-text-tertiary">Pre-configured board formats</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {PAPER_PRESETS.map(preset => {
          const isActive = activePresetId === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => onSelectPreset(preset)}
              className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                isActive
                  ? 'border-brand-primary bg-brand-primary/10 dark:bg-brand-primary/20 shadow-xs'
                  : 'border-brand-border bg-brand-surface hover:border-brand-primary/40'
              }`}
            >
              <div className="font-semibold text-xs text-brand-text-primary truncate">{preset.name}</div>
              <div className="text-[10px] text-brand-text-tertiary mt-0.5 font-mono truncate">{preset.formulaLabel}</div>
              <div className="text-[10px] text-brand-text-secondary mt-1 flex items-center justify-between">
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

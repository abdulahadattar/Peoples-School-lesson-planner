import React from 'react';

export const EXPORT_FORMATS = [
  { value: 'docx', label: 'Word (.docx)' },
  { value: 'pdf', label: 'PDF (.pdf)' },
  { value: 'both', label: 'Both' },
] as const;

/**
 * Segmented control — shared by the generation-mode and export-format toggles
 * in SubjectSelector and PaperPanel (one copy, used everywhere).
 */
const SegmentedControl: React.FC<{
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: any) => void;
}> = ({ value, options, onChange }) => (
  <div
    className="grid gap-2 p-1 bg-brand-bg rounded-xl border border-brand-border"
    style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
  >
    {options.map(option => {
      const isActive = value === option.value;
      return (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          aria-pressed={isActive}
          className={`relative flex items-center justify-center px-3 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 min-h-[44px] overflow-hidden ${
            isActive ? 'text-white' : 'text-brand-text-secondary hover:text-brand-text-primary hover:bg-brand-surface'
          }`}
        >
          {isActive && <span className="absolute inset-0 brand-gradient animate-scaleIn" />}
          <span className="relative z-10 truncate">{option.label}</span>
        </button>
      );
    })}
  </div>
);

export default SegmentedControl;
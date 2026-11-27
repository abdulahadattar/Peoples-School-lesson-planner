import React, { useState } from 'react';
import { PaperQuestion } from '../../types';
import { questionNumber } from '../../services/paperLayout';
import SelectField from '../ui/SelectField';

export interface QuestionEditFormProps {
  question: PaperQuestion;
  index: number;
  onSave: (updated: PaperQuestion) => void;
  onCancel: () => void;
}

export const QuestionEditForm: React.FC<QuestionEditFormProps> = ({
  question,
  index,
  onSave,
  onCancel,
}) => {
  const [editText, setEditText] = useState(question.question);
  const [editMarks, setEditMarks] = useState(question.marks);
  const [editOptions, setEditOptions] = useState<string[]>(question.options || []);
  const [editCorrectAnswer, setEditCorrectAnswer] = useState<string>(
    question.correctAnswer || ''
  );

  const handleAddOption = () => {
    setEditOptions((prev) => [...prev, `Option ${prev.length + 1}`]);
  };

  const handleRemoveOption = (optIdx: number) => {
    setEditOptions((prev) => prev.filter((_, i) => i !== optIdx));
  };

  const handleOptionChange = (optIdx: number, val: string) => {
    setEditOptions((prev) => {
      const copy = [...prev];
      copy[optIdx] = val;
      return copy;
    });
  };

  const handleSave = () => {
    const cleanCorrect = editCorrectAnswer.trim().toUpperCase().replace(/[^A-D]/g, '').slice(0, 1);
    onSave({
      ...question,
      question: editText.trim(),
      marks: Number(editMarks) || question.marks,
      options: editOptions.length > 0 ? editOptions.map((o) => o.trim()).filter(Boolean) : undefined,
      ...(question.type === 'mcq' && cleanCorrect ? { correctAnswer: cleanCorrect } : {}),
    });
  };

  return (
    <div className="p-3.5 bg-brand-bg rounded-lg border border-brand-primary/40 shadow-sm space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wider text-brand-primary">
          Editing Question {questionNumber(index)} ({question.type.toUpperCase()})
        </span>
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-brand-text-secondary">Marks:</label>
          <input
            type="number"
            inputMode="numeric"
            autoComplete="off"
            min={1}
            max={50}
            value={editMarks}
            onChange={(e) => setEditMarks(Number(e.target.value))}
            className="w-16 px-2 py-1 text-xs rounded border border-brand-border bg-brand-surface text-brand-text-primary"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-brand-text-secondary mb-1">
          Question Text (LaTeX formulas inside $...$):
        </label>
        <textarea
          rows={3}
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          className="w-full px-3 py-2 text-sm rounded-md border border-brand-border bg-brand-surface text-brand-text-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
        />
      </div>

      {/* Options for MCQ */}
      {(question.type === 'mcq' || editOptions.length > 0) && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="text-xs font-medium text-brand-text-secondary">Options:</label>
            <div className="flex items-center gap-3">
              <SelectField
                aria-label="OMR Answer Key"
                value={editCorrectAnswer}
                onChange={(e) => setEditCorrectAnswer(e.target.value)}
                size="sm"
                inline
                prefixLabel="Key"
                dropdownWidth="compact"
                searchable={false}
                options={[
                  { value: '', label: 'Unset (A)' },
                  { value: 'A', label: 'A' },
                  { value: 'B', label: 'B' },
                  { value: 'C', label: 'C' },
                  { value: 'D', label: 'D' },
                ]}
              />
              <button
                type="button"
                onClick={handleAddOption}
                className="text-xs text-brand-primary font-medium hover:underline"
              >
                + Add Option
              </button>
            </div>
          </div>
          {editOptions.map((opt, optIdx) => (
            <div key={optIdx} className="flex items-center gap-2">
              <span className="text-xs font-bold text-brand-text-secondary w-5">
                ({String.fromCharCode(65 + optIdx)})
              </span>
              <input
                type="text"
                value={opt}
                onChange={(e) => handleOptionChange(optIdx, e.target.value)}
                className="flex-1 px-2.5 py-1 text-xs rounded border border-brand-border bg-brand-surface text-brand-text-primary"
              />
              <button
                type="button"
                onClick={() => handleRemoveOption(optIdx)}
                className="text-xs text-red-500 hover:text-red-700 px-1.5 py-0.5 rounded"
                title="Remove option"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 text-xs font-medium rounded text-brand-text-secondary hover:bg-brand-surface border border-brand-border"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          className="px-3.5 py-1.5 text-xs font-medium rounded bg-brand-primary text-white hover:bg-brand-primary/90"
        >
          Save Changes
        </button>
      </div>
    </div>
  );
};

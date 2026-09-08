import React, { useState } from 'react';
import { PaperQuestion, GeneratedPaper } from '../types';
import {
  hasOptions,
  layoutOptions,
  OPTION_CIRCLE,
  optionLetter,
  questionNumber,
} from '../services/paperLayout';
import KaTeXText from './KaTeXText';
import Spinner from './ui/Spinner';
import { regenerateSingleQuestion } from '../services/paperService';

interface QuestionEditorProps {
  question: PaperQuestion;
  index: number;
  sectionIndex: number;
  paper: GeneratedPaper;
  onUpdateQuestion: (updatedQuestion: PaperQuestion) => void;
  onDeleteQuestion: () => void;
}

export const QuestionEditor: React.FC<QuestionEditorProps> = ({
  question,
  index,
  paper,
  onUpdateQuestion,
  onDeleteQuestion,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [showRegenPrompt, setShowRegenPrompt] = useState(false);
  const [customPrompt, setCustomPrompt] = useState('');
  const [regenError, setRegenError] = useState<string | null>(null);

  // Edit form state
  const [editText, setEditText] = useState(question.question);
  const [editMarks, setEditMarks] = useState(question.marks);
  const [editOptions, setEditOptions] = useState<string[]>(question.options || []);

  const handleStartEdit = () => {
    setEditText(question.question);
    setEditMarks(question.marks);
    setEditOptions(question.options ? [...question.options] : []);
    setIsEditing(true);
  };

  const handleSaveEdit = () => {
    onUpdateQuestion({
      ...question,
      question: editText.trim(),
      marks: Number(editMarks) || question.marks,
      options: editOptions.length > 0 ? editOptions.map(o => o.trim()).filter(Boolean) : undefined,
    });
    setIsEditing(false);
  };

  const handleRegenerate = async () => {
    setIsRegenerating(true);
    setRegenError(null);
    setShowRegenPrompt(false);
    try {
      const newQuestion = await regenerateSingleQuestion(paper, question, customPrompt);
      onUpdateQuestion(newQuestion);
    } catch (err: any) {
      console.error('Failed to regenerate question:', err);
      setRegenError(err?.message || 'Failed to regenerate question');
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleAddOption = () => {
    setEditOptions(prev => [...prev, `Option ${prev.length + 1}`]);
  };

  const handleRemoveOption = (optIdx: number) => {
    setEditOptions(prev => prev.filter((_, i) => i !== optIdx));
  };

  const handleOptionChange = (optIdx: number, val: string) => {
    setEditOptions(prev => {
      const copy = [...prev];
      copy[optIdx] = val;
      return copy;
    });
  };

  if (isEditing) {
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
              min={1}
              max={50}
              value={editMarks}
              onChange={e => setEditMarks(Number(e.target.value))}
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
            onChange={e => setEditText(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-md border border-brand-border bg-brand-surface text-brand-text-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
          />
        </div>

        {/* Options for MCQ */}
        {(question.type === 'mcq' || editOptions.length > 0) && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-brand-text-secondary">Options:</label>
              <button
                type="button"
                onClick={handleAddOption}
                className="text-xs text-brand-primary font-medium hover:underline"
              >
                + Add Option
              </button>
            </div>
            {editOptions.map((opt, optIdx) => (
              <div key={optIdx} className="flex items-center gap-2">
                <span className="text-xs font-bold text-brand-text-secondary w-5">
                  ({String.fromCharCode(65 + optIdx)})
                </span>
                <input
                  type="text"
                  value={opt}
                  onChange={e => handleOptionChange(optIdx, e.target.value)}
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
            onClick={() => setIsEditing(false)}
            className="px-3 py-1.5 text-xs font-medium rounded text-brand-text-secondary hover:bg-brand-surface border border-brand-border"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSaveEdit}
            className="px-3.5 py-1.5 text-xs font-medium rounded bg-brand-primary text-white hover:bg-brand-primary/90"
          >
            Save Changes
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="group relative p-2.5 -mx-2.5 rounded-lg hover:bg-brand-surface/70 transition-colors">
      {/* Loading Overlay when regenerating */}
      {isRegenerating && (
        <div className="absolute inset-0 bg-brand-surface/80 backdrop-blur-[1px] flex items-center justify-center rounded-lg z-10 gap-2 text-xs font-medium text-brand-primary">
          <Spinner size="sm" />
          <span>Regenerating question with AI...</span>
        </div>
      )}

      {/* Question Header & Controls */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start flex-1 min-w-0">
          <span className="font-semibold text-brand-text-primary mr-1.5 flex-shrink-0">
            {questionNumber(index)}.
          </span>
          <div className="text-brand-text-primary flex-1">
            <KaTeXText text={question.question} />
          </div>
        </div>

        {/* Granular Action Buttons (visible on hover or focus) */}
        <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity flex-shrink-0">
          <span className="text-[11px] font-semibold text-brand-text-secondary bg-brand-bg px-1.5 py-0.5 rounded border border-brand-border mr-1">
            {question.marks}M
          </span>

          <button
            type="button"
            onClick={handleStartEdit}
            title="Edit question text and marks"
            className="p-1 text-xs text-brand-text-secondary hover:text-brand-primary hover:bg-brand-bg rounded"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          </button>

          <button
            type="button"
            onClick={() => setShowRegenPrompt(prev => !prev)}
            title="Regenerate this specific question with AI"
            className="p-1 text-xs text-brand-text-secondary hover:text-emerald-600 hover:bg-brand-bg rounded"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>

          <button
            type="button"
            onClick={onDeleteQuestion}
            title="Remove question from section"
            className="p-1 text-xs text-brand-text-secondary hover:text-rose-600 hover:bg-brand-bg rounded"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>

      {/* Regeneration Prompt Popover */}
      {showRegenPrompt && (
        <div className="mt-2.5 p-3 bg-brand-bg border border-brand-border rounded-lg shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-brand-text-primary">
              Regenerate Question {questionNumber(index)}
            </span>
            <button
              type="button"
              onClick={() => setShowRegenPrompt(false)}
              className="text-xs text-brand-text-secondary hover:text-brand-text-primary"
            >
              ✕
            </button>
          </div>
          <input
            type="text"
            placeholder="Optional instruction: e.g. Focus on numerical calculation, conceptual reasoning..."
            value={customPrompt}
            onChange={e => setCustomPrompt(e.target.value)}
            className="w-full px-2.5 py-1.5 text-xs rounded border border-brand-border bg-brand-surface text-brand-text-primary"
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleRegenerate();
              }
            }}
          />
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowRegenPrompt(false)}
              className="px-2.5 py-1 text-xs text-brand-text-secondary hover:bg-brand-surface rounded border border-brand-border"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleRegenerate}
              className="px-3 py-1 text-xs font-medium rounded bg-emerald-600 text-white hover:bg-emerald-700"
            >
              Regenerate with AI
            </button>
          </div>
        </div>
      )}

      {regenError && (
        <div className="mt-2 text-xs text-rose-600 bg-rose-50 dark:bg-rose-950/30 p-2 rounded border border-rose-200 dark:border-rose-900">
          {regenError}
        </div>
      )}

      {/* MCQ Options Display */}
      {hasOptions(question) && (
        <div className="mt-2 space-y-1.5 pl-5">
          {layoutOptions(question.options || []).map((row, rIdx) =>
            row.options.length === 2 ? (
              <div key={rIdx} className="grid grid-cols-2 gap-x-8 items-start">
                {row.options.map(o => (
                  <div key={o.index} className="flex items-start">
                    <span className="text-brand-text-secondary mr-1.5 whitespace-nowrap text-xs">
                      {OPTION_CIRCLE} {optionLetter(o.index)})
                    </span>
                    <KaTeXText text={o.text} className="text-brand-text-secondary text-xs" />
                  </div>
                ))}
              </div>
            ) : (
              <div key={rIdx} className="flex items-start">
                <span className="text-brand-text-secondary mr-1.5 whitespace-nowrap text-xs">
                  {OPTION_CIRCLE} {optionLetter(row.options[0].index)})
                </span>
                <KaTeXText text={row.options[0].text} className="text-brand-text-secondary text-xs" />
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
};

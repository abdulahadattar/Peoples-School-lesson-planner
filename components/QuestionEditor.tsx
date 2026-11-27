import React, { useState } from 'react';
import { Pencil, RefreshCw, SlidersHorizontal, Trash2 } from 'lucide-react';
import { PaperQuestion, GeneratedPaper } from '../types';
import {
  cleanOptionText,
  cleanQuestionText,
  hasOptions,
  layoutOptions,
  OPTION_CIRCLE,
  optionLetter,
  questionNumber,
  shouldStackOptions,
} from '../services/paperLayout';
import KaTeXText from './KaTeXText';
import Spinner from './ui/Spinner';
import { regenerateSingleQuestion } from '../services/paperService';
import { QuestionEditForm } from './paper/QuestionEditForm';
import { toUserErrorMessage } from '../utils/userMessage';

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

  const handleRegenerate = async (noteOverride?: string) => {
    setIsRegenerating(true);
    setRegenError(null);
    setShowRegenPrompt(false);
    try {
      const newQuestion = await regenerateSingleQuestion(paper, question, noteOverride ?? customPrompt);
      onUpdateQuestion(newQuestion);
      setCustomPrompt('');
    } catch (err: any) {
      console.error('Failed to regenerate question:', err);
      setRegenError(toUserErrorMessage(err, 'Could not regenerate question. Please try again.'));
    } finally {
      setIsRegenerating(false);
    }
  };

  if (isEditing) {
    return (
      <QuestionEditForm
        question={question}
        index={index}
        onSave={(updated) => {
          onUpdateQuestion(updated);
          setIsEditing(false);
        }}
        onCancel={() => setIsEditing(false)}
      />
    );
  }

  return (
    <div className="print-question-block group relative p-2.5 -mx-2.5 rounded-lg hover:bg-brand-surface/70 transition-colors print:p-0 print:mx-0 print:mb-1.5 print:rounded-none">
      {/* Loading Overlay when regenerating */}
      {isRegenerating && (
        <div className="absolute inset-0 bg-brand-surface/80 backdrop-blur-[1px] flex items-center justify-center rounded-lg z-10 gap-2 text-xs font-medium text-brand-primary print:hidden">
          <Spinner size="sm" />
          <span>Regenerating question...</span>
        </div>
      )}

      {/* Question Header & Controls */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start flex-1 min-w-0">
          <span className="font-semibold text-brand-text-primary mr-1.5 flex-shrink-0">
            {questionNumber(index)}.
          </span>
          <div className="text-brand-text-primary flex-1">
            <KaTeXText text={cleanQuestionText(question.question)} />
          </div>
        </div>

        {/* Action Buttons (visible cleanly on hover/focus, hidden when printing) */}
        <div className="flex items-center gap-1 opacity-90 group-hover:opacity-100 transition-opacity flex-shrink-0 print:hidden">
          <span className="text-[11px] font-semibold text-brand-text-secondary bg-brand-bg px-1.5 py-0.5 rounded border border-brand-border mr-0.5 tabular-nums">
            {question.marks}M
          </span>

          <button
            type="button"
            disabled={isRegenerating}
            onClick={() => handleRegenerate('')}
            title="Regenerate this question"
            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50/80 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 border border-emerald-200 dark:border-emerald-800/60 rounded-md transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Regenerate</span>
          </button>

          <button
            type="button"
            onClick={() => setShowRegenPrompt((prev) => !prev)}
            title="Regenerate with custom instruction"
            className="p-1 text-xs text-brand-text-secondary hover:text-emerald-600 hover:bg-brand-bg rounded cursor-pointer"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => setIsEditing(true)}
            title="Edit question text and marks"
            className="p-1 text-xs text-brand-text-secondary hover:text-brand-primary hover:bg-brand-bg rounded cursor-pointer"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={onDeleteQuestion}
            title="Remove question from section"
            className="p-1 text-xs text-brand-text-secondary hover:text-rose-600 hover:bg-brand-bg rounded cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Custom Instruction Regeneration Popover */}
      {showRegenPrompt && (
        <div className="mt-2.5 p-3 bg-brand-bg border border-brand-border rounded-lg shadow-sm space-y-2 print:hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-brand-text-primary">
              Regenerate {questionNumber(index)} with Note
            </span>
            <button
              type="button"
              onClick={() => setShowRegenPrompt(false)}
              className="text-xs text-brand-text-secondary hover:text-brand-text-primary cursor-pointer"
            >
              ✕
            </button>
          </div>
          <input
            type="text"
            placeholder="Optional note: e.g. Make it a numerical problem, test conceptual understanding..."
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            className="w-full px-2.5 py-1.5 text-xs rounded border border-brand-border bg-brand-surface text-brand-text-primary"
            onKeyDown={(e) => {
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
              className="px-2.5 py-1 text-xs text-brand-text-secondary hover:bg-brand-surface rounded border border-brand-border cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => handleRegenerate()}
              className="px-3 py-1 text-xs font-medium rounded bg-emerald-600 text-white hover:bg-emerald-700 cursor-pointer"
            >
              Apply &amp; Regenerate
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
      {hasOptions(question) && (() => {
        const rawOptions = question.options || [];
        const stacked = shouldStackOptions(rawOptions);
        const rows = layoutOptions(rawOptions);
        return (
          <div
            className={`mt-1.5 pl-[0.35in] print:mt-1 ${
              stacked ? 'space-y-1.5 print:space-y-[2.8pt]' : 'space-y-1 print:space-y-[1.5pt]'
            }`}
          >
            {rows.map((row, rIdx) =>
              !stacked && row.options.length === 2 ? (
                <div
                  key={rIdx}
                  className="grid grid-cols-1 sm:grid-cols-[3.3in_1fr] print:grid-cols-[3.3in_1fr] gap-y-1 gap-x-0 items-start"
                >
                  {row.options.map((o) => (
                    <div key={o.index} className="flex items-start min-w-0 pr-2">
                      <span className="text-brand-text-secondary mr-1.5 whitespace-nowrap text-xs print:text-[9pt] shrink-0">
                        {OPTION_CIRCLE} {optionLetter(o.index)})
                      </span>
                      <KaTeXText
                        text={cleanOptionText(o.text)}
                        className="text-brand-text-secondary text-xs print:text-[9pt] leading-snug"
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div key={rIdx} className="flex items-start min-w-0">
                  <span className="text-brand-text-secondary mr-1.5 whitespace-nowrap text-xs print:text-[9pt] shrink-0">
                    {OPTION_CIRCLE} {optionLetter(row.options[0].index)})
                  </span>
                  <div className="flex-1 min-w-0">
                    <KaTeXText
                      text={cleanOptionText(row.options[0].text)}
                      className="text-brand-text-secondary text-xs print:text-[9pt] leading-snug"
                    />
                  </div>
                </div>
              )
            )}
          </div>
        );
      })()}
    </div>
  );
};

export default QuestionEditor;

import React, { useState } from 'react';
import { RefreshIcon, CheckCircleIcon } from '../icons/MiscIcons';
import Spinner from '../ui/Spinner';

export interface PaperRevisionModalProps {
  showRevision: boolean;
  setShowRevision: (show: boolean) => void;
  revisionPrompt: string;
  setRevisionPrompt: (prompt: string) => void;
  onRevisePaper: (prompt: string) => Promise<any>;
  isRevising: boolean;
}

export const PaperRevisionModal: React.FC<PaperRevisionModalProps> = ({
  showRevision,
  setShowRevision,
  revisionPrompt,
  setRevisionPrompt,
  onRevisePaper,
  isRevising,
}) => {
  if (!showRevision) {
    return (
      <div className="flex-shrink-0 border-t border-brand-border bg-brand-surface/95 dark:bg-brand-surface backdrop-blur-xl px-4 py-3 z-20 shadow-[0_-4px_20px_rgba(0,0,0,0.06)] dark:shadow-[0_-4px_20px_rgba(0,0,0,0.3)]">
        <div className="max-w-3xl mx-auto">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            <button
              onClick={() => setShowRevision(true)}
              className="flex-1 flex items-center gap-3 px-4 py-2.5 bg-brand-bg hover:bg-brand-bg/80 border border-brand-border rounded-xl text-left transition-all duration-200 group active:scale-[0.99] cursor-pointer"
            >
              <div className="w-7 h-7 rounded-lg brand-gradient flex items-center justify-center text-white flex-shrink-0 shadow-soft">
                <RefreshIcon className="w-3.5 h-3.5" />
              </div>
              <span className="text-xs sm:text-sm text-brand-text-secondary group-hover:text-brand-text-primary transition-colors truncate">
                Revise paper (add MCQs, change marks, regenerate a section)...
              </span>
              <span className="hidden sm:inline-flex text-[11px] font-semibold text-brand-primary bg-brand-primary/10 px-2.5 py-1 rounded-lg ml-auto border border-brand-primary/20">
                Revise
              </span>
            </button>

            <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar py-0.5 sm:py-0">
              <button
                type="button"
                onClick={() => { setRevisionPrompt('Add 5 more MCQs to Section A'); setShowRevision(true); }}
                className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-brand-bg border border-brand-border text-brand-text-secondary hover:text-brand-primary hover:border-brand-primary/40 whitespace-nowrap transition-all cursor-pointer"
              >
                + 5 MCQs
              </button>
              <button
                type="button"
                onClick={() => { setRevisionPrompt('Add 2 more short questions with optional choices'); setShowRevision(true); }}
                className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-brand-bg border border-brand-border text-brand-text-secondary hover:text-brand-primary hover:border-brand-primary/40 whitespace-nowrap transition-all cursor-pointer"
              >
                + 2 Short Qs
              </button>
              <button
                type="button"
                onClick={() => { setRevisionPrompt('Make the questions slightly more challenging and conceptually oriented'); setShowRevision(true); }}
                className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-brand-bg border border-brand-border text-brand-text-secondary hover:text-brand-primary hover:border-brand-primary/40 whitespace-nowrap transition-all hidden md:inline-block cursor-pointer"
              >
                Higher Rigor
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-shrink-0 border-t border-brand-border bg-brand-surface/95 dark:bg-brand-surface backdrop-blur-xl px-4 py-3 z-20 shadow-[0_-4px_20px_rgba(0,0,0,0.06)] dark:shadow-[0_-4px_20px_rgba(0,0,0,0.3)]">
      <div className="max-w-3xl mx-auto">
        <div className="glass-card rounded-2xl border border-brand-primary/30 shadow-card overflow-hidden transition-all animate-scaleIn">
          <div className="px-4 pt-3 pb-2">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-brand-primary animate-pulse" />
                <span className="text-xs font-bold text-brand-primary uppercase tracking-wider">
                  Paper Revision
                </span>
              </div>
              <button
                onClick={() => { setShowRevision(false); setRevisionPrompt(''); }}
                aria-label="Close revision"
                className="p-1 rounded-lg min-w-[36px] min-h-[36px] flex items-center justify-center text-brand-text-secondary hover:text-brand-text-primary hover:bg-brand-bg transition-colors active:scale-90 active:bg-brand-bg cursor-pointer"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <textarea
              value={revisionPrompt}
              onChange={e => setRevisionPrompt(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (revisionPrompt.trim() && !isRevising) {
                    onRevisePaper(revisionPrompt).then(result => {
                      if (result) { setRevisionPrompt(''); setShowRevision(false); }
                    });
                  }
                }
              }}
              placeholder="Describe what to change (e.g. 'Add 5 MCQs about vectors, replace question 3 with a numerical problem, rebalance total marks to 50')..."
              className="w-full h-18 px-3 py-2 bg-brand-bg border border-brand-border rounded-xl text-sm text-brand-text-primary placeholder:text-brand-text-secondary/60 focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary resize-none transition-all"
              disabled={isRevising}
              autoFocus
            />
          </div>

          <div className="flex items-center justify-between px-4 py-2.5 border-t border-brand-border bg-brand-bg/60">
            <p className="text-[10px] text-brand-text-secondary">
              Press <kbd className="px-1 py-0.5 bg-brand-surface rounded border border-brand-border font-mono text-[9px]">Enter</kbd> to revise, <kbd className="px-1 py-0.5 bg-brand-surface rounded border border-brand-border font-mono text-[9px]">Shift+Enter</kbd> for new line
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => { setShowRevision(false); setRevisionPrompt(''); }}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-brand-text-secondary hover:bg-brand-surface transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!revisionPrompt.trim() || isRevising) return;
                  const result = await onRevisePaper(revisionPrompt);
                  if (result) { setRevisionPrompt(''); setShowRevision(false); }
                }}
                disabled={isRevising || !revisionPrompt.trim()}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl brand-gradient text-white text-xs font-semibold hover:shadow-glass disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 active:scale-95 cursor-pointer"
              >
                {isRevising ? (
                  <>
                    <Spinner className="w-3.5 h-3.5" />
                    <span>Revising Paper...</span>
                  </>
                ) : (
                  <>
                    <CheckCircleIcon className="w-3.5 h-3.5" />
                    <span>Apply Revision</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

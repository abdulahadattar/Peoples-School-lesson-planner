import React, { useRef, useEffect } from 'react';
import { CheckCircleIcon, CloseIcon, StopIcon } from './icons/MiscIcons';

interface GenerationStatusPanelProps {
  isLoading: boolean;
  isComplete: boolean;
  logMessages: string[];
  statusMessage?: string;
  generationProgress: { current: number; total: number } | null;
  onClose: () => void;
  onStop: () => void;
  onViewResults: () => void;
  error?: string | null;
}

const paperSteps = ['Preparing', 'Generating', 'Formatting'];
const lessonSteps = ['Preparing', 'Generating', 'Exporting'];

const GenerationStatusPanel: React.FC<GenerationStatusPanelProps> = ({
  isLoading,
  isComplete,
  logMessages,
  statusMessage,
  generationProgress,
  onClose,
  onStop,
  onViewResults,
  error,
}) => {
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logMessages]);

  // Paper generation reports exactly 3 steps; lesson generation reports 1+ SLOs.
  const steps = generationProgress?.total === 3 ? paperSteps : lessonSteps;
  const progressPct = generationProgress && generationProgress.total > 0
    ? Math.round((generationProgress.current / generationProgress.total) * 100)
    : 0;

  // Which step is active: 0 = preparing, middle = generating, last = finalizing.
  let activeStep = 0;
  if (isLoading && generationProgress) {
    activeStep = generationProgress.current >= generationProgress.total ? steps.length - 1 : 1;
  } else if (isComplete) {
    activeStep = steps.length;
  }

  const logColor = (msg: string): string => {
    if (msg.startsWith('ERROR')) return 'text-red-400';
    if (msg.startsWith('WARN')) return 'text-amber-400';
    if (msg.includes('✓') || msg.startsWith('Successfully')) return 'text-green-500';
    return '';
  };

  return (
    <div className="fixed bottom-6 right-6 w-[400px] max-w-[90vw] glass-card rounded-2xl overflow-hidden z-50 flex flex-col animate-slideUp shadow-glass">
      {/* Header */}
      <div className="flex justify-between items-center p-4 border-b border-brand-border bg-brand-surface/60">
        <div className="flex items-center gap-3 min-w-0">
          {isLoading ? (
            <div className="relative w-3 h-3 flex-shrink-0">
              <div className="absolute inset-0 rounded-full bg-brand-primary animate-ping opacity-75" />
              <div className="absolute inset-0 rounded-full bg-brand-primary" />
            </div>
          ) : error ? (
            <div className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center flex-shrink-0 animate-scaleIn">
              <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
          ) : (
            <CheckCircleIcon className="w-5 h-5 text-green-500 flex-shrink-0 animate-scaleIn" />
          )}
          <div className="min-w-0">
            <h2 className="font-bold text-brand-text-primary text-sm">
              {error ? 'Generation Failed' : isComplete ? 'Generation Complete' : 'Generating...'}
            </h2>
            {isLoading && statusMessage && (
              <p className="text-xs text-brand-text-secondary truncate">{statusMessage}</p>
            )}
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Close status panel"
          className="p-1.5 text-brand-text-secondary hover:text-brand-text-primary rounded-full hover:bg-brand-bg transition-all duration-200 active:scale-90"
        >
          <CloseIcon className="w-5 h-5" />
        </button>
      </div>

      <div className="p-4 max-h-[340px] flex flex-col gap-3">
        {/* Stepper */}
        <div className="flex items-center gap-1">
          {steps.map((step, i) => {
            const isDone = i < activeStep;
            const isActive = i === activeStep;
            return (
              <React.Fragment key={step}>
                <div className="flex items-center gap-1.5 flex-1">
                  <span
                    className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold transition-all duration-300 flex-shrink-0 ${
                      isDone
                        ? 'bg-green-500 text-white'
                        : isActive
                        ? 'brand-gradient text-white shadow-card-hover'
                        : 'bg-brand-bg border border-brand-border text-brand-text-tertiary'
                    }`}
                  >
                    {isDone ? '✓' : i + 1}
                  </span>
                  <span
                    className={`text-[10px] font-semibold truncate transition-colors duration-300 ${
                      isActive ? 'text-brand-primary' : isDone ? 'text-brand-text-secondary' : 'text-brand-text-tertiary'
                    }`}
                  >
                    {step}
                  </span>
                </div>
                {i < steps.length - 1 && (
                  <div className={`h-px flex-1 transition-colors duration-500 ${isDone ? 'bg-green-500/60' : 'bg-brand-border'}`} />
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* Progress bar */}
        {isLoading && generationProgress && (
          <div className="w-full">
            <div className="flex justify-between text-xs text-brand-text-secondary mb-1.5">
              <span>Progress</span>
              <span className="font-mono">
                {generationProgress.current} / {generationProgress.total} · {progressPct}%
              </span>
            </div>
            <div className="w-full bg-brand-bg rounded-full h-2 overflow-hidden border border-brand-border/50">
              <div
                className={`h-full rounded-full transition-all duration-300 ease-out ${progressPct < 100 ? 'brand-gradient progress-stripes' : 'bg-green-500'}`}
                style={{ width: `${Math.max(4, progressPct)}%` }}
              />
            </div>
          </div>
        )}

        {/* Log console */}
        <div className="flex-grow overflow-y-auto custom-scrollbar bg-brand-bg/60 border border-brand-border/50 p-3 rounded-lg h-[130px] text-xs font-mono text-brand-text-secondary">
          {logMessages.length === 0 ? (
            <p className="text-brand-text-tertiary italic">Waiting for updates...</p>
          ) : (
            logMessages.map((msg, index) => (
              <div key={index} className="mb-1 last:mb-0 break-words">
                <span className="text-brand-text-tertiary mr-2 opacity-50">&gt;</span>
                <span className={logColor(msg)}>{msg}</span>
              </div>
            ))
          )}
          <div ref={logsEndRef} />
        </div>

        {/* Actions */}
        <div className="flex gap-2 mt-1">
          {isLoading && (
            <button
              onClick={onStop}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 rounded-xl text-sm font-semibold transition-all duration-200 active:scale-[0.98]"
            >
              <StopIcon className="w-4 h-4" />
              Cancel
            </button>
          )}
          {isComplete && (
            <button
              onClick={onViewResults}
              className="flex-1 brand-gradient text-white font-bold py-2.5 rounded-xl hover:shadow-glass hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 text-sm"
            >
              View Results
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default GenerationStatusPanel;
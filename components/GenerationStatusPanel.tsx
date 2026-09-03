
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

const GenerationStatusPanel: React.FC<GenerationStatusPanelProps> = ({ isLoading, isComplete, logMessages, statusMessage, generationProgress, onClose, onStop, onViewResults, error }) => {
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logMessages]);
  
  return (
    <div className="fixed bottom-6 right-6 w-[400px] max-w-[90vw] bg-brand-surface border border-brand-border rounded-2xl overflow-hidden z-50 flex flex-col animate-slideUp shadow-2xl">
        <div className="flex justify-between items-center p-4 border-b border-brand-border">
        <div className="flex items-center gap-3">
            {isLoading ? (
                <div className="relative w-3 h-3">
                     <div className="absolute inset-0 rounded-full bg-brand-primary animate-ping opacity-75"></div>
                     <div className="absolute inset-0 rounded-full bg-brand-primary"></div>
                </div>
            ) : error ? (
                <div className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center">
                  <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </div>
            ) : (
                <CheckCircleIcon className="w-5 h-5 text-green-500" />
            )}
            <h2 className="font-bold text-brand-text-primary text-sm">
                {error ? 'Generation Failed' : isComplete ? 'Generation Complete' : 'Generating...'}
            </h2>
            {isLoading && statusMessage && (
                <span className="text-xs text-brand-text-secondary">
                    {statusMessage}
                </span>
            )}
        </div>
        <div className="flex items-center gap-2">
           <button onClick={onClose} className="p-1 text-brand-text-secondary hover:text-brand-text-primary rounded-full hover:bg-brand-bg transition-colors">
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="p-4 max-h-[300px] flex flex-col gap-3">
        {isLoading && generationProgress && (
          <div className="w-full">
            <div className="flex justify-between text-xs text-brand-text-secondary mb-1.5">
                 <span>Progress</span>
                 <span className="font-mono">{generationProgress.current} / {generationProgress.total}</span>
            </div>
            <div className="w-full bg-brand-bg rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-brand-primary h-1.5 rounded-full transition-all duration-300 ease-out"
                style={{ width: `${(generationProgress.current / generationProgress.total) * 100}%` }}
              >
              </div>
            </div>
          </div>
        )}

        <div className="flex-grow overflow-y-auto custom-scrollbar bg-brand-bg/50 border border-brand-border/50 p-3 rounded-lg h-[150px] text-xs font-mono text-brand-text-secondary">
          {logMessages.map((msg, index) => (
            <div key={index} className="mb-1 last:mb-0">
              <span className="text-brand-text-tertiary mr-2 opacity-50">{`>`}</span>
              <span className={msg.startsWith('ERROR') ? 'text-red-400' : msg.startsWith('Successfully') ? 'text-green-500' : ''}>
                {msg}
              </span>
            </div>
          ))}
          <div ref={logsEndRef} />
        </div>

        <div className="flex gap-2 mt-1">
            {isLoading && (
                 <button 
                    onClick={onStop} 
                     className="flex-1 flex items-center justify-center gap-2 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 rounded-xl text-sm font-semibold transition-colors"
                >
                    <StopIcon className="w-4 h-4" />
                    Cancel
                </button>
            )}
            {isComplete && (
                <button
                    onClick={onViewResults}
                    className="flex-1 bg-brand-primary text-white font-bold py-2 rounded-xl hover:bg-brand-primary-hover transition-all text-sm"
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

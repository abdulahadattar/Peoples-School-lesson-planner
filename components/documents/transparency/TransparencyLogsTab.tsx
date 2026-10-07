import React from 'react';
import { Copy, Terminal, Check } from 'lucide-react';
import { JobLogEntry } from '../../../types/documentArchive';

export interface TransparencyLogsTabProps {
  logs: JobLogEntry[];
  logFilter: 'ALL' | 'ERROR' | 'AI_VISION' | 'PDF_EXTRACT';
  setLogFilter: (filter: 'ALL' | 'ERROR' | 'AI_VISION' | 'PDF_EXTRACT') => void;
  copiedLogs: boolean;
  onCopyLogs: () => void;
}

export const TransparencyLogsTab: React.FC<TransparencyLogsTabProps> = ({
  logs,
  logFilter,
  setLogFilter,
  copiedLogs,
  onCopyLogs,
}) => {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-1.5">
          {(['ALL', 'AI_VISION', 'PDF_EXTRACT', 'ERROR'] as const).map((filter) => (
            <button
              key={filter}
              type="button"
              onClick={() => setLogFilter(filter)}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                logFilter === filter
                  ? 'bg-brand-primary text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
              }`}
            >
              {filter === 'ALL' ? 'All Logs' : filter.replace('_', ' ')}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={onCopyLogs}
          className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          {copiedLogs ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
          <span>{copiedLogs ? 'Copied' : 'Copy Logs'}</span>
        </button>
      </div>

      <div className="bg-slate-950 text-slate-200 rounded-xl p-4 font-mono text-[11px] leading-relaxed max-h-[420px] overflow-y-auto custom-scrollbar border border-slate-800 space-y-2">
        {logs.length === 0 ? (
          <div className="text-slate-500 py-6 text-center">No log entries available for this view.</div>
        ) : (
          logs.map((log) => {
            const isError = log.level === 'error' || log.stage === 'ERROR';
            const isSuccess = log.level === 'success';
            const isWarn = log.level === 'warn';

            return (
              <div key={log.id} className="flex items-start gap-2 border-b border-slate-900 pb-1.5 last:border-0">
                <span className="text-slate-500 shrink-0 text-[10px]">
                  {log.timestamp.slice(11, 19)}
                </span>
                <span
                  className={`px-1.5 py-0.2 rounded text-[9px] font-bold uppercase shrink-0 ${
                    isError
                      ? 'bg-rose-950 text-rose-300 border border-rose-800'
                      : isSuccess
                      ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                      : isWarn
                      ? 'bg-amber-950 text-amber-300 border border-amber-800'
                      : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  {log.stage}
                </span>
                <div className="min-w-0 flex-1">
                  <span className={isError ? 'text-rose-300' : isSuccess ? 'text-emerald-300' : 'text-slate-200'}>
                    {log.message}
                  </span>
                  {log.details && (
                    <div className="text-[10px] text-slate-400 mt-0.5 bg-slate-900 p-1.5 rounded break-all">
                      {log.details}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

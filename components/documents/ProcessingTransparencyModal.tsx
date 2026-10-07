import React, { useState, useEffect } from 'react';
import {
  BatchProcessingJob,
  JobLogEntry,
  JobFileItem,
} from '../../types/documentArchive';
import {
  fetchJobStatus,
  retryFailedDocuments,
} from '../../services/documentClientService';
import { copyToClipboard } from '../../utils/clipboard';
import {
  Activity,
  X,
  FileText,
  Terminal,
  Cpu,
  RefreshCw,
  StopCircle,
} from 'lucide-react';
import { TransparencyFilesTab } from './transparency/TransparencyFilesTab';
import { TransparencyLogsTab } from './transparency/TransparencyLogsTab';
import { TransparencyPipelineTab } from './transparency/TransparencyPipelineTab';

export interface ProcessingTransparencyModalProps {
  jobId: string;
  isOpen: boolean;
  onClose: () => void;
  onJobUpdated?: (job: BatchProcessingJob) => void;
}

export const ProcessingTransparencyModal: React.FC<ProcessingTransparencyModalProps> = ({
  jobId,
  isOpen,
  onClose,
  onJobUpdated,
}) => {
  const [job, setJob] = useState<BatchProcessingJob | null>(null);
  const [activeTab, setActiveTab] = useState<'files' | 'logs' | 'pipeline'>('files');
  const [logFilter, setLogFilter] = useState<'ALL' | 'ERROR' | 'AI_VISION' | 'PDF_EXTRACT'>('ALL');
  const [fileFilter, setFileFilter] = useState<'ALL' | 'SUCCESS' | 'FAILED' | 'FLAGGED'>('ALL');
  const [expandedFileId, setExpandedFileId] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [copiedLogs, setCopiedLogs] = useState(false);

  const loadJob = async () => {
    if (!jobId) return;
    try {
      const updated = await fetchJobStatus(jobId);
      if (updated) {
        setJob(updated);
        if (onJobUpdated) onJobUpdated(updated);
      }
    } catch {}
  };

  useEffect(() => {
    if (!isOpen || !jobId) return;
    loadJob();
    const interval = setInterval(loadJob, 2000);
    return () => clearInterval(interval);
  }, [isOpen, jobId]);

  if (!isOpen) return null;

  const logs: JobLogEntry[] = job?.logs || [];
  const files: JobFileItem[] = job?.files || [];

  const filteredLogs = logs.filter((l) => {
    if (logFilter === 'ALL') return true;
    if (logFilter === 'ERROR') return l.level === 'error' || l.stage === 'ERROR';
    if (logFilter === 'AI_VISION') return l.stage === 'AI_VISION';
    if (logFilter === 'PDF_EXTRACT') return l.stage === 'PDF_EXTRACT';
    return true;
  });

  const filteredFiles = files.filter((f) => {
    if (fileFilter === 'ALL') return true;
    if (fileFilter === 'SUCCESS') return f.status === 'success';
    if (fileFilter === 'FAILED') return f.status === 'failed';
    if (fileFilter === 'FLAGGED') return f.classification === 'OTHER_UNCLASSIFIED';
    return true;
  });

  const handleRetry = async () => {
    if (!jobId) return;
    try {
      setIsRetrying(true);
      const updated = await retryFailedDocuments(jobId);
      if (updated) {
        setJob(updated);
        if (onJobUpdated) onJobUpdated(updated);
      }
    } finally {
      setIsRetrying(false);
    }
  };

  const handleStopJob = async () => {
    if (!jobId) return;
    try {
      await fetch(`/api/documents/job/${encodeURIComponent(jobId)}/stop`, { method: 'POST' });
      await loadJob();
    } catch {}
  };

  const handleCopyLogs = async () => {
    const rawText = logs
      .map((l) => `[${l.timestamp}] [${l.level.toUpperCase()}] [${l.stage}] ${l.filename ? `[${l.filename}] ` : ''}${l.message}${l.details ? `\nDetails: ${l.details}` : ''}`)
      .join('\n');
    await copyToClipboard(rawText);
    setCopiedLogs(true);
    setTimeout(() => setCopiedLogs(false), 2500);
  };

  const completionPercent = job?.totalFiles ? Math.round((job.processedFiles / job.totalFiles) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
      <div className="bg-white dark:bg-brand-surface border border-brand-border rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 border-b border-brand-border flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-brand-primary/10 text-brand-primary">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-brand-text-primary flex items-center gap-2">
                Document Processing Transparency
                <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                  #{jobId}
                </span>
              </h3>
              <p className="text-[11px] text-brand-text-secondary">
                Real-time AI pipeline execution, telemetry, and batch tracking
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Progress Strip */}
        <div className="p-4 border-b border-brand-border bg-white dark:bg-brand-surface space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-brand-text-primary">
              {job?.currentStageDescription || 'Processing documents...'}
            </span>
            <span className="font-mono font-bold text-brand-primary">
              {job?.processedFiles || 0} / {job?.totalFiles || 0} ({completionPercent}%)
            </span>
          </div>
          <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div className="h-full bg-brand-primary transition-all duration-300 rounded-full" style={{ width: `${completionPercent}%` }} />
          </div>
        </div>

        {/* Tab Controls */}
        <div className="flex border-b border-brand-border bg-slate-50 dark:bg-slate-900/50 px-4">
          <button
            type="button"
            onClick={() => setActiveTab('files')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'files' ? 'border-brand-primary text-brand-primary' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <FileText className="w-3.5 h-3.5" /> Files ({files.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('logs')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'logs' ? 'border-brand-primary text-brand-primary' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" /> Terminal Logs ({logs.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('pipeline')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'pipeline' ? 'border-brand-primary text-brand-primary' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" /> Pipeline Architecture
          </button>
        </div>

        {/* Tab Body */}
        <div className="p-4 overflow-y-auto flex-1 bg-slate-50/30 dark:bg-slate-950/20">
          {activeTab === 'files' && (
            <TransparencyFilesTab
              files={filteredFiles}
              fileFilter={fileFilter}
              setFileFilter={setFileFilter}
              expandedFileId={expandedFileId}
              setExpandedFileId={setExpandedFileId}
            />
          )}
          {activeTab === 'logs' && (
            <TransparencyLogsTab
              logs={filteredLogs}
              logFilter={logFilter}
              setLogFilter={setLogFilter}
              copiedLogs={copiedLogs}
              onCopyLogs={handleCopyLogs}
            />
          )}
          {activeTab === 'pipeline' && <TransparencyPipelineTab />}
        </div>

        {/* Footer Actions */}
        <div className="p-3 px-4 border-t border-brand-border bg-slate-50 dark:bg-slate-900/50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {job?.status === 'processing' && (
              <button
                type="button"
                onClick={handleStopJob}
                className="px-3 py-1.5 rounded-lg text-xs font-bold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <StopCircle className="w-3.5 h-3.5" /> Stop Processing
              </button>
            )}
            {(job?.failedCount || 0) > 0 && (
              <button
                type="button"
                onClick={handleRetry}
                disabled={isRetrying}
                className="px-3 py-1.5 rounded-lg text-xs font-bold text-brand-primary hover:bg-brand-primary/10 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRetrying ? 'animate-spin' : ''}`} /> Retry Failed ({job?.failedCount})
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

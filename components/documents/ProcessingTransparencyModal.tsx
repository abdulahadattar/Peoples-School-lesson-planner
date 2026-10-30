import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
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
import { adoptPollResponse, isTerminalJobStatus, recordPollMiss, shouldStartPollInterval } from '../../hooks/useDocumentArchive/selectors';
import {
  Activity,
  X,
  FileText,
  Terminal,
  Cpu,
  RefreshCw,
  StopCircle,
  CloudOff,
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

/** Status-poll feed rate (ms) for the transparency modal. */
const POLL_INTERVAL_MS = 2000;
/** Wording shown when the job record becomes unreachable (server rotation). */
const LOST_RECORD_MESSAGE =
  'Processing record unavailable — the job was completed but its record is no longer reachable from this server instance. Check Document Archive.';

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

  const jobRef = useRef<BatchProcessingJob | null>(null);
  const isTerminal = isTerminalJobStatus(job?.status);
  /** C5b: consecutive unreachable-poll accounting (404s + network errors). */
  const missesRef = useRef(0);
  const [isRecordLost, setIsRecordLost] = useState(false);

  /** C5b: a poll hit/bookkeeping miss — track consecutive misses honestly. */
  const recordMiss = () => {
    const next = recordPollMiss(missesRef.current);
    missesRef.current = next.misses;
    if (next.lost) setIsRecordLost(true);
  };

  const loadJob = async () => {
    if (!jobId) return;
    try {
      const updated = await fetchJobStatus(jobId);
      if (!updated) {
        // 404 "not found" (rotated instance without this job's /tmp store).
        recordMiss();
        return;
      }
      // Ignore out-of-order responses from overlapping polls. `startedAt` is
      // immutable per job, so it can never arbitrate freshness; instead only
      // apply updates whose progress (processedFiles) does not regress the
      // already-applied progress. Terminal states always apply so completion
      // or failure is never swallowed.
      // C5b additionally: only apply updates that belong to THIS job at all.
      const adopted = adoptPollResponse(jobRef.current, jobId, updated);
      if (!adopted || adopted === jobRef.current) return; // stale / other-job id
      const prev = jobRef.current;
      const prevTerminal = isTerminalJobStatus(prev?.status);
      const updatedTerminal = isTerminalJobStatus(updated.status);
      if (!prev || updatedTerminal || (!prevTerminal && updated.processedFiles >= prev.processedFiles)) {
        missesRef.current = 0;
        setIsRecordLost(false);
        jobRef.current = updated;
        setJob(updated);
        if (onJobUpdated) onJobUpdated(updated);
      }
    } catch {
      // network error — accounted as a miss so a dead record converges to an
      // honest "unavailable" state instead of an endless frozen 0/0.
      recordMiss();
    }
  };

  useEffect(() => {
    if (!isOpen || !jobId) return;
    jobRef.current = null;
    missesRef.current = 0;
    setIsRecordLost(false);
    loadJob();
  }, [isOpen, jobId]);

  useEffect(() => {
    // Poll while the record is reachable and not terminal; stop on terminal
    // (nothing left to learn) or on lost record (see MAX_JOB_POLL_MISSES).
    if (!isOpen || !jobId) return;
    if (!shouldStartPollInterval(job, isRecordLost)) return;
    const interval = setInterval(loadJob, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [isOpen, jobId, isTerminal, isRecordLost]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

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
    } catch {
      // keep the modal usable; next poll refreshes state
    } finally {
      setIsRetrying(false);
    }
  };

  const handleStopJob = async () => {
    if (!jobId) return;
    try {
      const res = await fetch(`/api/documents/jobs/${encodeURIComponent(jobId)}/stop`, { method: 'POST' });
      if (!res.ok) return;
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

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-label="Document Processing Transparency"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white dark:bg-brand-surface border border-brand-border rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] overscroll-contain">
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
                  #{jobId || (job as { jobId?: string } | null)?.jobId || job?.id || '—'}
                </span>
              </h3>
              <p className="text-[11px] text-brand-text-secondary">
                Real-time AI pipeline execution, telemetry, and batch tracking
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close telemetry modal" className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 transition-colors">
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Progress Strip */}
        <div className="p-4 border-b border-brand-border bg-white dark:bg-brand-surface space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-brand-text-primary">
              {job?.currentStageDescription || (isRecordLost ? 'Processing record unavailable' : 'Processing documents...')}
            </span>
            <span className="font-mono font-bold text-brand-primary">
              {job
                ? `${job?.processedFiles || 0} / ${job?.totalFiles || 0} (${completionPercent}%)`
                : (isRecordLost ? '—' : '0 / 0 (0%)')}
            </span>
          </div>
          <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full w-full bg-brand-primary rounded-full transition-transform duration-500 ease-out will-change-transform"
              style={{ transform: `scaleX(${completionPercent / 100})`, transformOrigin: 'left' }}
              role="progressbar"
              aria-valuenow={completionPercent}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>
        </div>

        {/* Lost-record banner (C5b): shown once the status poll is confirmed
            dead (consecutive misses >= MAX_JOB_POLL_MISSES in
            hooks/useDocumentArchive/selectors) — polling then stops. */}
        {isRecordLost && (
          <div className="px-4 pt-3" role="status" aria-live="polite">
            <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl border border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10 text-amber-800 dark:text-amber-200">
              <CloudOff className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
              <p className="text-[11px] leading-snug">{LOST_RECORD_MESSAGE}</p>
            </div>
          </div>
        )}

        {/* Tab Controls */}
        <div className="flex border-b border-brand-border bg-slate-50 dark:bg-slate-900/50 px-4">
          <button
            type="button"
            onClick={() => setActiveTab('files')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-[color,background-color,border-color] flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'files' ? 'border-brand-primary text-brand-primary' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <FileText className="w-3.5 h-3.5" /> Files ({files.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('logs')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-[color,background-color,border-color] flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'logs' ? 'border-brand-primary text-brand-primary' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" /> Terminal Logs ({logs.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('pipeline')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-[color,background-color,border-color] flex items-center gap-1.5 cursor-pointer ${
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
    </div>,
    document.body
  );
};

import React, { useState, useEffect } from 'react';
import {
  BatchProcessingJob,
  JobLogEntry,
  JobFileItem,
} from '../../types/documentArchive';
import {
  fetchJobStatus,
  retryFailedJob,
} from '../../services/documentClientService';
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  Cpu,
  Download,
  FileCheck,
  FileText,
  Filter,
  Layers,
  RefreshCw,
  ScanLine,
  StopCircle,
  Terminal,
  UploadCloud,
  X,
  Zap,
} from 'lucide-react';

interface ProcessingTransparencyModalProps {
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
  const [isLoading, setIsLoading] = useState(false);

  const loadJob = async () => {
    if (!jobId) return;
    try {
      const updated = await fetchJobStatus(jobId);
      setJob(updated);
      if (onJobUpdated) onJobUpdated(updated);
    } catch (err: any) {
      if (err.message !== 'Failed to fetch' && !err.message.includes('fetch')) {
        console.warn('[ProcessingTransparencyModal] Failed loading job:', err.message);
      }
    }
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
      const updated = await retryFailedJob(jobId);
      setJob(updated);
      if (onJobUpdated) onJobUpdated(updated);
    } catch (err: any) {
      console.warn('[ProcessingTransparencyModal] Retry failed:', err.message);
    } finally {
      setIsRetrying(false);
    }
  };

  const handleStopJob = async () => {
    if (!jobId) return;
    try {
      await fetch(`/api/documents/jobs/${jobId}/stop`, { method: 'POST' });
      await loadJob();
    } catch (err: any) {
      console.warn('[ProcessingTransparencyModal] Stop job error:', err.message);
    }
  };

  const handleCopyLogs = () => {
    const rawText = logs
      .map(
        (l) =>
          `[${l.timestamp}] [${l.level.toUpperCase()}] [${l.stage}] ${l.filename ? `[${l.filename}] ` : ''}${l.message}${
            l.details ? `\nDetails: ${l.details}` : ''
          }`
      )
      .join('\n');
    navigator.clipboard.writeText(rawText);
    setCopiedLogs(true);
    setTimeout(() => setCopiedLogs(false), 2500);
  };

  const completionPercent = job?.totalFiles
    ? Math.round((job.processedFiles / job.totalFiles) * 100)
    : 0;

  return (
    <div className="fixed inset-0 z-[100] flex items-start sm:items-center justify-center overflow-y-auto p-3 sm:p-5 bg-slate-900/70 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-5xl max-h-[92vh] flex flex-col bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between px-4 sm:px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 gap-4 sm:gap-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-primary/10 dark:bg-brand-primary/20 text-brand-primary flex items-center justify-center flex-shrink-0">
              <Activity className={`w-5 h-5 ${job?.status === 'processing' ? 'animate-pulse' : ''}`} />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-bold text-slate-900 dark:text-white truncate">
                  Document Pipeline Transparency & Debug Console
                </h3>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                    job?.status === 'processing'
                      ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 animate-pulse'
                      : job?.status === 'completed'
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                      : job?.status === 'failed'
                      ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                      : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                  }`}
                >
                  {job?.status || 'Unknown'}
                </span>
                <span className="font-mono text-xs text-slate-400">Job #{jobId}</span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                {job?.currentStageDescription || 'Sequential document extraction and NADRA verification'}
              </p>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2">
            {job?.status === 'processing' && (
              <button
                type="button"
                onClick={handleStopJob}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 dark:hover:bg-rose-900 border border-rose-200 dark:border-rose-900 transition-all shadow-xs"
                title="Stop active processing job"
              >
                <StopCircle className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                <span>Stop Process</span>
              </button>
            )}
            <button
              type="button"
              onClick={loadJob}
              disabled={isLoading}
              className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
              title="Refresh job state"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Top Summary Metrics & Progress Bar */}
        <div className="px-6 py-4 bg-slate-50/30 dark:bg-slate-900/30 border-b border-slate-100 dark:border-slate-800">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-3">
            <div className="p-3.5 rounded-xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 shadow-xs">
              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Scans</div>
              <div className="text-xl font-extrabold text-slate-900 dark:text-white mt-1">
                {job?.totalFiles || 0}
              </div>
            </div>
            <div className="p-3.5 rounded-xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 shadow-xs">
              <div className="text-[11px] font-bold text-emerald-600 uppercase tracking-wider">Processed</div>
              <div className="text-xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-1">
                {job?.processedFiles || 0}
              </div>
            </div>
            <div className="p-3.5 rounded-xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 shadow-xs">
              <div className="text-[11px] font-bold text-amber-600 uppercase tracking-wider">Flagged Mismatch</div>
              <div className="text-xl font-extrabold text-amber-600 dark:text-amber-400 mt-1">
                {job?.flaggedCount || 0}
              </div>
            </div>
            <div className="p-3.5 rounded-xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 shadow-xs">
              <div className="text-[11px] font-bold text-rose-600 uppercase tracking-wider">Failed Items</div>
              <div className="text-xl font-extrabold text-rose-600 dark:text-rose-400 mt-1">
                {job?.failedCount || 0}
              </div>
            </div>
            <div className="p-3.5 rounded-xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 shadow-xs col-span-2 sm:col-span-1">
              <div className="text-[11px] font-bold text-indigo-600 uppercase tracking-wider">Duplicates Skipped</div>
              <div className="text-xl font-extrabold text-indigo-600 dark:text-indigo-400 mt-1">
                {job?.duplicateCount || 0}
              </div>
            </div>
          </div>

          {/* Overall Progress bar */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-600 dark:text-slate-300 gap-4">
              <span className="flex items-center gap-1.5 min-w-0">
                <Zap className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                <span className="whitespace-nowrap flex-shrink-0">Processing Progress</span>
                {job?.currentFile && (
                  <span className="text-slate-400 font-normal truncate">
                    (Current: {job.currentFile})
                  </span>
                )}
              </span>
              <span className="font-mono text-brand-primary flex-shrink-0">{completionPercent}%</span>
            </div>
            <div className="w-full h-2.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-brand-primary to-emerald-500 transition-all duration-300"
                style={{ width: `${completionPercent}%` }}
              />
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center justify-between px-4 sm:px-6 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-x-auto custom-scrollbar">
          <div className="flex items-center gap-4 sm:gap-6 min-w-max">
            <button
              type="button"
              onClick={() => setActiveTab('files')}
              className={`py-3 text-xs font-bold border-b-2 flex items-center gap-2 transition-colors ${
                activeTab === 'files'
                  ? 'border-brand-primary text-brand-primary'
                  : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              <FileCheck className="w-4 h-4" />
              <span>Documents ({files.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('logs')}
              className={`py-3 text-xs font-bold border-b-2 flex items-center gap-2 transition-colors ${
                activeTab === 'logs'
                  ? 'border-brand-primary text-brand-primary'
                  : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              <Terminal className="w-4 h-4" />
              <span>Live Debug Logs ({logs.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('pipeline')}
              className={`py-3 text-xs font-bold border-b-2 flex items-center gap-2 transition-colors ${
                activeTab === 'pipeline'
                  ? 'border-brand-primary text-brand-primary'
                  : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              <Cpu className="w-4 h-4" />
              <span>Pipeline Architecture & Flow</span>
            </button>
          </div>

          <div className="flex items-center gap-2 py-2">
            {(job?.failedCount || 0) > 0 && (
              <button
                type="button"
                onClick={handleRetry}
                disabled={isRetrying}
                className="px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 transition-colors flex items-center gap-1.5 shadow-sm disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRetrying ? 'animate-spin' : ''}`} />
                <span>Retry Failed ({job?.failedCount})</span>
              </button>
            )}
            {activeTab === 'logs' && (
              <button
                type="button"
                onClick={handleCopyLogs}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors flex items-center gap-1.5"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>{copiedLogs ? 'Copied to Clipboard!' : 'Copy Raw Logs'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 space-y-4">
          {/* 1. DOCUMENTS TAB */}
          {activeTab === 'files' && (
            <div className="space-y-4">
              {/* Filter pills */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Filter className="w-3.5 h-3.5 text-slate-400" />
                  <span className="font-semibold text-slate-500">Filter:</span>
                  {(['ALL', 'SUCCESS', 'FAILED', 'FLAGGED'] as const).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => setFileFilter(mode)}
                      className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                        fileFilter === mode
                          ? 'bg-brand-primary text-white shadow-xs'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
                <span className="text-slate-400">
                  Showing {filteredFiles.length} of {files.length} document items
                </span>
              </div>

              {files.length === 0 ? (
                <div className="text-center py-12 text-slate-400 text-xs">
                  No individual file items recorded yet for this job.
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredFiles.map((file) => {
                    const isExpanded = expandedFileId === file.id;
                    return (
                      <div
                        key={file.id}
                        className={`rounded-xl border transition-all ${
                          file.status === 'failed'
                            ? 'border-rose-300 dark:border-rose-900 bg-rose-50/40 dark:bg-rose-950/20'
                            : file.status === 'duplicate'
                            ? 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50'
                            : file.status === 'success'
                            ? 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/30 dark:bg-emerald-950/10'
                            : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/40'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => setExpandedFileId(isExpanded ? null : file.id)}
                          aria-expanded={isExpanded}
                          className="w-full flex items-center justify-between p-3.5 text-left hover:bg-slate-50 active:bg-slate-100 dark:hover:bg-slate-800/60 dark:active:bg-slate-800 transition-colors"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            {file.status === 'success' ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                            ) : file.status === 'failed' ? (
                              <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                            ) : file.status === 'duplicate' ? (
                              <Layers className="w-4 h-4 text-indigo-500 flex-shrink-0" />
                            ) : (
                              <Clock className="w-4 h-4 text-amber-500 animate-spin flex-shrink-0" />
                            )}
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-semibold text-xs text-slate-900 dark:text-white truncate">
                                  {file.originalFilename}
                                </span>
                                <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 font-mono font-bold text-brand-primary">
                                  GR #{file.grNo}
                                </span>
                                {file.classification && (
                                  <span className="text-[10px] px-2 py-0.5 rounded-md bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-medium">
                                    {file.classification}
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-x-3 gap-y-1 mt-0.5">
                                <span>Size: {Math.round((file.fileSizeBytes || 0) / 1024)} KB</span>
                                {file.aiModelUsed && <span>Model: {file.aiModelUsed}</span>}
                                {file.executionTimeMs && <span>Latency: {file.executionTimeMs}ms</span>}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 flex-shrink-0">
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                                file.status === 'success'
                                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                                  : file.status === 'failed'
                                  ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                                  : file.status === 'duplicate'
                                  ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300'
                                  : 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 animate-pulse'
                              }`}
                            >
                              {file.status}
                            </span>
                            {isExpanded ? (
                              <ChevronUp className="w-4 h-4 text-slate-400" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-slate-400" />
                            )}
                          </div>
                        </button>

                        {/* Detailed Expanded Diagnostics */}
                        {isExpanded && (
                          <div className="px-4 pb-4 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs space-y-3 bg-slate-50/50 dark:bg-slate-900/40">
                            {file.error && (
                              <div className="p-2.5 rounded-lg bg-rose-100/60 dark:bg-rose-950/50 border border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-200">
                                <div className="font-bold text-[11px] uppercase tracking-wider mb-0.5">
                                  Failure Reason / Error Log
                                </div>
                                <p className="font-mono text-xs">{file.error}</p>
                              </div>
                            )}

                            {/* Image Thumbnail & Extracted Student Info */}
                            <div className="flex flex-col sm:flex-row items-start gap-3 bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                              {file.url && (
                                <div className="w-24 h-24 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-900 flex-shrink-0 flex items-center justify-center">
                                  <img
                                    src={file.url}
                                    alt={file.originalFilename}
                                    className="w-full h-full object-cover"
                                  />
                                </div>
                              )}

                              <div className="flex-1 min-w-0 space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-[11px] font-bold text-brand-primary uppercase tracking-wider flex items-center gap-1">
                                    <ScanLine className="w-3.5 h-3.5 text-amber-500" />
                                    Extracted Document Data
                                  </span>
                                  {file.url && (
                                    <a
                                      href={file.url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-[11px] text-brand-primary underline hover:no-underline font-medium"
                                    >
                                      View Full Scan ↗
                                    </a>
                                  )}
                                </div>

                                {file.extractedData ? (
                                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px]">
                                    <div className="p-1.5 rounded bg-slate-50 dark:bg-slate-900/60">
                                      <span className="text-[10px] text-slate-400 block">Student Name</span>
                                      <span className="font-semibold text-slate-800 dark:text-slate-100">
                                        {file.extractedData.studentName || 'Not detected'}
                                      </span>
                                    </div>
                                    <div className="p-1.5 rounded bg-slate-50 dark:bg-slate-900/60">
                                      <span className="text-[10px] text-slate-400 block">Father Name</span>
                                      <span className="font-semibold text-slate-800 dark:text-slate-100">
                                        {file.extractedData.fatherName || 'Not detected'}
                                      </span>
                                    </div>
                                    <div className="p-1.5 rounded bg-slate-50 dark:bg-slate-900/60">
                                      <span className="text-[10px] text-slate-400 block">13-digit B-Form</span>
                                      <span className="font-mono font-bold text-slate-800 dark:text-slate-100">
                                        {file.extractedData.bFormNo || 'N/A'}
                                      </span>
                                    </div>
                                    <div className="p-1.5 rounded bg-slate-50 dark:bg-slate-900/60">
                                      <span className="text-[10px] text-slate-400 block">Father CNIC</span>
                                      <span className="font-mono font-bold text-slate-800 dark:text-slate-100">
                                        {file.extractedData.fatherCnic || 'N/A'}
                                      </span>
                                    </div>
                                    <div className="p-1.5 rounded bg-slate-50 dark:bg-slate-900/60">
                                      <span className="text-[10px] text-slate-400 block">Date of Birth</span>
                                      <span className="font-medium text-slate-800 dark:text-slate-100">
                                        {file.extractedData.dob || 'N/A'}
                                      </span>
                                    </div>
                                    <div className="p-1.5 rounded bg-slate-50 dark:bg-slate-900/60">
                                      <span className="text-[10px] text-slate-400 block">Gender / Class</span>
                                      <span className="font-medium text-slate-800 dark:text-slate-100">
                                        {file.extractedData.gender || 'Unknown'} {file.extractedData.classAdmitted ? `(${file.extractedData.classAdmitted})` : ''}
                                      </span>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="text-[11px] text-slate-400 italic">
                                    No text or NADRA fields detected on this scan.
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                              <div className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                                <div className="text-slate-400">Orientation Rotation</div>
                                <div className="font-semibold text-slate-800 dark:text-slate-200">
                                  {file.rotationApplied || 0}° Clockwise
                                </div>
                              </div>
                              <div className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                                <div className="text-slate-400">Confidence Score</div>
                                <div className="font-semibold text-slate-800 dark:text-slate-200">
                                  {Math.round((file.classificationConfidence || 0.8) * 100)}%
                                </div>
                              </div>
                              <div className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                                <div className="text-slate-400">Fields Detected</div>
                                <div className="font-semibold text-slate-800 dark:text-slate-200">
                                  {file.extractedFieldsCount || 0} fields
                                </div>
                              </div>
                              <div className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                                <div className="text-slate-400">Saved Target Filename</div>
                                <div className="font-mono font-medium text-slate-800 dark:text-slate-200 truncate">
                                  {file.savedFilename || 'Pending...'}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* 2. LIVE DEBUG LOGS TAB */}
          {activeTab === 'logs' && (
            <div className="space-y-3">
              {/* Log filter buttons */}
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-slate-500">Filter Level:</span>
                  {(['ALL', 'ERROR', 'AI_VISION', 'PDF_EXTRACT'] as const).map((lvl) => (
                    <button
                      key={lvl}
                      onClick={() => setLogFilter(lvl)}
                      className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                        logFilter === lvl
                          ? 'bg-brand-primary text-white shadow-xs'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                      }`}
                    >
                      {lvl === 'AI_VISION' ? 'SCAN' : lvl === 'PDF_EXTRACT' ? 'PDF' : lvl}
                    </button>
                  ))}
                </div>
                <span className="text-slate-400 font-mono text-[11px]">
                  {filteredLogs.length} events logged
                </span>
              </div>

              {/* Terminal View */}
              <div className="rounded-xl bg-slate-950 text-slate-200 p-4 font-mono text-xs max-h-[50vh] overflow-y-auto space-y-2 border border-slate-800 shadow-inner">
                {filteredLogs.length === 0 ? (
                  <div className="text-slate-500 text-center py-8">
                    No log events recorded matching the selected filter.
                  </div>
                ) : (
                  filteredLogs.map((log) => (
                    <div
                      key={log.id}
                      className={`p-2 rounded-lg leading-relaxed border-l-2 ${
                        log.level === 'error'
                          ? 'bg-rose-950/40 border-rose-500 text-rose-300'
                          : log.level === 'warn'
                          ? 'bg-amber-950/30 border-amber-500 text-amber-300'
                          : log.level === 'success'
                          ? 'bg-emerald-950/30 border-emerald-500 text-emerald-300'
                          : 'bg-slate-900/50 border-slate-600 text-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-2 text-[10px] text-slate-400 mb-0.5">
                        <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
                        <span className="font-bold uppercase tracking-wider text-slate-300">
                          [{log.stage}]
                        </span>
                        {log.filename && <span className="text-indigo-300 truncate">[{log.filename}]</span>}
                        {log.grNo && <span className="text-emerald-300 font-bold">[GR#{log.grNo}]</span>}
                        {log.executionTimeMs && <span>({log.executionTimeMs}ms)</span>}
                      </div>
                      <div className="text-xs font-sans whitespace-pre-wrap">{log.message}</div>
                      {log.details && (
                        <div className="mt-1 text-[11px] text-slate-400 bg-slate-900 p-1.5 rounded font-mono break-all whitespace-pre-wrap">
                          {log.details}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* 3. PIPELINE ARCHITECTURE TAB */}
          {activeTab === 'pipeline' && (
            <div className="space-y-4 text-xs">
              <div className="p-4 rounded-xl bg-brand-primary/5 dark:bg-brand-primary/10 border border-brand-primary/20 space-y-2">
                <h4 className="font-bold text-sm text-brand-primary flex items-center gap-2">
                  <ScanLine className="w-4 h-4" />
                  <span>How Document Processing Works</span>
                </h4>
                <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                  Every uploaded file (images, ZIPs, or multi-page PDFs) passes through 5 stages before it is added to a student record:
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                <div className="p-4 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 space-y-2">
                  <div className="w-7 h-7 rounded-lg bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold">
                    1
                  </div>
                  <h5 className="font-bold text-slate-900 dark:text-white">Chunk Ingestion</h5>
                  <p className="text-slate-500 dark:text-slate-400 text-[11px] leading-relaxed">
                    Slices giant ZIPs and PDFs into safe 2.5MB binary streams, preventing reverse proxy 413 limits.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 space-y-2">
                  <div className="w-7 h-7 rounded-lg bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold">
                    2
                  </div>
                  <h5 className="font-bold text-slate-900 dark:text-white">PDF & Image Split</h5>
                  <p className="text-slate-500 dark:text-slate-400 text-[11px] leading-relaxed">
                    Extracts embedded PDF pages using Sharp/pdf-lib, strips noise, and creates high-res JPEGs.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 space-y-2">
                  <div className="w-7 h-7 rounded-lg bg-amber-100 dark:bg-amber-950 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold">
                    3
                  </div>
                  <h5 className="font-bold text-slate-900 dark:text-white">Scan Classification</h5>
                  <p className="text-slate-500 dark:text-slate-400 text-[11px] leading-relaxed">
                    Classifies document type (B-Form, CNIC, Photo), detects sideways/upside-down angles, and rotates upright.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 space-y-2">
                  <div className="w-7 h-7 rounded-lg bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
                    4
                  </div>
                  <h5 className="font-bold text-slate-900 dark:text-white">NADRA Parser</h5>
                  <p className="text-slate-500 dark:text-slate-400 text-[11px] leading-relaxed">
                    Formats 13-digit Pakistani civil numbers (XXXXX-XXXXXXX-X), Title-cases names, and extracts DOB.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 space-y-2">
                  <div className="w-7 h-7 rounded-lg bg-purple-100 dark:bg-purple-950 text-purple-600 dark:text-purple-400 flex items-center justify-center font-bold">
                    5
                  </div>
                  <h5 className="font-bold text-slate-900 dark:text-white">Dossier Linking</h5>
                  <p className="text-slate-500 dark:text-slate-400 text-[11px] leading-relaxed">
                    Merges documents into the student's GR dossier and audits mismatches against the Google Sheet.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-6 py-3.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex flex-col sm:flex-row sm:items-center justify-between text-xs gap-3 sm:gap-0">
          <div className="text-slate-500 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping flex-shrink-0" />
            <span className="truncate">Autonomous background processor running</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-2 rounded-xl font-bold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 hover:bg-slate-100 border border-slate-200 dark:border-slate-700 shadow-xs transition-all flex-shrink-0"
          >
            Close Transparency Monitor
          </button>
        </div>
      </div>
    </div>
  );
};

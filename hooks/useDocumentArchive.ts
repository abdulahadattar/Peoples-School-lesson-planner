import { useState, useEffect, useRef } from 'react';
import {
  StudentDossier,
  BatchProcessingJob,
  StudentDocumentRecord,
  DocumentDiscrepancy,
} from '../types/documentArchive';
import {
  fetchAllDossiers,
  fetchAllDocuments,
  fetchLatestJob,
  fetchJobStatus,
  autoLinkDocumentsWithSheet,
  assignDocumentToStudent,
  dismissDiscrepancyFlag,
  deleteDocument,
  deleteDocumentsBatch,
  rescanDocument,
  rescanAllDocuments,
  applyCorrectionToRecord,
  batchApplyCorrections,
  fetchDiscrepancyFlags,
} from '../services/documentClientService';
import { StudentRecord, fetchSheetData } from '../services/googleSheetsService';
import { DiscrepancyAuditItem } from '../components/documents/DiscrepancyAuditTable';
import { adoptLatestJob, adoptPollResponse } from './useDocumentArchive/selectors';

export function useDocumentArchive(showToast: (msg: string, type?: 'success' | 'error' | 'info') => void) {
  const [dossiers, setDossiers] = useState<StudentDossier[]>([]);
  const [documents, setDocuments] = useState<StudentDocumentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeJob, setActiveJob] = useState<BatchProcessingJob | null>(null);
  /**
   * C5b: mirror of activeJob for stale-closure-free reads. jobs-latest may
   * only ever SEED the active-job slot (see selectors.adoptLatestJob), so
   * refreshData must consult the freshest value instead of a stale closure.
   */
  const activeJobRef = useRef<BatchProcessingJob | null>(null);
  const [sheetRecords, setSheetRecords] = useState<StudentRecord[]>([]);
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [isOperatingDoc, setIsOperatingDoc] = useState(false);
  const [isAutoLinking, setIsAutoLinking] = useState(false);
  const [isRescanningAll, setIsRescanningAll] = useState(false);
  const [isBatchApplying, setIsBatchApplying] = useState(false);
  const [applyingFlagId, setApplyingFlagId] = useState<string | null>(null);

  /** Only path that actually writes the active job — keeps the ref in sync. */
  const applyActiveJob = (job: BatchProcessingJob | null) => {
    activeJobRef.current = job;
    setActiveJob(job);
  };

  const refreshData = async () => {
    try {
      setLoading(true);
      const [docsList, latestJob, sheetData] = await Promise.all([
        fetchAllDocuments().catch(() => []),
        fetchLatestJob().catch(() => null),
        fetchSheetData().catch(() => ({ records: [] })),
      ]);
      const records = sheetData?.records || [];
      setDocuments(docsList);
      // C5b: a rotated Vercel instance's jobs-latest can report a stale record
      // of an EARLIER dead attempt. While this view holds an active job (the
      // transparency modal is showing the user's upload) that record must
      // never overwrite it — jobs-latest may only seed when nothing is active.
      const adopted = adoptLatestJob(activeJobRef.current, latestJob);
      if (adopted !== activeJobRef.current) applyActiveJob(adopted);
      setSheetRecords(records);
      // Recompute discrepancy flags server-side whenever sheet data is
      // available, otherwise the audit tab only ever shows stale flags.
      let dossiersList = await fetchAllDossiers().catch(() => []);
      if (records.length > 0) {
        await fetchDiscrepancyFlags(records).catch(() => null);
        dossiersList = await fetchAllDossiers().catch(() => dossiersList);
      }
      setDossiers(dossiersList);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshData();
  }, []);

  useEffect(() => {
    if (!activeJob) return;
    if (activeJob.status !== 'processing' && activeJob.status !== 'uploading') return;
    // C5 guard: prefer the jobId alias, and never poll a falsy id — a job
    // without an id (stub-era payload) cannot be fetched at all.
    const paired = activeJob as BatchProcessingJob & { jobId?: string };
    const jobId = paired.jobId || activeJob.id;
    if (!jobId) return;
    const poll = setInterval(async () => {
      try {
        const job = await fetchJobStatus(String(jobId));
        // C5b: only adopt a response that belongs to THIS job — a mis-routed
        // record (schema drift rot) must never be displayed.
        const adopted = adoptPollResponse(activeJobRef.current, String(jobId), job);
        if (adopted && adopted !== activeJobRef.current) applyActiveJob(adopted);
      } catch {
        // transient network error — next tick retries
      }
    }, 4000);
    return () => clearInterval(poll);
  }, [activeJob?.id, activeJob?.status]);

  const terminalRefreshedJobsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!activeJob || (activeJob.status !== 'completed' && activeJob.status !== 'failed')) return;
    if (terminalRefreshedJobsRef.current.has(activeJob.id)) return;
    terminalRefreshedJobsRef.current.add(activeJob.id);
    refreshData();
  }, [activeJob?.id, activeJob?.status]);

  const handleToggleSelectDoc = (docId: string) => {
    setSelectedDocIds((prev) => (prev.includes(docId) ? prev.filter((id) => id !== docId) : [...prev, docId]));
  };

  const handleToggleSelectAll = (filteredList: StudentDocumentRecord[]) => {
    const filteredIds = filteredList.map((d) => d.id);
    const isAllSelected = filteredIds.length > 0 && filteredIds.every((id) => selectedDocIds.includes(id));
    setSelectedDocIds(isAllSelected ? [] : filteredIds);
  };

  const handleBatchDeleteDocs = async () => {
    if (selectedDocIds.length === 0) return;
    try {
      setIsOperatingDoc(true);
      const deletedCount = await deleteDocumentsBatch(selectedDocIds);
      if (deletedCount > 0) {
        showToast(`Deleted ${deletedCount} document scan${deletedCount === 1 ? '' : 's'}`, 'success');
        setSelectedDocIds([]);
      } else {
        showToast('No document scans were deleted', 'error');
      }
      await refreshData();
    } catch (err: any) {
      showToast(err?.message || 'Batch delete failed', 'error');
    } finally {
      setIsOperatingDoc(false);
    }
  };

  const handleDeleteDoc = async (doc: StudentDocumentRecord) => {
    try {
      setIsOperatingDoc(true);
      const ok = await deleteDocument(doc.id);
      if (ok) {
        showToast('Document scan deleted', 'success');
      } else {
        showToast('Delete failed on the server', 'error');
      }
      await refreshData();
    } catch (err: any) {
      showToast(err?.message || 'Delete failed', 'error');
    } finally {
      setIsOperatingDoc(false);
    }
  };

  const handleRescanDoc = async (docId: string) => {
    try {
      setIsOperatingDoc(true);
      await rescanDocument(docId);
      showToast('Document re-scanned with AI', 'success');
      await refreshData();
    } catch (err: any) {
      showToast(err?.message || 'Rescan failed', 'error');
    } finally {
      setIsOperatingDoc(false);
    }
  };

  const handleRescanAll = async () => {
    try {
      setIsRescanningAll(true);
      await rescanAllDocuments();
      showToast('All documents re-scanned with AI', 'success');
      await refreshData();
    } catch (err: any) {
      showToast(err?.message || 'Rescan All failed', 'error');
    } finally {
      setIsRescanningAll(false);
    }
  };

  const handleAutoLink = async () => {
    try {
      setIsAutoLinking(true);
      const res = await autoLinkDocumentsWithSheet(sheetRecords);
      showToast(`Auto-linked ${res.totalMatched} documents to student records`, 'success');
      await refreshData();
    } catch (err: any) {
      showToast(err?.message || 'Auto-link failed', 'error');
    } finally {
      setIsAutoLinking(false);
    }
  };

  const handleAssignDoc = async (docId: string, grNo: string) => {
    try {
      setIsOperatingDoc(true);
      const matchedStudent = sheetRecords.find((r) => String(r.grNo || r['G.R.NO'] || '').trim() === grNo.trim());
      await assignDocumentToStudent(docId, grNo.trim(), matchedStudent);
      showToast(`Document assigned to GR #${grNo}`, 'success');
      await refreshData();
    } catch (err: any) {
      showToast(err?.message || `Could not assign to GR #${grNo}`, 'error');
    } finally {
      setIsOperatingDoc(false);
    }
  };

  const handleApplyCorrection = async (grNo: string, flag: DocumentDiscrepancy) => {
    if (!flag.suggestedCorrection) return;
    try {
      setApplyingFlagId(flag.id);
      await applyCorrectionToRecord(grNo, flag.id, flag.suggestedCorrection);
      showToast(`Correction applied for GR #${grNo}`, 'success');
      await refreshData();
    } catch (err: any) {
      showToast(err?.message || 'Correction failed', 'error');
    } finally {
      setApplyingFlagId(null);
    }
  };

  const handleBatchApplyCorrections = async (items: DiscrepancyAuditItem[]) => {
    const list = items
      .filter((i) => i.flag.suggestedCorrection)
      .map((i) => ({ grNo: i.grNo, flagId: i.flag.id, ...i.flag.suggestedCorrection! }));
    try {
      setIsBatchApplying(true);
      await batchApplyCorrections(list);
      showToast(`Applied ${list.length} corrections to sheet records`, 'success');
      await refreshData();
    } catch (err: any) {
      showToast(err?.message || 'Batch apply failed', 'error');
    } finally {
      setIsBatchApplying(false);
    }
  };

  return {
    dossiers,
    documents,
    loading,
    activeJob,
    setActiveJob: applyActiveJob,
    sheetRecords,
    selectedDocIds,
    setSelectedDocIds,
    isOperatingDoc,
    isAutoLinking,
    isRescanningAll,
    isBatchApplying,
    applyingFlagId,
    refreshData,
    handleToggleSelectDoc,
    handleToggleSelectAll,
    handleBatchDeleteDocs,
    handleDeleteDoc,
    handleRescanDoc,
    handleRescanAll,
    handleAutoLink,
    handleAssignDoc,
    handleApplyCorrection,
    handleBatchApplyCorrections,
    dismissDiscrepancyFlag,
  };
}

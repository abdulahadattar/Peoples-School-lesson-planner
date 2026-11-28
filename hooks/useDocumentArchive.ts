import { useState, useEffect, useRef } from 'react';
import {
  StudentDossier,
  BatchProcessingJob,
  StudentDocumentRecord,
  DocumentDiscrepancy,
} from '../types/documentArchive';
import {
  fetchAllDossiers,
  fetchDocumentsSnapshot,
  peekCachedDossiers,
  peekCachedDocumentsSnapshot,
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
  resetDocumentArchiveForTesting,
} from '../services/documentClientService';
import { isUserAdmin } from '../services/adminService';
import { getCurrentUser } from '../services/googleAuth';
import { StudentRecord, fetchSheetData, peekCachedSheetData } from '../services/googleSheetsService';
import { DiscrepancyAuditItem } from '../components/documents/DiscrepancyAuditTable';
import { adoptLatestJob, adoptPollResponse } from './useDocumentArchive/selectors';
import { toUserErrorMessage } from '../utils/userMessage';

export function useDocumentArchive(showToast: (msg: string, type?: 'success' | 'error' | 'info') => void) {
  const initialDocs = peekCachedDocumentsSnapshot();
  const initialDossiers = peekCachedDossiers();
  const initialSheet = peekCachedSheetData();

  const [dossiers, setDossiers] = useState<StudentDossier[]>(() => initialDossiers || []);
  const [documents, setDocuments] = useState<StudentDocumentRecord[]>(() => initialDocs?.documents || []);
  const [aiConfigured, setAiConfigured] = useState<boolean>(() => initialDocs?.aiConfigured ?? true);
  const [loading, setLoading] = useState(() => !(initialDocs && initialDossiers && initialSheet));
  const [activeJob, setActiveJob] = useState<BatchProcessingJob | null>(null);
  const activeJobRef = useRef<BatchProcessingJob | null>(null);
  const [sheetRecords, setSheetRecords] = useState<StudentRecord[]>(() => initialSheet?.records || []);
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [isOperatingDoc, setIsOperatingDoc] = useState(false);
  const [isAutoLinking, setIsAutoLinking] = useState(false);
  const [isRescanningAll, setIsRescanningAll] = useState(false);
  const [isBatchApplying, setIsBatchApplying] = useState(false);
  const [applyingFlagId, setApplyingFlagId] = useState<string | null>(null);
  const [isResettingArchive, setIsResettingArchive] = useState(false);
  const isAdmin = isUserAdmin(getCurrentUser());

  const applyActiveJob = (job: BatchProcessingJob | null) => {
    activeJobRef.current = job;
    setActiveJob(job);
  };

  const refreshData = async (forceRefresh: boolean = false) => {
    const hasWarmState = Boolean(
      peekCachedDocumentsSnapshot() && peekCachedDossiers() && peekCachedSheetData()
    );
    try {
      if (!hasWarmState || forceRefresh) {
        setLoading((prev) => (hasWarmState ? prev : true));
      }
      const [docsSnapshot, latestJob, sheetData] = await Promise.all([
        fetchDocumentsSnapshot(forceRefresh).catch(() => ({ documents: [], aiConfigured: true })),
        fetchLatestJob().catch(() => null),
        fetchSheetData().catch(() => ({ records: [] })),
      ]);
      const records = sheetData?.records || [];
      setDocuments(docsSnapshot.documents);
      setAiConfigured(docsSnapshot.aiConfigured);
      const adopted = adoptLatestJob(activeJobRef.current, latestJob);
      if (adopted !== activeJobRef.current) applyActiveJob(adopted);
      setSheetRecords(records);

      let dossiersList = await fetchAllDossiers(forceRefresh).catch(() => []);
      if (records.length > 0 && (forceRefresh || !hasWarmState)) {
        await fetchDiscrepancyFlags(records).catch(() => null);
        dossiersList = await fetchAllDossiers(forceRefresh).catch(() => dossiersList);
      }
      setDossiers(dossiersList);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refreshData(false);
  }, []);

  useEffect(() => {
    if (!activeJob) return;
    if (activeJob.status !== 'processing' && activeJob.status !== 'uploading') return;
    const paired = activeJob as BatchProcessingJob & { jobId?: string };
    const jobId = paired.jobId || activeJob.id;
    if (!jobId) return;
    const poll = setInterval(async () => {
      try {
        const job = await fetchJobStatus(String(jobId));
        const adopted = adoptPollResponse(activeJobRef.current, String(jobId), job);
        if (adopted && adopted !== activeJobRef.current) {
          const prevProcessed = activeJobRef.current?.processedFiles || 0;
          applyActiveJob(adopted);
          if ((adopted.processedFiles || 0) > prevProcessed) {
            const [snap, dossiersList] = await Promise.all([
              fetchDocumentsSnapshot().catch(() => null),
              fetchAllDossiers().catch(() => null),
            ]);
            if (snap) {
              setDocuments(snap.documents);
              setAiConfigured(snap.aiConfigured);
            }
            if (dossiersList) setDossiers(dossiersList);
          }
        }
      } catch {
        // transient network error — next tick retries
      }
    }, 1500);
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
        showToast(`Deleted ${deletedCount} document${deletedCount === 1 ? '' : 's'}`, 'success');
        setSelectedDocIds([]);
      } else {
        showToast('No documents were deleted', 'error');
      }
      await refreshData(true);
    } catch (err: any) {
      showToast(toUserErrorMessage(err, 'Could not delete selected documents'), 'error');
    } finally {
      setIsOperatingDoc(false);
    }
  };

  const handleDeleteDoc = async (doc: StudentDocumentRecord) => {
    try {
      setIsOperatingDoc(true);
      const ok = await deleteDocument(doc.id);
      if (ok) {
        showToast('Document deleted', 'success');
      } else {
        showToast('Could not delete document', 'error');
      }
      await refreshData(true);
    } catch (err: any) {
      showToast(toUserErrorMessage(err, 'Delete failed'), 'error');
    } finally {
      setIsOperatingDoc(false);
    }
  };

  const handleRescanDoc = async (docId: string) => {
    try {
      setIsOperatingDoc(true);
      await rescanDocument(docId);
      showToast('Document re-checked', 'success');
      await refreshData(true);
    } catch (err: any) {
      showToast(toUserErrorMessage(err, 'Re-check failed'), 'error');
    } finally {
      setIsOperatingDoc(false);
    }
  };

  const handleRescanAll = async () => {
    try {
      setIsRescanningAll(true);
      await rescanAllDocuments();
      showToast('All documents re-checked', 'success');
      await refreshData(true);
    } catch (err: any) {
      showToast(toUserErrorMessage(err, 'Re-check failed'), 'error');
    } finally {
      setIsRescanningAll(false);
    }
  };

  const handleAutoLink = async () => {
    try {
      setIsAutoLinking(true);
      const res = await autoLinkDocumentsWithSheet(sheetRecords);
      showToast(`Matched ${res.totalMatched} document(s) to student records`, 'success');
      await refreshData(true);
    } catch (err: any) {
      showToast(toUserErrorMessage(err, 'Could not match documents'), 'error');
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
      await refreshData(true);
    } catch (err: any) {
      showToast(toUserErrorMessage(err, `Could not assign to GR #${grNo}`), 'error');
    } finally {
      setIsOperatingDoc(false);
    }
  };

  const handleApplyCorrection = async (grNo: string, flag: DocumentDiscrepancy) => {
    if (!flag.suggestedCorrection) return;
    try {
      setApplyingFlagId(flag.id);
      await applyCorrectionToRecord(grNo, flag.id, flag.suggestedCorrection);
      showToast(`Updated record for GR #${grNo}`, 'success');
      await refreshData(true);
    } catch (err: any) {
      showToast(toUserErrorMessage(err, 'Could not apply update'), 'error');
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
      showToast(`Updated ${list.length} student record(s)`, 'success');
      await refreshData(true);
    } catch (err: any) {
      showToast(toUserErrorMessage(err, 'Could not apply updates'), 'error');
    } finally {
      setIsBatchApplying(false);
    }
  };

  const handleResetArchiveForTesting = async () => {
    try {
      setIsResettingArchive(true);
      await resetDocumentArchiveForTesting();
      applyActiveJob(null);
      terminalRefreshedJobsRef.current.clear();
      setDocuments([]);
      setDossiers([]);
      setSelectedDocIds([]);
      showToast('Student documents cleared.', 'success');
      await refreshData(true);
    } catch (err: any) {
      showToast(toUserErrorMessage(err, 'Failed to reset student documents'), 'error');
    } finally {
      setIsResettingArchive(false);
    }
  };

  return {
    dossiers,
    documents,
    aiConfigured,
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
    isAdmin,
    isResettingArchive,
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
    handleResetArchiveForTesting,
    dismissDiscrepancyFlag,
  };
}

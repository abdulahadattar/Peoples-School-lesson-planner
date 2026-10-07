import { useState, useEffect } from 'react';
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
  autoLinkDocumentsWithSheet,
  assignDocumentToStudent,
  dismissDiscrepancyFlag,
  deleteDocument,
  deleteDocumentsBatch,
  rescanDocument,
  rescanAllDocuments,
  applyCorrectionToRecord,
  batchApplyCorrections,
} from '../services/documentClientService';
import { StudentRecord, fetchSheetData } from '../services/googleSheetsService';
import { DiscrepancyAuditItem } from '../components/documents/DiscrepancyAuditTable';

export function useDocumentArchive(showToast: (msg: string, type?: 'success' | 'error' | 'info') => void) {
  const [dossiers, setDossiers] = useState<StudentDossier[]>([]);
  const [documents, setDocuments] = useState<StudentDocumentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeJob, setActiveJob] = useState<BatchProcessingJob | null>(null);
  const [sheetRecords, setSheetRecords] = useState<StudentRecord[]>([]);
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [isOperatingDoc, setIsOperatingDoc] = useState(false);
  const [isAutoLinking, setIsAutoLinking] = useState(false);
  const [isRescanningAll, setIsRescanningAll] = useState(false);
  const [isBatchApplying, setIsBatchApplying] = useState(false);
  const [applyingFlagId, setApplyingFlagId] = useState<string | null>(null);

  const refreshData = async () => {
    try {
      setLoading(true);
      const [dossiersList, docsList, latestJob, sheetData] = await Promise.all([
        fetchAllDossiers().catch(() => []),
        fetchAllDocuments().catch(() => []),
        fetchLatestJob().catch(() => null),
        fetchSheetData().catch(() => ({ records: [] })),
      ]);
      setDossiers(dossiersList);
      setDocuments(docsList);
      setActiveJob(latestJob);
      if (sheetData?.records) setSheetRecords(sheetData.records);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshData();
  }, []);

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
      await deleteDocumentsBatch(selectedDocIds);
      showToast(`Deleted ${selectedDocIds.length} document scans`, 'success');
      setSelectedDocIds([]);
      await refreshData();
    } finally {
      setIsOperatingDoc(false);
    }
  };

  const handleDeleteDoc = async (doc: StudentDocumentRecord) => {
    try {
      setIsOperatingDoc(true);
      await deleteDocument(doc.id);
      showToast('Document scan deleted', 'success');
      await refreshData();
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
    } finally {
      setIsBatchApplying(false);
    }
  };

  return {
    dossiers,
    documents,
    loading,
    activeJob,
    setActiveJob,
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

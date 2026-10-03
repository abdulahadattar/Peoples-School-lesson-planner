import React, { useState, useEffect, useRef } from 'react';
import {
  UploadCloud,
  FileArchive,
  RotateCw,
  Download,
  Search,
  RefreshCw,
  FolderOpen,
  FileSearch,
  ShieldAlert,
  Activity,
  Link as LinkIcon,
  X,
  ScanLine,
} from 'lucide-react';
import {
  uploadZipArchive,
  uploadIndividualFiles,
  fetchAllDossiers,
  fetchAllDocuments,
  auditAllDossiers,
  fetchLatestJob,
  fetchJobStatus,
  getExportZipUrl,
  autoLinkDocuments,
  assignDocumentToStudent,
  dismissDiscrepancyFlag,
  undismissDiscrepancyFlag,
  deleteDocument,
  deleteDocumentsBatch,
  rescanDocument,
  rescanAllDocuments,
  applyDiscrepancyCorrectionClient,
  batchApplyDiscrepancyCorrectionsClient,
  queryCandidateMatches,
} from '../services/documentClientService';
import {
  StudentDossier,
  BatchProcessingJob,
  StudentDocumentRecord,
  DocumentDiscrepancy,
  CandidateStudentMatch,
  DOCUMENT_LABELS,
  CLASS_OPTIONS,
} from '../types/documentArchive';
import { getAccessToken } from '../services/googleAuth';
import { StudentRecord, fetchSheetData } from '../services/googleSheetsService';
import { StudentDetailModal } from './records/StudentDetailModal';
import { ProcessingTransparencyModal } from './documents/ProcessingTransparencyModal';
import { DocThumbnail } from './documents/DocThumbnail';
import { DossierCard } from './documents/DossierCard';
import { DiscrepancyAuditTable, DiscrepancyAuditItem } from './documents/DiscrepancyAuditTable';
import { DocumentScansGrid } from './documents/DocumentScansGrid';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { Toast, ToastMessage } from './ui/Toast';

export const DocumentArchiveCenterView: React.FC = () => {
  const [activeMainTab, setActiveMainTab] = useState<'dossiers' | 'extracted' | 'audit'>('dossiers');
  const [dossiers, setDossiers] = useState<StudentDossier[]>([]);
  const [documents, setDocuments] = useState<StudentDocumentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeJob, setActiveJob] = useState<BatchProcessingJob | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClass, setSelectedClass] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'all' | 'flagged' | 'clean' | 'missing'>('all');
  const [docTypeFilter, setDocTypeFilter] = useState<string>('ALL');
  const [auditSeverityFilter, setAuditSeverityFilter] = useState<string>('ALL');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ percent: number; statusText: string } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [activeStudentModal, setActiveStudentModal] = useState<StudentRecord | null>(null);
  const [sheetRecords, setSheetRecords] = useState<StudentRecord[]>([]);
  const [isTransparencyModalOpen, setIsTransparencyModalOpen] = useState(false);
  const [selectedPreviewDoc, setSelectedPreviewDoc] = useState<StudentDocumentRecord | null>(null);
  const [isAutoLinking, setIsAutoLinking] = useState(false);
  const [assigningDoc, setAssigningDoc] = useState<StudentDocumentRecord | null>(null);
  const [targetAssignGr, setTargetAssignGr] = useState('');
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [isOperatingDoc, setIsOperatingDoc] = useState(false);
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [applyingFlagId, setApplyingFlagId] = useState<string | null>(null);
  const [isBatchApplying, setIsBatchApplying] = useState(false);
  const [isRescanningAll, setIsRescanningAll] = useState(false);
  const [docCandidateMatches, setDocCandidateMatches] = useState<Record<string, CandidateStudentMatch[]>>({});
  const [loadingCandidatesDocId, setLoadingCandidatesDocId] = useState<string | null>(null);

  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    variant?: 'danger' | 'warning' | 'info';
    confirmLabel?: string;
    onConfirm: () => void;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderZipInputRef = useRef<HTMLInputElement>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info') => {
    setToast({ message, type });
  };

  const handleToggleSelectDoc = (docId: string) => {
    setSelectedDocIds((prev) =>
      prev.includes(docId) ? prev.filter((id) => id !== docId) : [...prev, docId]
    );
  };

  const handleToggleSelectAll = (filteredList: StudentDocumentRecord[]) => {
    const filteredIds = filteredList.map((d) => d.id);
    const isAllSelected = filteredIds.length > 0 && filteredIds.every((id) => selectedDocIds.includes(id));
    if (isAllSelected) {
      setSelectedDocIds((prev) => prev.filter((id) => !filteredIds.includes(id)));
    } else {
      const combined = new Set([...selectedDocIds, ...filteredIds]);
      setSelectedDocIds(Array.from(combined));
    }
  };

  const handleBatchDeleteDocs = async () => {
    if (selectedDocIds.length === 0) return;
    try {
      setIsOperatingDoc(true);
      const res = await deleteDocumentsBatch(selectedDocIds);
      if (res?.documents) setDocuments(res.documents);
      if (res?.dossiers) setDossiers(res.dossiers);
      if (selectedPreviewDoc && selectedDocIds.includes(selectedPreviewDoc.id)) {
        setSelectedPreviewDoc(null);
      }
      showToast(`Successfully deleted ${res?.deletedCount || selectedDocIds.length} document scans`, 'success');
      setSelectedDocIds([]);
      await refreshData();
    } catch (err: any) {
      showToast(`Batch delete error: ${err.message || 'Failed to delete selected documents'}`, 'error');
    } finally {
      setIsOperatingDoc(false);
      setConfirmDialog(null);
    }
  };

  const promptBatchDelete = () => {
    setConfirmDialog({
      isOpen: true,
      title: `Delete ${selectedDocIds.length} Document Scans?`,
      message: `Are you sure you want to permanently delete ${selectedDocIds.length} selected document scans from disk and detach them from all student dossiers? This bulk action is irreversible.`,
      variant: 'danger',
      confirmLabel: `Delete ${selectedDocIds.length} Scans`,
      onConfirm: handleBatchDeleteDocs,
    });
  };

  const handleDeleteDoc = async (docId: string) => {
    try {
      setIsOperatingDoc(true);
      const res = await deleteDocument(docId);
      if (res?.documents) setDocuments(res.documents);
      if (res?.dossiers) setDossiers(res.dossiers);
      if (selectedPreviewDoc?.id === docId) {
        setSelectedPreviewDoc(null);
      }
      showToast('Document scan permanently deleted', 'success');
      await refreshData();
    } catch (err: any) {
      showToast(`Delete error: ${err.message || 'Failed to delete document'}`, 'error');
    } finally {
      setIsOperatingDoc(false);
      setConfirmDialog(null);
    }
  };

  const promptDeleteDoc = (doc: StudentDocumentRecord) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Delete Document Scan?',
      message: `Are you sure you want to permanently delete "${doc.originalFilename || doc.filename}" (GR #${doc.grNo})? This will remove the physical scan file from disk and detach it from the student dossier.`,
      variant: 'danger',
      confirmLabel: 'Delete Scan',
      onConfirm: () => handleDeleteDoc(doc.id),
    });
  };

  const handleRescanDoc = async (docId: string) => {
    try {
      setIsOperatingDoc(true);
      const res = await rescanDocument(docId);
      if (res?.document) {
        setSelectedPreviewDoc(res.document);
      }
      showToast('Document re-analyzed successfully', 'success');
      await refreshData();
    } catch (err: any) {
      showToast(`Rescan error: ${err.message}`, 'error');
    } finally {
      setIsOperatingDoc(false);
    }
  };

  const handleRescanAllDocs = () => {
    if (documents.length === 0) {
      showToast('No documents currently found in archive to re-scan.', 'warning');
      return;
    }
    setConfirmDialog({
      isOpen: true,
      title: 'Trigger AI Batch Re-scan?',
      message: `Trigger AI batch re-scan of all ${documents.length} document scans across the system?\n\nThis will re-analyze each scan with the AI vision service, update OCR field extractions, and refresh student dossiers.`,
      variant: 'warning',
      confirmLabel: 'Start Batch Re-scan',
      onConfirm: async () => {
        setConfirmDialog(null);
        try {
          setIsRescanningAll(true);
          const res = await rescanAllDocuments();
          if (res?.documents) setDocuments(res.documents);
          if (res?.dossiers) setDossiers(res.dossiers);
          showToast(
            `Batch re-scan complete: ${res.rescanned ?? documents.length} of ${res.total ?? documents.length} documents re-analyzed with AI.`,
            'success'
          );
          await refreshData();
        } catch (err: any) {
          showToast(`Batch re-scan failed: ${err?.message || 'Error occurred while re-processing documents'}`, 'error');
        } finally {
          setIsRescanningAll(false);
        }
      },
    });
  };

  // Load dossiers, extracted documents & latest background job
  const refreshData = async () => {
    try {
      setLoading(true);
      const [dossierList, docList, latestJob, sheetData] = await Promise.all([
        fetchAllDossiers(),
        fetchAllDocuments().catch(() => []),
        fetchLatestJob(),
        fetchSheetData().catch(() => ({ records: [] })),
      ]);

      const records = sheetData.records || [];
      setSheetRecords(records);
      setDocuments(docList);
      setActiveJob(latestJob);

      if (records.length > 0 && dossierList.length > 0) {
        const auditRes = await auditAllDossiers(records).catch(() => null);
        if (auditRes?.dossiers) {
          setDossiers(auditRes.dossiers);
        } else {
          setDossiers(dossierList);
        }
      } else {
        setDossiers(dossierList);
      }
    } catch (err: any) {
      console.warn('Error fetching archive data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAutoLinkAll = async () => {
    try {
      setIsAutoLinking(true);
      setUploadError(null);
      const res = await autoLinkDocuments(sheetRecords);
      showToast(
        `Auto-Link complete: Identified & linked ${res.totalMatched} documents (${res.reassignedDocs} relocated to student folders)!`,
        'success'
      );
      await refreshData();
    } catch (err: any) {
      setUploadError(`Auto-link failed: ${err.message}`);
      showToast(`Auto-link failed: ${err.message}`, 'error');
    } finally {
      setIsAutoLinking(false);
    }
  };

  const handleAssignDoc = async (docId: string, grNo: string) => {
    if (!grNo.trim()) return;
    try {
      const studentRec = sheetRecords.find((s) => String(s.grNo).trim() === String(grNo).trim());
      await assignDocumentToStudent(docId, grNo.trim(), studentRec);
      showToast(`Document successfully assigned to Student GR #${grNo}!`, 'success');
      setAssigningDoc(null);
      setTargetAssignGr('');
      await refreshData();
    } catch (err: any) {
      showToast(`Assignment failed: ${err.message}`, 'error');
    }
  };

  const handleDismissFlag = async (flagId: string) => {
    try {
      await dismissDiscrepancyFlag(flagId);
      showToast('Discrepancy marked as False Flag (Dismissed).', 'info');
      await refreshData();
    } catch (err: any) {
      showToast(`Could not dismiss flag: ${err.message}`, 'error');
    }
  };

  const handleApplyCorrection = async (grNo: string, flag: DocumentDiscrepancy) => {
    if (!flag.suggestedCorrection) return;
    try {
      setApplyingFlagId(flag.id);
      const token = await getAccessToken();
      const res = await applyDiscrepancyCorrectionClient(
        grNo,
        flag.id,
        flag.suggestedCorrection,
        token || undefined
      );
      showToast(res.message || 'Correction applied and synchronized successfully!', 'success');
      await refreshData();
    } catch (err: any) {
      showToast(`Failed to apply correction: ${err.message}`, 'error');
    } finally {
      setApplyingFlagId(null);
    }
  };

  const handleBatchApplyCorrections = async (targetFlags: DiscrepancyAuditItem[]) => {
    const valid = targetFlags.filter((d) => d.flag.suggestedCorrection && !d.flag.isDismissed);
    if (valid.length === 0) return;

    try {
      setIsBatchApplying(true);
      const token = await getAccessToken();
      const corrections = valid.map((d) => ({
        grNo: d.grNo,
        flagId: d.flag.id,
        field: d.flag.suggestedCorrection!.field,
        newValue: d.flag.suggestedCorrection!.newValue,
        reason: d.flag.suggestedCorrection!.reason,
      }));

      const res = await batchApplyDiscrepancyCorrectionsClient(corrections, token || undefined);
      showToast(
        `Applied ${res.appliedCount} corrections to student records & Google Sheets!`,
        'success'
      );
      await refreshData();
    } catch (err: any) {
      showToast(`Batch apply error: ${err.message}`, 'error');
    } finally {
      setIsBatchApplying(false);
    }
  };

  const handleResolveWithCandidate = async (
    docId: string,
    candidate: CandidateStudentMatch,
    flagId?: string
  ) => {
    try {
      const studentRec = sheetRecords.find((s) => String(s.grNo).trim() === String(candidate.grNo).trim());
      await assignDocumentToStudent(docId, candidate.grNo, studentRec);
      if (flagId) {
        await dismissDiscrepancyFlag(flagId).catch(() => {});
      }
      showToast(
        `Document successfully linked to Student GR #${candidate.grNo} (${candidate.studentName}) with ${candidate.score}% match confidence!`,
        'success'
      );
      setAssigningDoc(null);
      await refreshData();
    } catch (err: any) {
      showToast(`Could not resolve match: ${err.message}`, 'error');
    }
  };

  useEffect(() => {
    if (assigningDoc?.extractedData) {
      const docId = assigningDoc.id;
      if (!docCandidateMatches[docId]) {
        setLoadingCandidatesDocId(docId);
        queryCandidateMatches(assigningDoc.extractedData, 5)
          .then((res) => {
            if (res.ok && res.matches) {
              setDocCandidateMatches((prev) => ({ ...prev, [docId]: res.matches }));
            }
          })
          .catch((err) => console.warn('Candidate query error:', err))
          .finally(() => setLoadingCandidatesDocId(null));
      }
    }
  }, [assigningDoc]);

  useEffect(() => {
    refreshData();
  }, []);

  // Poll background job if it is actively running
  useEffect(() => {
    if (!activeJob || activeJob.status !== 'processing') return;

    const interval = setInterval(async () => {
      try {
        const updated = await fetchJobStatus(activeJob.id);
        setActiveJob(updated);
        const [latestDossiers, latestDocs] = await Promise.all([
          fetchAllDossiers().catch(() => []),
          fetchAllDocuments().catch(() => []),
        ]);
        if (latestDossiers.length > 0) setDossiers(latestDossiers);
        if (latestDocs.length > 0) setDocuments(latestDocs);

        if (updated.status === 'completed' || updated.status === 'failed') {
          clearInterval(interval);
          refreshData();
        }
      } catch {
        // quiet fail on poll
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [activeJob?.id, activeJob?.status]);

  // Handle ZIP Archive Upload
  const handleZipUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsUploading(true);
      setUploadError(null);
      setUploadProgress({ percent: 10, statusText: `Preparing ${file.name}...` });
      const job = await uploadZipArchive(file, (percent, msg) => {
        setUploadProgress({ percent, statusText: msg || 'Uploading archive...' });
      });
      setActiveJob(job);
      setIsTransparencyModalOpen(true);
      await refreshData();
    } catch (err: any) {
      setUploadError(err.message || 'Failed to upload archive');
      showToast(err.message || 'Failed to upload archive', 'error');
    } finally {
      setIsUploading(false);
      setUploadProgress(null);
      if (folderZipInputRef.current) folderZipInputRef.current.value = '';
    }
  };

  // Handle Multi-file or Multi-PDF Upload
  const handleFilesUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files: File[] = e.target.files ? Array.from(e.target.files) : [];
    if (files.length === 0) return;

    try {
      setIsUploading(true);
      setUploadError(null);
      setUploadProgress({ percent: 5, statusText: `Starting upload of ${files.length} document(s)...` });
      const job = await uploadIndividualFiles(files, undefined, (percent, msg) => {
        setUploadProgress({ percent, statusText: msg || 'Uploading files...' });
      });
      setActiveJob(job);
      setIsTransparencyModalOpen(true);
      await refreshData();
    } catch (err: any) {
      setUploadError(err.message || 'Failed to upload files');
      showToast(err.message || 'Failed to upload files', 'error');
    } finally {
      setIsUploading(false);
      setUploadProgress(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Open a student's full modal
  const openStudentModal = (grNo: string) => {
    const match = sheetRecords.find((r) => String(r.grNo).trim() === String(grNo).trim());
    const dossierMatch = dossiers.find((d) => String(d.grNo).trim() === String(grNo).trim());
    if (match) {
      setActiveStudentModal(match);
    } else if (dossierMatch) {
      setActiveStudentModal({
        rowNumber: 0,
        grNo: dossierMatch.grNo,
        studentName: dossierMatch.studentName,
        fatherName: dossierMatch.fatherName,
        currentClass: dossierMatch.currentClass,
        section: dossierMatch.section,
        bFormNo: dossierMatch.bFormNo,
        parentCnic: dossierMatch.parentCnic,
        status: 'Active',
        gender: 'Male',
        religion: 'Islam',
        classAdmitted: '',
        shift: 'Morning',
        medium: 'English',
      } as any);
    }
  };

  // Filter dossiers
  const filteredDossiers = dossiers.filter((d) => {
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !q ||
      d.grNo.toLowerCase().includes(q) ||
      d.studentName.toLowerCase().includes(q) ||
      d.fatherName.toLowerCase().includes(q) ||
      d.bFormNo.toLowerCase().includes(q);

    const matchesClass =
      selectedClass === 'ALL' ||
      (d.currentClass && d.currentClass.toLowerCase().includes(selectedClass.toLowerCase().replace('class ', '')));

    let matchesStatus = true;
    if (statusFilter === 'flagged') {
      matchesStatus = d.allFlags.length > 0;
    } else if (statusFilter === 'clean') {
      matchesStatus = d.allFlags.length === 0;
    } else if (statusFilter === 'missing') {
      matchesStatus = d.hasMissingDocuments;
    }

    return matchesSearch && matchesClass && matchesStatus;
  });

  // Filter extracted documents
  const filteredDocuments = documents.filter((doc) => {
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !q ||
      doc.grNo.toLowerCase().includes(q) ||
      doc.originalFilename.toLowerCase().includes(q) ||
      (doc.extractedData?.studentName && doc.extractedData.studentName.toLowerCase().includes(q)) ||
      (doc.extractedData?.fatherName && doc.extractedData.fatherName.toLowerCase().includes(q)) ||
      (doc.extractedData?.bFormNo && doc.extractedData.bFormNo.includes(q)) ||
      (doc.extractedData?.fatherCnic && doc.extractedData.fatherCnic.includes(q));

    const matchesDocType = docTypeFilter === 'ALL' || doc.classification === docTypeFilter;
    return matchesSearch && matchesDocType;
  });

  // Gather all genuine Google Sheet column discrepancies across all dossiers
  const VALID_SHEET_FIELDS = new Set(['studentName', 'fatherName', 'bFormNo', 'parentCnic', 'dob']);
  const allDiscrepancies: DiscrepancyAuditItem[] = [];

  dossiers.forEach((d) => {
    d.allFlags.forEach((flag) => {
      if (VALID_SHEET_FIELDS.has(flag.field)) {
        allDiscrepancies.push({
          grNo: d.grNo,
          studentName: d.studentName,
          currentClass: d.currentClass,
          flag,
        });
      }
    });
  });

  const filteredDiscrepancies = allDiscrepancies.filter((item) => {
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !q ||
      item.grNo.toLowerCase().includes(q) ||
      item.studentName.toLowerCase().includes(q) ||
      item.flag.field.toLowerCase().includes(q) ||
      item.flag.message.toLowerCase().includes(q);

    const matchesSeverity =
      auditSeverityFilter === 'ALL' || item.flag.severity === auditSeverityFilter;

    return matchesSearch && matchesSeverity;
  });

  const totalDocumentsCount = documents.length || dossiers.reduce((acc, d) => acc + d.documents.length, 0);
  const totalFlaggedCount = allDiscrepancies.length;

  return (
    <div className="flex-1 flex flex-col h-full bg-brand-bg overflow-y-auto custom-scrollbar p-4 md:p-6 lg:p-8 space-y-6">
      {/* Top Banner & Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl md:text-2xl font-bold text-brand-text-primary tracking-tight">
              Student Document Center
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-brand-primary/10 text-brand-primary border border-brand-primary/20">
              100% Server-Side
            </span>
          </div>
          <p className="text-xs text-brand-text-secondary mt-1">
            Autonomous multi-model background ingestion: auto-rotates upside-down scans, converts ID cards/forms to crisp B&W while keeping student photos vivid color, and audits NADRA B-Form/CNIC records.
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <input
            type="file"
            ref={folderZipInputRef}
            onChange={handleZipUpload}
            accept=".zip"
            className="hidden"
          />
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFilesUpload}
            multiple
            accept=".jpg,.jpeg,.png,.webp,.pdf"
            className="hidden"
          />

          <button
            type="button"
            id="btn-rescan-all"
            onClick={handleRescanAllDocs}
            disabled={isRescanningAll || isUploading || isAutoLinking || isOperatingDoc}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold text-brand-text-primary bg-white dark:bg-brand-surface hover:bg-brand-bg border border-brand-border shadow-soft active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
            title="Trigger batch re-processing of all documents in the system using the AI service"
          >
            <RefreshCw className={`w-4 h-4 text-purple-600 dark:text-purple-400 ${isRescanningAll ? 'animate-spin' : ''}`} />
            <span>{isRescanningAll ? 'Re-scanning All...' : 'Re-scan All'}</span>
          </button>

          <button
            type="button"
            onClick={handleAutoLinkAll}
            disabled={isAutoLinking || isUploading}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold text-brand-text-primary bg-white dark:bg-brand-surface hover:bg-brand-bg border border-brand-border shadow-soft active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
            title="Automatically match unassigned and misclassified documents against student names/CNICs in the Google Sheet"
          >
            <LinkIcon className={`w-4 h-4 text-brand-primary ${isAutoLinking ? 'animate-spin' : ''}`} />
            <span>{isAutoLinking ? 'Auto-Linking...' : 'Auto-Link Scanned Docs'}</span>
          </button>

          <button
            type="button"
            onClick={() => folderZipInputRef.current?.click()}
            disabled={isUploading || isAutoLinking}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-brand-primary hover:bg-brand-primary/90 shadow-soft active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
          >
            {isUploading && folderZipInputRef.current?.value ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <FileArchive className="w-4 h-4" />
            )}
            <span>Upload Bulk ZIP (GR Folders)</span>
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading || isAutoLinking}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold text-brand-text-primary bg-white dark:bg-brand-surface hover:bg-brand-bg border border-brand-border shadow-soft active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
          >
            {isUploading && fileInputRef.current?.value ? (
              <RefreshCw className="w-4 h-4 text-brand-primary animate-spin" />
            ) : (
              <UploadCloud className="w-4 h-4 text-brand-primary" />
            )}
            <span>Upload Images / PDFs</span>
          </button>

          <button
            type="button"
            onClick={() => setIsTransparencyModalOpen(true)}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold text-brand-text-primary bg-white dark:bg-brand-surface hover:bg-brand-bg border border-brand-border shadow-soft active:scale-95 transition-all cursor-pointer"
            title="Inspect background processing, per-file status, and debug logs"
          >
            <Activity className="w-4 h-4 text-amber-500" />
            <span>Live Pipeline & Logs</span>
          </button>

          <a
            href={getExportZipUrl(selectedClass)}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold text-brand-text-primary bg-white dark:bg-brand-surface hover:bg-brand-bg border border-brand-border shadow-soft active:scale-95 transition-all"
            title="Download verified and organized ZIP folder"
          >
            <Download className="w-4 h-4 text-emerald-600" />
            <span>Export Clean ZIP</span>
          </a>
        </div>
      </div>

      {/* Active AI Batch Re-scanning Banner */}
      {isRescanningAll && (
        <div className="rounded-2xl bg-gradient-to-r from-purple-500/15 via-purple-500/10 to-transparent border border-purple-500/30 p-4 shadow-sm flex items-center justify-between gap-4 animate-pulse">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-purple-600 text-white flex items-center justify-center flex-shrink-0 shadow-md">
              <RefreshCw className="w-5 h-5 animate-spin" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-xs font-bold text-brand-text-primary uppercase tracking-wider">
                  AI Batch Re-scanning in Progress
                </h4>
                <span className="text-[10px] px-2 py-0.5 rounded-md bg-purple-500/20 text-purple-700 dark:text-purple-300 font-semibold">
                  Gemini Vision OCR & Roster Audit
                </span>
              </div>
              <p className="text-xs text-brand-text-secondary mt-0.5 font-medium">
                Re-processing all document scans through Gemini AI Vision pipeline & re-auditing against student roster...
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Active Uploading / Streaming Progress Banner */}
      {isUploading && uploadProgress && (
        <div className="rounded-2xl bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-transparent border border-emerald-500/30 p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center flex-shrink-0">
              <UploadCloud className="w-5 h-5 animate-bounce" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="text-xs font-bold text-brand-text-primary uppercase tracking-wider truncate">
                  Streaming Documents to Server
                </h4>
                <span className="text-[10px] px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-semibold flex-shrink-0">
                  Multi-file / Multi-PDF
                </span>
              </div>
              <p className="text-xs text-brand-text-secondary mt-0.5 font-medium truncate">
                {uploadProgress.statusText}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <div className="w-24 sm:w-36 bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
              <div
                className="bg-emerald-600 h-full transition-all duration-300"
                style={{
                  width: `${uploadProgress.percent}%`,
                }}
              />
            </div>
            <span className="font-mono font-bold text-emerald-700 dark:text-emerald-300">
              {uploadProgress.percent}%
            </span>
          </div>
        </div>
      )}

      {/* Background Processing Banner */}
      {activeJob && activeJob.status === 'processing' && (
        <div className="rounded-2xl bg-gradient-to-r from-brand-primary/10 via-brand-primary/5 to-transparent border border-brand-primary/30 p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-brand-primary text-white flex items-center justify-center flex-shrink-0">
              <RotateCw className="w-5 h-5 animate-spin" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="text-xs font-bold text-brand-text-primary uppercase tracking-wider truncate">
                  Background Queue Active on Server
                </h4>
                <span className="text-[10px] px-2 py-0.5 rounded-md bg-brand-primary/20 text-brand-primary font-semibold flex-shrink-0">
                  Safe to close browser
                </span>
              </div>
              <p className="text-xs text-brand-text-secondary mt-0.5 truncate">
                Processing: <span className="font-semibold text-brand-text-primary">{activeJob.currentFile || 'Working...'}</span> •{' '}
                {activeJob.processedFiles} of {activeJob.totalFiles} files complete ({activeJob.remainingFiles} remaining)
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-xs">
            <div className="w-24 sm:w-36 bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
              <div
                className="bg-brand-primary h-full transition-all duration-300"
                style={{
                  width: `${Math.round((activeJob.processedFiles / Math.max(activeJob.totalFiles, 1)) * 100)}%`,
                }}
              />
            </div>
            <span className="font-mono font-bold text-brand-text-primary">
              {Math.round((activeJob.processedFiles / Math.max(activeJob.totalFiles, 1)) * 100)}%
            </span>
            <button
              type="button"
              onClick={() => setIsTransparencyModalOpen(true)}
              className="px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-brand-primary hover:bg-brand-primary/90 shadow-xs flex items-center gap-1.5 flex-shrink-0 cursor-pointer"
            >
              <Activity className="w-3.5 h-3.5" />
              <span>Inspect Queue</span>
            </button>
          </div>
        </div>
      )}

      {uploadError && (
        <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 flex items-center justify-between">
          <span>Upload Error: {uploadError}</span>
          <button onClick={() => setUploadError(null)} className="text-rose-500 hover:text-rose-700 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Primary Navigation Tabs */}
      <div className="flex flex-row items-center gap-2 border-b border-brand-border pb-2 overflow-x-auto custom-scrollbar min-h-[50px] w-full">
        <button
          type="button"
          onClick={() => setActiveMainTab('dossiers')}
          className={`whitespace-nowrap px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 flex-shrink-0 cursor-pointer ${
            activeMainTab === 'dossiers'
              ? 'bg-brand-primary text-white shadow-soft'
              : 'bg-white dark:bg-brand-surface text-brand-text-secondary hover:text-brand-text-primary border border-brand-border'
          }`}
        >
          <FolderOpen className="w-4 h-4 flex-shrink-0" />
          <span>Student Dossiers ({dossiers.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveMainTab('extracted')}
          className={`whitespace-nowrap px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 flex-shrink-0 cursor-pointer ${
            activeMainTab === 'extracted'
              ? 'bg-brand-primary text-white shadow-soft'
              : 'bg-white dark:bg-brand-surface text-brand-text-secondary hover:text-brand-text-primary border border-brand-border'
          }`}
        >
          <FileSearch className="w-4 h-4 flex-shrink-0" />
          <span>All Extracted Documents ({totalDocumentsCount})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveMainTab('audit')}
          className={`whitespace-nowrap px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 flex-shrink-0 cursor-pointer ${
            activeMainTab === 'audit'
              ? 'bg-rose-600 text-white shadow-soft'
              : 'bg-white dark:bg-brand-surface text-brand-text-secondary hover:text-brand-text-primary border border-brand-border'
          }`}
        >
          <ShieldAlert className="w-4 h-4 flex-shrink-0" />
          <span>Cross-Check Audit ({totalFlaggedCount})</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-white dark:bg-brand-surface p-3 rounded-xl border border-brand-border shadow-soft">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-brand-text-secondary absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={
              activeMainTab === 'dossiers'
                ? 'Search by GR Number, Student Name, Father Name, or B-Form...'
                : activeMainTab === 'extracted'
                ? 'Search by GR Number, Filename, Extracted Name, or CNIC...'
                : 'Search discrepancy field, student, or explanation...'
            }
            className="w-full pl-9 pr-4 py-1.5 text-xs bg-brand-bg rounded-lg border border-brand-border text-brand-text-primary placeholder:text-brand-text-secondary focus:outline-hidden focus:ring-1 focus:ring-brand-primary"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {activeMainTab === 'dossiers' && (
            <>
              <select
                value={selectedClass}
                onChange={(e) => setSelectedClass(e.target.value)}
                className="text-xs bg-brand-bg border border-brand-border rounded-lg px-3 py-1.5 text-brand-text-primary focus:outline-hidden"
              >
                {CLASS_OPTIONS.map((c) => (
                  <option key={c} value={c}>
                    {c === 'ALL' ? 'All Classes' : c}
                  </option>
                ))}
              </select>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="text-xs bg-brand-bg border border-brand-border rounded-lg px-3 py-1.5 text-brand-text-primary focus:outline-hidden"
              >
                <option value="all">All Statuses</option>
                <option value="flagged">Flagged Only</option>
                <option value="clean">Verified Clean</option>
                <option value="missing">Missing Required Docs</option>
              </select>
            </>
          )}

          {activeMainTab === 'extracted' && (
            <select
              value={docTypeFilter}
              onChange={(e) => setDocTypeFilter(e.target.value)}
              className="text-xs bg-brand-bg border border-brand-border rounded-lg px-3 py-1.5 text-brand-text-primary focus:outline-hidden"
            >
              <option value="ALL">All Document Types</option>
              {Object.entries(DOCUMENT_LABELS).map(([val, label]) => (
                <option key={val} value={val}>
                  {label}
                </option>
              ))}
            </select>
          )}

          {activeMainTab === 'audit' && (
            <select
              value={auditSeverityFilter}
              onChange={(e) => setAuditSeverityFilter(e.target.value)}
              className="text-xs bg-brand-bg border border-brand-border rounded-lg px-3 py-1.5 text-brand-text-primary focus:outline-hidden"
            >
              <option value="ALL">All Severities</option>
              <option value="critical">Critical Only</option>
              <option value="high">High Priority</option>
              <option value="medium">Medium Priority</option>
              <option value="low">Low Priority</option>
            </select>
          )}

          <button
            type="button"
            onClick={refreshData}
            className="p-1.5 rounded-lg min-w-[36px] min-h-[36px] flex items-center justify-center text-brand-text-secondary hover:text-brand-text-primary hover:bg-brand-bg transition-colors active:bg-brand-bg cursor-pointer"
            title="Refresh Data & Run Audit"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* VIEW 1: DOSSIERS GRID */}
      {activeMainTab === 'dossiers' && (
        <>
          {filteredDossiers.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-brand-border p-12 text-center bg-white/50 dark:bg-brand-surface/50">
              <FileArchive className="w-10 h-10 mx-auto text-brand-text-secondary mb-3" />
              <h3 className="text-sm font-bold text-brand-text-primary">No Dossiers Match Filters</h3>
              <p className="text-xs text-brand-text-secondary max-w-sm mx-auto mt-1">
                Upload your student folder ZIP or search with a different GR number.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredDossiers.map((dossier) => (
                <DossierCard
                  key={dossier.grNo}
                  dossier={dossier}
                  onOpenModal={openStudentModal}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* VIEW 2: ALL EXTRACTED DOCUMENTS */}
      {activeMainTab === 'extracted' && (
        <DocumentScansGrid
          filteredDocuments={filteredDocuments}
          selectedDocIds={selectedDocIds}
          isOperatingDoc={isOperatingDoc}
          onToggleSelectDoc={handleToggleSelectDoc}
          onToggleSelectAll={handleToggleSelectAll}
          onClearSelection={() => setSelectedDocIds([])}
          onBatchDeletePrompt={promptBatchDelete}
          onPreviewDoc={(doc) => setSelectedPreviewDoc(doc)}
          onRescanDoc={handleRescanDoc}
          onDeleteDocPrompt={promptDeleteDoc}
          onAssignDocPrompt={(doc) => {
            setAssigningDoc(doc);
            setTargetAssignGr(doc.grNo === 'UNASSIGNED' ? '' : doc.grNo);
          }}
          onOpenStudentModal={openStudentModal}
        />
      )}

      {/* VIEW 3: DISCREPANCY AUDIT CENTER */}
      {activeMainTab === 'audit' && (
        <DiscrepancyAuditTable
          filteredDiscrepancies={filteredDiscrepancies}
          documents={documents}
          applyingFlagId={applyingFlagId}
          isBatchApplying={isBatchApplying}
          onPreviewDoc={(doc) => setSelectedPreviewDoc(doc)}
          onApplyCorrection={handleApplyCorrection}
          onBatchApplyCorrections={handleBatchApplyCorrections}
          onResolveWithCandidate={handleResolveWithCandidate}
          onDismissFlag={handleDismissFlag}
          onOpenStudentModal={openStudentModal}
        />
      )}

      {/* Full Document Image Preview Modal */}
      {selectedPreviewDoc && (
        <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-brand-surface rounded-2xl max-w-3xl w-full p-4 border border-brand-border space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-brand-border">
              <div>
                <span className="text-xs font-mono font-bold text-brand-primary">
                  GR #{selectedPreviewDoc.grNo} • {DOCUMENT_LABELS[selectedPreviewDoc.classification] || selectedPreviewDoc.classification}
                </span>
                <h4 className="text-sm font-bold text-brand-text-primary">
                  {selectedPreviewDoc.originalFilename}
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPreviewDoc(null)}
                className="p-1.5 rounded-lg min-w-[36px] min-h-[36px] flex items-center justify-center text-brand-text-secondary hover:text-brand-text-primary hover:bg-brand-bg transition-colors active:bg-brand-bg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-950 rounded-xl p-2 flex items-center justify-center min-h-[300px] max-h-[500px] overflow-hidden">
              {selectedPreviewDoc.filename.toLowerCase().endsWith('.pdf') ? (
                <iframe
                  src={selectedPreviewDoc.url}
                  className="w-full h-[480px] rounded border-0"
                  title={selectedPreviewDoc.originalFilename}
                />
              ) : (
                <DocThumbnail
                  url={selectedPreviewDoc.url}
                  filename={selectedPreviewDoc.filename}
                  classification={selectedPreviewDoc.classification}
                  className="max-h-[480px] w-auto object-contain rounded"
                />
              )}
            </div>

            {selectedPreviewDoc.extractedData && (
              <div className="bg-brand-bg p-3 rounded-xl border border-brand-border text-xs">
                <div className="font-bold text-brand-primary uppercase text-[11px] mb-2 flex items-center gap-1.5">
                  <ScanLine className="w-3.5 h-3.5 text-amber-500" />
                  Extracted Record
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div>
                    <span className="text-[10px] text-slate-400 block">Student Name</span>
                    <span className="font-semibold text-brand-text-primary">
                      {selectedPreviewDoc.extractedData.studentName || 'N/A'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block">Father Name</span>
                    <span className="font-semibold text-brand-text-primary">
                      {selectedPreviewDoc.extractedData.fatherName || 'N/A'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block">B-Form / CRC</span>
                    <span className="font-mono font-bold text-brand-text-primary">
                      {selectedPreviewDoc.extractedData.bFormNo || 'N/A'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block">Father CNIC</span>
                    <span className="font-mono font-bold text-brand-text-primary">
                      {selectedPreviewDoc.extractedData.fatherCnic || 'N/A'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-brand-border">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleRescanDoc(selectedPreviewDoc.id)}
                  disabled={isOperatingDoc}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 border border-indigo-200 dark:border-indigo-800 transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isOperatingDoc ? 'animate-spin' : ''}`} />
                  <span>Rescan</span>
                </button>

                <button
                  type="button"
                  onClick={() => promptDeleteDoc(selectedPreviewDoc)}
                  disabled={isOperatingDoc}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 border border-rose-200 dark:border-rose-900 transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Delete Scan</span>
                </button>
              </div>

              <div className="flex items-center gap-2">
                <a
                  href={selectedPreviewDoc.url}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-brand-text-primary bg-brand-bg border border-brand-border hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
                >
                  Open Full Scan ↗
                </a>
                <button
                  type="button"
                  onClick={() => {
                    const gr = selectedPreviewDoc.grNo;
                    setSelectedPreviewDoc(null);
                    openStudentModal(gr);
                  }}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-brand-primary hover:bg-brand-primary/90 transition-colors cursor-pointer"
                >
                  Open Student Dossier
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Assign / Reassign Document Modal */}
      {assigningDoc && (
        <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white dark:bg-brand-surface rounded-2xl max-w-md w-full p-5 border border-brand-border space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-brand-border">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-bold text-brand-text-primary">
                  Assign Document to Student GR
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setAssigningDoc(null)}
                className="p-1.5 rounded-lg min-w-[36px] min-h-[36px] flex items-center justify-center text-brand-text-secondary hover:text-brand-text-primary hover:bg-brand-bg active:bg-brand-bg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex items-center gap-3 p-3 bg-brand-bg rounded-xl border border-brand-border text-xs">
              <div className="w-12 h-12 rounded-lg bg-slate-900 overflow-hidden flex-shrink-0 flex items-center justify-center">
                {assigningDoc.url ? (
                  <img
                    src={`${assigningDoc.url}?t=${Date.now()}`}
                    alt="preview"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <DocThumbnail
                    url={assigningDoc.url}
                    filename={assigningDoc.filename}
                    classification={assigningDoc.classification}
                  />
                )}
              </div>
              <div className="min-w-0">
                <span className="font-semibold text-brand-text-primary block truncate">
                  {assigningDoc.originalFilename}
                </span>
                <span className="text-brand-text-secondary text-[11px] block">
                  Detected Type: {DOCUMENT_LABELS[assigningDoc.classification] || assigningDoc.classification}
                </span>
                {assigningDoc.extractedData?.studentName && (
                  <span className="text-emerald-600 dark:text-emerald-400 text-[10px] block font-semibold">
                    Extracted Name: {assigningDoc.extractedData.studentName}
                  </span>
                )}
              </div>
            </div>

            {/* Candidate Student Matches */}
            {loadingCandidatesDocId === assigningDoc.id && (
              <div className="p-3 bg-indigo-50/50 dark:bg-indigo-950/30 rounded-xl border border-indigo-200 dark:border-indigo-800 flex items-center gap-2 text-xs text-indigo-700 dark:text-indigo-300 animate-pulse">
                <RefreshCw className="w-4 h-4 animate-spin text-indigo-600" />
                <span>Matching against the student roster...</span>
              </div>
            )}

            {docCandidateMatches[assigningDoc.id] && docCandidateMatches[assigningDoc.id].length > 0 && (
              <div className="space-y-2 p-3 bg-indigo-50/60 dark:bg-indigo-950/30 rounded-xl border border-indigo-200 dark:border-indigo-800">
                <span className="text-xs font-bold text-indigo-900 dark:text-indigo-200 block">
                  Candidate Matches:
                </span>
                <div className="space-y-1.5 max-h-44 overflow-y-auto custom-scrollbar">
                  {docCandidateMatches[assigningDoc.id].map((cand) => (
                    <div
                      key={cand.grNo}
                      onClick={() => setTargetAssignGr(cand.grNo)}
                      className={`p-2 rounded-lg border text-xs cursor-pointer transition-all flex items-center justify-between gap-2 ${
                        targetAssignGr === cand.grNo
                          ? 'bg-indigo-600 text-white border-indigo-600 font-bold shadow-xs'
                          : 'bg-white dark:bg-slate-900 border-indigo-100 dark:border-indigo-900 hover:bg-indigo-50/80 dark:hover:bg-slate-800'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[9px] font-extrabold ${
                              targetAssignGr === cand.grNo
                                ? 'bg-white/20 text-white'
                                : cand.score >= 80
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                            }`}
                          >
                            {cand.score}% Match
                          </span>
                          <span className="font-mono font-bold">GR #{cand.grNo}</span>
                          <span className="truncate max-w-[140px]">{cand.studentName}</span>
                          {cand.fatherName && (
                            <span className="text-[10px] opacity-75">s/o {cand.fatherName}</span>
                          )}
                          <span className="text-[10px] opacity-75">({cand.currentClass})</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleResolveWithCandidate(assigningDoc.id, cand);
                        }}
                        className={`px-2 py-1 rounded text-[11px] font-bold transition-all whitespace-nowrap cursor-pointer ${
                          targetAssignGr === cand.grNo
                            ? 'bg-white text-indigo-600 hover:bg-indigo-50'
                            : 'bg-indigo-600 text-white hover:bg-indigo-700'
                        }`}
                      >
                        Assign & Link
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-xs font-semibold text-brand-text-primary block">
                Target Student G.R. Number:
              </label>
              <input
                type="text"
                value={targetAssignGr}
                onChange={(e) => setTargetAssignGr(e.target.value)}
                placeholder="e.g. 5042 or select below"
                className="w-full px-3 py-2 text-xs rounded-xl bg-brand-bg border border-brand-border text-brand-text-primary font-mono focus:outline-hidden focus:ring-2 focus:ring-brand-primary/40"
              />

              {sheetRecords.length > 0 && (
                <div className="space-y-1">
                  <span className="text-[10px] text-brand-text-secondary block">
                    Quick Select from Sheet Records:
                  </span>
                  <div className="max-h-36 overflow-y-auto custom-scrollbar border border-brand-border rounded-xl divide-y divide-brand-border">
                    {sheetRecords.slice(0, 50).map((s) => (
                      <button
                        key={s.grNo}
                        type="button"
                        onClick={() => setTargetAssignGr(s.grNo)}
                        className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-brand-bg transition-colors cursor-pointer ${
                          targetAssignGr === s.grNo ? 'bg-brand-primary/10 font-bold' : ''
                        }`}
                      >
                        <span className="font-mono text-brand-primary font-bold">GR #{s.grNo}</span>
                        <span className="text-brand-text-primary truncate max-w-[160px]">
                          {s.studentName}
                        </span>
                        <span className="text-[10px] text-slate-400">{s.currentClass}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-brand-border">
              <button
                type="button"
                onClick={() => setAssigningDoc(null)}
                className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-brand-bg cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!targetAssignGr.trim()}
                onClick={() => handleAssignDoc(assigningDoc.id, targetAssignGr)}
                className="px-4 py-1.5 rounded-xl text-xs font-semibold text-white bg-brand-primary hover:bg-brand-primary/90 shadow-soft active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
              >
                Confirm Assignment & Move
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Student Detail Modal with integrated Documents Tab */}
      {activeStudentModal && (
        <StudentDetailModal
          isOpen={!!activeStudentModal}
          student={activeStudentModal}
          onClose={() => setActiveStudentModal(null)}
        />
      )}

      {/* Live Background Processing Pipeline & Diagnostics Modal */}
      {activeJob && (
        <ProcessingTransparencyModal
          jobId={activeJob.id}
          isOpen={isTransparencyModalOpen}
          onClose={() => setIsTransparencyModalOpen(false)}
          onJobUpdated={(j) => setActiveJob(j)}
        />
      )}

      {/* Accessible Reusable Confirmation Dialog */}
      {confirmDialog && (
        <ConfirmDialog
          isOpen={confirmDialog.isOpen}
          title={confirmDialog.title}
          message={confirmDialog.message}
          variant={confirmDialog.variant || 'danger'}
          confirmLabel={confirmDialog.confirmLabel || 'Confirm'}
          onConfirm={confirmDialog.onConfirm}
          onClose={() => setConfirmDialog(null)}
        />
      )}

      {/* Non-blocking Toast feedback */}
      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
};

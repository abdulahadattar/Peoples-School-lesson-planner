import React, { useState, useEffect, useRef } from 'react';
import {
  UploadCloud,
  FileArchive,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  RotateCw,
  Download,
  Filter,
  Search,
  RefreshCw,
  FileText,
  Clock,
  Layers,
  ScanLine,
  ListChecks,
  Eye,
  Check,
  X,
  ExternalLink,
  ChevronDown,
  Activity,
  FolderOpen,
  FileSearch,
  ShieldAlert,
  ZoomIn,
  UserCheck,
  Building,
  Link as LinkIcon,
  UserPlus,
  Trash2,
  Database,
  CheckSquare,
  Square,
  MinusSquare,
  Wand2,
  ArrowRight,
  Tag,
  ShieldCheck,
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
  applyDiscrepancyCorrectionClient,
  batchApplyDiscrepancyCorrectionsClient,
  queryCandidateMatches,
} from '../services/documentClientService';
import {
  StudentDossier,
  BatchProcessingJob,
  StudentDocumentRecord,
  DocumentClassificationType,
  DocumentDiscrepancy,
  CandidateStudentMatch,
} from '../types/documentArchive';
import { getAccessToken } from '../services/googleAuth';
import { StudentRecord, fetchSheetData } from '../services/googleSheetsService';
import { StudentDetailModal } from './records/StudentDetailModal';
import { ProcessingTransparencyModal } from './documents/ProcessingTransparencyModal';

const DOCUMENT_LABELS: Record<DocumentClassificationType, string> = {
  STUDENT_PHOTO: 'Student Passport Photo',
  B_FORM: 'NADRA B-Form / CRC',
  FATHER_CNIC_FRONT: 'Father CNIC (Front)',
  FATHER_CNIC_BACK: 'Father CNIC (Back)',
  STUDENT_PROFILE_FORM: 'Student Profile Form',
  MARKS_CERTIFICATE: 'Marks Certificate / Marksheet',
  BIRTH_CERTIFICATE: 'Birth Certificate',
  SCHOOL_LEAVING_CERTIFICATE: 'School Leaving Certificate (SLC)',
  ADMISSION_FORM: 'School Admission Form',
  OTHER_UNCLASSIFIED: 'Supporting / Other Document',
  IGNORED_NOISE: 'Ignored Noise / Blank Page',
};

const CLASS_OPTIONS = [
  'ALL',
  'Class IX (Morning)',
  'Class IX (Afternoon)',
  'Class X (Morning)',
  'Class X (Afternoon)',
  'Class XI (General)',
  'Class XI (Pre-Medical)',
  'Class XI (Pre-Engineering)',
  'Class XII (General)',
  'Class XII (Pre-Medical)',
  'Class XII (Pre-Engineering)',
];

const DocThumbnail: React.FC<{ url?: string; filename?: string; classification?: string; className?: string }> = ({
  url,
  filename = '',
  classification = '',
  className = 'w-full h-full object-cover',
}) => {
  const [hasError, setHasError] = useState(false);
  const isPdf = filename.toLowerCase().endsWith('.pdf');

  if (!url || hasError || isPdf) {
    return (
      <div className="w-full h-full bg-slate-100 dark:bg-slate-800 flex flex-col items-center justify-center p-1 text-center select-none overflow-hidden">
        <FileText className="w-5 h-5 text-brand-primary/80 mb-0.5 flex-shrink-0" />
        <span className="text-[9px] font-mono font-bold text-slate-500 uppercase truncate max-w-full px-0.5">
          {isPdf ? 'PDF' : classification ? classification.slice(0, 6) : 'DOC'}
        </span>
      </div>
    );
  }

  return (
    <img
      src={url}
      alt={filename}
      className={className}
      onError={() => setHasError(true)}
      loading="lazy"
    />
  );
};

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
  const [deletingDoc, setDeletingDoc] = useState<StudentDocumentRecord | null>(null);
  const [targetAssignGr, setTargetAssignGr] = useState('');
  const [successToastMsg, setSuccessToastMsg] = useState<string | null>(null);
  const [isOperatingDoc, setIsOperatingDoc] = useState(false);
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [isConfirmingBatchDelete, setIsConfirmingBatchDelete] = useState(false);
  const [applyingFlagId, setApplyingFlagId] = useState<string | null>(null);
  const [isBatchApplying, setIsBatchApplying] = useState(false);
  const [docCandidateMatches, setDocCandidateMatches] = useState<Record<string, CandidateStudentMatch[]>>({});
  const [loadingCandidatesDocId, setLoadingCandidatesDocId] = useState<string | null>(null);

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
      if (res && res.documents) {
        setDocuments(res.documents);
      }
      if (res && res.dossiers) {
        setDossiers(res.dossiers);
      }
      if (selectedPreviewDoc && selectedDocIds.includes(selectedPreviewDoc.id)) {
        setSelectedPreviewDoc(null);
      }
      setSuccessToastMsg(`Successfully deleted ${res.deletedCount || selectedDocIds.length} document scans`);
      setSelectedDocIds([]);
      await refreshData();
    } catch (err: any) {
      alert(`Batch delete error: ${err.message || 'Failed to delete selected documents'}`);
    } finally {
      setIsOperatingDoc(false);
      setIsConfirmingBatchDelete(false);
    }
  };

  const handleDeleteDoc = async (docId: string) => {
    try {
      setIsOperatingDoc(true);
      const res = await deleteDocument(docId);
      if (res && res.documents) {
        setDocuments(res.documents);
      }
      if (res && res.dossiers) {
        setDossiers(res.dossiers);
      }
      if (selectedPreviewDoc?.id === docId) {
        setSelectedPreviewDoc(null);
      }
      setSuccessToastMsg('Document scan permanently deleted');
      await refreshData();
    } catch (err: any) {
      alert(`Delete error: ${err.message || 'Failed to delete document'}`);
    } finally {
      setIsOperatingDoc(false);
      setDeletingDoc(null);
    }
  };

  const handleRescanDoc = async (docId: string) => {
    try {
      setIsOperatingDoc(true);
      const res = await rescanDocument(docId);
      if (res.document) {
        setSelectedPreviewDoc(res.document);
      }
      setSuccessToastMsg('Document re-analyzed');
      await refreshData();
    } catch (err: any) {
      alert(`Rescan error: ${err.message}`);
    } finally {
      setIsOperatingDoc(false);
    }
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderZipInputRef = useRef<HTMLInputElement>(null);

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
        // Run cross-audit across all dossiers
        const auditRes = await auditAllDossiers(records).catch(() => null);
        if (auditRes && auditRes.dossiers) {
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
      setSuccessToastMsg(
        `Auto-Link complete: Identified & linked ${res.totalMatched} documents (${res.reassignedDocs} relocated to student folders)!`
      );
      await refreshData();
      setTimeout(() => setSuccessToastMsg(null), 5000);
    } catch (err: any) {
      setUploadError(`Auto-link failed: ${err.message}`);
    } finally {
      setIsAutoLinking(false);
    }
  };

  const handleAssignDoc = async (docId: string, grNo: string) => {
    if (!grNo.trim()) return;
    try {
      const studentRec = sheetRecords.find((s) => String(s.grNo).trim() === String(grNo).trim());
      await assignDocumentToStudent(docId, grNo.trim(), studentRec);
      setSuccessToastMsg(`Document successfully assigned to Student GR #${grNo}!`);
      setAssigningDoc(null);
      setTargetAssignGr('');
      await refreshData();
      setTimeout(() => setSuccessToastMsg(null), 4000);
    } catch (err: any) {
      alert(`Assignment failed: ${err.message}`);
    }
  };

  const handleDismissFlag = async (flagId: string) => {
    try {
      await dismissDiscrepancyFlag(flagId);
      setSuccessToastMsg('Discrepancy marked as False Flag (Dismissed).');
      await refreshData();
      setTimeout(() => setSuccessToastMsg(null), 3000);
    } catch (err: any) {
      alert(`Could not dismiss flag: ${err.message}`);
    }
  };

  const handleUndismissFlag = async (flagId: string) => {
    try {
      await undismissDiscrepancyFlag(flagId);
      setSuccessToastMsg('Discrepancy flag restored.');
      await refreshData();
      setTimeout(() => setSuccessToastMsg(null), 3000);
    } catch (err: any) {
      alert(`Could not restore flag: ${err.message}`);
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
      setSuccessToastMsg(res.message || 'Correction applied and synchronized successfully!');
      await refreshData();
      setTimeout(() => setSuccessToastMsg(null), 4500);
    } catch (err: any) {
      alert(`Failed to apply correction: ${err.message}`);
    } finally {
      setApplyingFlagId(null);
    }
  };

  const handleBatchApplyCorrections = async (targetFlags: Array<{ grNo: string; flag: DocumentDiscrepancy }>) => {
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
      setSuccessToastMsg(
        `Applied ${res.appliedCount} corrections to student records & Google Sheets!`
      );
      await refreshData();
      setTimeout(() => setSuccessToastMsg(null), 5000);
    } catch (err: any) {
      alert(`Batch apply error: ${err.message}`);
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
      setSuccessToastMsg(
        `Document successfully linked to Student GR #${candidate.grNo} (${candidate.studentName}) with ${candidate.score}% match confidence!`
      );
      setAssigningDoc(null);
      await refreshData();
      setTimeout(() => setSuccessToastMsg(null), 4500);
    } catch (err: any) {
      alert(`Could not resolve match: ${err.message}`);
    }
  };

  // Pre-fetch candidate matches when assigning modal opens
  useEffect(() => {
    if (assigningDoc && assigningDoc.extractedData) {
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
        // Live refresh documents & dossiers as each file gets extracted
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

  // Gather all discrepancies across all dossiers
  const allDiscrepancies: Array<{
    grNo: string;
    studentName: string;
    currentClass: string;
    flag: DocumentDiscrepancy;
  }> = [];

  dossiers.forEach((d) => {
    d.allFlags.forEach((flag) => {
      allDiscrepancies.push({
        grNo: d.grNo,
        studentName: d.studentName,
        currentClass: d.currentClass,
        flag,
      });
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
            onClick={handleAutoLinkAll}
            disabled={isAutoLinking || isUploading}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold text-brand-text-primary bg-white dark:bg-brand-surface hover:bg-brand-bg border border-brand-border shadow-soft active:scale-95 transition-all disabled:opacity-50"
            title="Automatically match unassigned and misclassified documents against student names/CNICs in the Google Sheet"
          >
            <LinkIcon className={`w-4 h-4 text-brand-primary ${isAutoLinking ? 'animate-spin' : ''}`} />
            <span>{isAutoLinking ? 'Auto-Linking...' : 'Auto-Link Scanned Docs'}</span>
          </button>

          <button
            type="button"
            onClick={() => folderZipInputRef.current?.click()}
            disabled={isUploading || isAutoLinking}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-brand-primary hover:bg-brand-primary/90 shadow-soft active:scale-95 transition-all disabled:opacity-50"
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
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold text-brand-text-primary bg-white dark:bg-brand-surface hover:bg-brand-bg border border-brand-border shadow-soft active:scale-95 transition-all disabled:opacity-50"
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
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold text-brand-text-primary bg-white dark:bg-brand-surface hover:bg-brand-bg border border-brand-border shadow-soft active:scale-95 transition-all"
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

      {/* Success Toast */}
      {successToastMsg && (
        <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 p-3.5 text-xs text-emerald-800 dark:text-emerald-200 font-semibold flex items-center justify-between shadow-xs animate-fadeIn">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span>{successToastMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessToastMsg(null)}
            className="p-1 hover:text-emerald-950 dark:hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
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
                <span className="text-[10px] px-2 py-0.2 rounded-md bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-semibold flex-shrink-0">
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

      {/* Background Processing Banner (Resilient Offline Notice) */}
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
                <span className="text-[10px] px-2 py-0.2 rounded-md bg-brand-primary/20 text-brand-primary font-semibold flex-shrink-0">
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
              className="px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-brand-primary hover:bg-brand-primary/90 shadow-xs flex items-center gap-1.5 flex-shrink-0"
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
          <button onClick={() => setUploadError(null)} className="text-rose-500 hover:text-rose-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Metrics Row */}
      {/* Primary Navigation Tabs */}
      <div className="flex flex-row md:items-center gap-2 border-b border-brand-border pb-2 overflow-x-auto custom-scrollbar min-h-[50px] items-start w-full">
        <button
          type="button"
          onClick={() => setActiveMainTab('dossiers')}
          className={`whitespace-nowrap px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 flex-shrink-0 ${
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
          className={`whitespace-nowrap px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 flex-shrink-0 ${
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
          className={`whitespace-nowrap px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 flex-shrink-0 ${
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
              <option value="warning">Warnings Only</option>
              <option value="info">Info Notices</option>
            </select>
          )}

          <button
            type="button"
            onClick={refreshData}
            className="p-1.5 rounded-lg text-brand-text-secondary hover:text-brand-text-primary hover:bg-brand-bg transition-colors"
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
              {filteredDossiers.map((dossier) => {
                const hasPhoto = dossier.documents.some((d) => d.classification === 'STUDENT_PHOTO');
                const hasBForm = dossier.documents.some((d) => d.classification === 'B_FORM');
                const hasCnic = dossier.documents.some((d) => d.classification.includes('CNIC'));

                return (
                  <div
                    key={dossier.grNo}
                    className="rounded-xl bg-white dark:bg-brand-surface border border-brand-border hover:border-brand-primary/40 transition-all p-4 shadow-soft flex flex-col justify-between space-y-4 group"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-xl bg-brand-bg border border-brand-border/80 overflow-hidden flex-shrink-0 flex items-center justify-center">
                            {dossier.avatarUrl ? (
                              <img
                                src={dossier.avatarUrl}
                                alt={dossier.studentName}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="text-xs font-bold text-brand-primary">
                                {dossier.studentName ? dossier.studentName[0] : 'S'}
                              </div>
                            )}
                          </div>

                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="px-2 py-0.2 rounded-md bg-brand-primary/10 text-brand-primary font-mono text-[11px] font-bold">
                                GR# {dossier.grNo}
                              </span>
                              {dossier.currentClass && (
                                <span className="text-[10px] text-brand-text-secondary font-medium">
                                  {dossier.currentClass}
                                </span>
                              )}
                            </div>
                            <h4 className="font-bold text-brand-text-primary text-sm tracking-tight mt-0.5 truncate max-w-[180px]">
                              {dossier.studentName || `Student GR ${dossier.grNo}`}
                            </h4>
                            <p className="text-[11px] text-brand-text-secondary truncate">
                              S/O {dossier.fatherName || 'Guardian'}
                            </p>
                          </div>
                        </div>

                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            dossier.allFlags.length > 0
                              ? 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                              : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                          }`}
                        >
                          {dossier.allFlags.length > 0 ? `${dossier.allFlags.length} Flags` : 'Verified'}
                        </span>
                      </div>

                      {/* Document Verification Chips */}
                      <div className="flex flex-wrap gap-1.5 mt-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-medium flex items-center gap-1 ${
                            hasPhoto
                              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                              : 'bg-slate-100 text-slate-400 dark:bg-slate-800'
                          }`}
                        >
                          {hasPhoto && <Check className="w-3 h-3" />} Photo
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-medium flex items-center gap-1 ${
                            hasBForm
                              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                              : 'bg-slate-100 text-slate-400 dark:bg-slate-800'
                          }`}
                        >
                          {hasBForm && <Check className="w-3 h-3" />} B-Form
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-medium flex items-center gap-1 ${
                            hasCnic
                              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                              : 'bg-slate-100 text-slate-400 dark:bg-slate-800'
                          }`}
                        >
                          {hasCnic && <Check className="w-3 h-3" />} Father CNIC
                        </span>
                      </div>

                      {/* Consolidated Extracted Data Summary */}
                      <div className="mt-3 pt-2.5 border-t border-brand-border/60 text-[11px] space-y-1 text-brand-text-secondary">
                        <div className="flex justify-between">
                          <span>NADRA B-Form:</span>
                          <span className="font-mono font-medium text-brand-text-primary">
                            {dossier.bFormNo || 'Not captured'}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Father CNIC:</span>
                          <span className="font-mono font-medium text-brand-text-primary">
                            {dossier.parentCnic || 'Not captured'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Footer Action */}
                    <div className="pt-2 border-t border-brand-border/60 flex items-center justify-between">
                      <span className="text-[10px] text-slate-400">
                        {dossier.documents.length} file(s) on server
                      </span>

                      <button
                        type="button"
                        onClick={() => openStudentModal(dossier.grNo)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-brand-primary bg-brand-primary/10 hover:bg-brand-primary/20 transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>View Dossier & Scans</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* VIEW 2: ALL EXTRACTED DOCUMENTS & IDENTIFIED DATA */}
      {activeMainTab === 'extracted' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-brand-surface rounded-xl border border-brand-border shadow-soft overflow-hidden">
            <div className="p-4 border-b border-brand-border flex items-center justify-between flex-wrap gap-3">
              <div>
                <h3 className="text-sm font-bold text-brand-text-primary">
                  All Processed Document Scans
                </h3>
                <p className="text-xs text-brand-text-secondary">
                  Showing all {filteredDocuments.length} document scans.
                </p>
              </div>

              {/* Quick Batch Selection Helpers */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleToggleSelectAll(filteredDocuments)}
                  className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-brand-bg border border-brand-border text-brand-text-secondary hover:text-brand-text-primary transition-colors flex items-center gap-1.5"
                >
                  <CheckSquare className="w-3.5 h-3.5 text-brand-primary" />
                  <span>
                    {filteredDocuments.length > 0 && filteredDocuments.every((d) => selectedDocIds.includes(d.id))
                      ? 'Deselect All'
                      : 'Select All Visible'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const unassignedDocs = filteredDocuments.filter((d) => d.grNo === 'UNASSIGNED');
                    handleToggleSelectAll(unassignedDocs);
                  }}
                  className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 hover:bg-amber-100 transition-colors"
                >
                  Select Unassigned ({filteredDocuments.filter((d) => d.grNo === 'UNASSIGNED').length})
                </button>
              </div>
            </div>

            {/* Sticky Floating Batch Selection Banner */}
            {selectedDocIds.length > 0 && (
              <div className="bg-rose-50 dark:bg-rose-950/90 border-b border-rose-200 dark:border-rose-800 p-3 px-4 flex items-center justify-between flex-wrap gap-3 animate-fadeIn">
                <div className="flex items-center gap-3">
                  <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-rose-600 text-white font-bold text-xs shadow-xs">
                    {selectedDocIds.length}
                  </span>
                  <div>
                    <h4 className="text-xs font-bold text-rose-900 dark:text-rose-100">
                      {selectedDocIds.length} Document Scan{selectedDocIds.length > 1 ? 's' : ''} Selected
                    </h4>
                    <p className="text-[11px] text-rose-700 dark:text-rose-300">
                      Delete all selected document scans in a single bulk action.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedDocIds([])}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/60 transition-colors"
                  >
                    Clear Selection
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsConfirmingBatchDelete(true)}
                    disabled={isOperatingDoc}
                    className="px-4 py-1.5 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 shadow-sm transition-all flex items-center gap-1.5 active:scale-95 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Delete Selected ({selectedDocIds.length})</span>
                  </button>
                </div>
              </div>
            )}

            {filteredDocuments.length === 0 ? (
              <div className="p-12 text-center text-xs text-brand-text-secondary">
                No extracted documents found matching your filter.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-brand-bg text-brand-text-secondary uppercase text-[10px] tracking-wider border-b border-brand-border">
                    <tr>
                      <th className="py-3 px-3 w-10 text-center">
                        <input
                          type="checkbox"
                          checked={
                            filteredDocuments.length > 0 &&
                            filteredDocuments.every((d) => selectedDocIds.includes(d.id))
                          }
                          onChange={() => handleToggleSelectAll(filteredDocuments)}
                          className="w-4 h-4 rounded border-brand-border text-brand-primary focus:ring-brand-primary accent-brand-primary cursor-pointer"
                          title="Select / Deselect all visible documents"
                        />
                      </th>
                      <th className="py-3 px-4">Scan Preview</th>
                      <th className="py-3 px-4">GR # & Filename</th>
                      <th className="py-3 px-4">Identified Type</th>
                      <th className="py-3 px-4">Extracted Info (NADRA)</th>
                      <th className="py-3 px-4">Orientation</th>
                      <th className="py-3 px-4">Confidence</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-brand-border">
                    {filteredDocuments.map((doc) => {
                      const ext = doc.extractedData;
                      const isDocSelected = selectedDocIds.includes(doc.id);
                      return (
                        <tr
                          key={doc.id}
                          className={`transition-colors ${
                            isDocSelected
                              ? 'bg-rose-50/60 dark:bg-rose-950/40'
                              : 'hover:bg-brand-bg/50'
                          }`}
                        >
                          <td className="py-3 px-3 w-10 text-center">
                            <input
                              type="checkbox"
                              checked={isDocSelected}
                              onChange={() => handleToggleSelectDoc(doc.id)}
                              className="w-4 h-4 rounded border-brand-border text-brand-primary focus:ring-brand-primary accent-brand-primary cursor-pointer"
                            />
                          </td>
                          <td className="py-3 px-4">
                            <div
                              onClick={() => setSelectedPreviewDoc(doc)}
                              className="w-12 h-12 rounded-lg bg-slate-100 dark:bg-slate-800 border border-brand-border overflow-hidden cursor-pointer flex items-center justify-center group relative"
                            >
                              <DocThumbnail
                                url={doc.url}
                                filename={doc.filename}
                                classification={doc.classification}
                                className="w-full h-full object-cover group-hover:scale-110 transition-transform"
                              />
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white">
                                <ZoomIn className="w-4 h-4" />
                              </div>
                            </div>
                          </td>

                          <td className="py-3 px-4">
                            <div className="flex items-center gap-1.5">
                              {doc.grNo === 'UNASSIGNED' ? (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200 animate-pulse border border-amber-300 dark:border-amber-800">
                                  UNASSIGNED
                                </span>
                              ) : (
                                <span className="font-mono font-bold text-brand-primary text-xs block">
                                  GR #{doc.grNo}
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] text-brand-text-secondary truncate max-w-[150px] block font-mono mt-0.5">
                              {doc.originalFilename}
                            </span>
                            <span className="text-[10px] text-slate-400 block">
                              {(doc.fileSizeBytes / 1024).toFixed(0)} KB • {doc.isBlackAndWhite ? 'B&W' : 'Color'}
                            </span>
                          </td>

                          <td className="py-3 px-4">
                            <span className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-900 inline-block">
                              {DOCUMENT_LABELS[doc.classification] || doc.classification}
                            </span>
                          </td>

                          <td className="py-3 px-4">
                            {ext && (ext.studentName || ext.fatherName || ext.bFormNo || ext.fatherCnic) ? (
                              <div className="space-y-0.5 text-[11px]">
                                {ext.studentName && (
                                  <div>
                                    <span className="text-slate-400">Student: </span>
                                    <span className="font-semibold text-brand-text-primary">{ext.studentName}</span>
                                  </div>
                                )}
                                {ext.fatherName && (
                                  <div>
                                    <span className="text-slate-400">Father: </span>
                                    <span className="font-medium text-brand-text-primary">{ext.fatherName}</span>
                                  </div>
                                )}
                                {ext.bFormNo && (
                                  <div>
                                    <span className="text-slate-400">B-Form: </span>
                                    <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                                      {ext.bFormNo}
                                    </span>
                                  </div>
                                )}
                                {ext.fatherCnic && (
                                  <div>
                                    <span className="text-slate-400">CNIC: </span>
                                    <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
                                      {ext.fatherCnic}
                                    </span>
                                  </div>
                                )}
                                {ext.dob && (
                                  <div>
                                    <span className="text-slate-400">DOB: </span>
                                    <span className="text-brand-text-secondary">{ext.dob}</span>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-400 italic text-[11px]">
                                No NADRA text detected
                              </span>
                            )}
                          </td>

                          <td className="py-3 px-4">
                            <span className="font-medium text-brand-text-primary text-xs">
                              {doc.rotationApplied || 0}° CW
                            </span>
                          </td>

                          <td className="py-3 px-4">
                            <div className="flex items-center gap-1.5">
                              <div className="w-12 bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
                                <div
                                  className="bg-emerald-500 h-full"
                                  style={{
                                    width: `${Math.round((doc.classificationConfidence || 0.8) * 100)}%`,
                                  }}
                                />
                              </div>
                              <span className="font-mono text-[11px] font-semibold text-brand-text-primary">
                                {Math.round((doc.classificationConfidence || 0.8) * 100)}%
                              </span>
                            </div>
                          </td>

                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleRescanDoc(doc.id)}
                                disabled={isOperatingDoc}
                                className="p-1.5 rounded-lg text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 transition-colors"
                                title="Rescan document"
                              >
                                <RefreshCw className="w-3.5 h-3.5" />
                              </button>

                              <button
                                type="button"
                                onClick={() => setDeletingDoc(doc)}
                                disabled={isOperatingDoc}
                                className="p-1.5 rounded-lg text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/60 transition-colors"
                                title="Delete document scan"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>

                              {doc.grNo === 'UNASSIGNED' ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setAssigningDoc(doc);
                                    setTargetAssignGr('');
                                  }}
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 shadow-xs transition-colors"
                                >
                                  <UserPlus className="w-3.5 h-3.5" />
                                  <span>Assign to GR</span>
                                </button>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setAssigningDoc(doc);
                                      setTargetAssignGr(doc.grNo);
                                    }}
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-brand-text-primary hover:bg-brand-bg transition-colors"
                                    title="Reassign to another GR"
                                  >
                                    <UserPlus className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => openStudentModal(doc.grNo)}
                                    className="px-2.5 py-1 rounded-lg text-xs font-semibold text-brand-primary bg-brand-primary/10 hover:bg-brand-primary/20 transition-colors"
                                  >
                                    View Dossier
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* VIEW 3: DISCREPANCY AUDIT CENTER */}
      {activeMainTab === 'audit' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-brand-surface rounded-xl border border-brand-border shadow-soft overflow-hidden">
            <div className="p-4 border-b border-brand-border flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-rose-600" />
                  <h3 className="text-sm font-bold text-brand-text-primary">
                    Cross-Check Discrepancies & Flagged Records
                  </h3>
                </div>
                <p className="text-xs text-brand-text-secondary mt-0.5">
                  Comparison between data extracted from uploaded documents and data registered in Google Sheet.
                </p>
              </div>

              <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300">
                {filteredDiscrepancies.length} Flagged Issue(s)
              </span>
            </div>

            {/* Batch Apply Synchronization Banner */}
            {(() => {
              const flagsWithCorrection = filteredDiscrepancies.filter(
                (d) => d.flag.suggestedCorrection && !d.flag.isDismissed
              );
              if (flagsWithCorrection.length === 0) return null;
              return (
                <div className="bg-emerald-50 dark:bg-emerald-950/40 border-b border-emerald-200 dark:border-emerald-800 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-fadeIn">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-xl bg-emerald-600 text-white shadow-xs">
                      <CheckCircle2 className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-emerald-900 dark:text-emerald-100 flex items-center gap-2">
                        <span>{flagsWithCorrection.length} Correction(s) Ready to Apply</span>
                      </h4>
                      <p className="text-[11px] text-emerald-700 dark:text-emerald-300 mt-0.5">
                        Review each correction before applying.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={isBatchApplying}
                    onClick={() => handleBatchApplyCorrections(flagsWithCorrection)}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95 disabled:opacity-60 whitespace-nowrap"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{isBatchApplying ? 'Applying...' : `Apply All ${flagsWithCorrection.length} to Sheet`}</span>
                  </button>
                </div>
              );
            })()}

            {filteredDiscrepancies.length === 0 ? (
              <div className="p-12 text-center">
                <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
                <h4 className="text-sm font-bold text-brand-text-primary">No discrepancies</h4>
                <p className="text-xs text-brand-text-secondary mt-1">
                  Every document matches its student record.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6 p-4">
                {filteredDiscrepancies.map((item, idx) => {
                  const docImgUrl = item.flag.documentUrl;
                  const matchedDoc = documents.find((d) => d.id === item.flag.documentId);
                  const imageUrl = docImgUrl || matchedDoc?.url;

                  return (
                    <div
                      key={idx}
                      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all space-y-4"
                    >
                      {/* Top Header Row */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
                        <div className="flex items-center gap-3 flex-wrap">
                          <span
                            className={`px-2.5 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-wider ${
                              item.flag.severity === 'critical'
                                ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/80 dark:text-rose-300'
                                : item.flag.severity === 'high'
                                ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/80 dark:text-amber-300'
                                : item.flag.severity === 'medium'
                                ? 'bg-sky-100 text-sky-700 dark:bg-sky-950/80 dark:text-sky-300'
                                : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                            }`}
                          >
                            {item.flag.severity} Priority
                          </span>
                          <span className="px-3 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 font-mono text-xs font-bold">
                            GR #{item.grNo}
                          </span>
                          <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                            {item.studentName || 'Student'}
                          </h4>
                          <span className="text-xs text-slate-500">
                            ({item.currentClass || 'General'})
                          </span>
                          {item.flag.incompleteOcr && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                              Partial OCR (&lt;13 Digits) • Sheet Authoritative
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 font-mono text-slate-700 dark:text-slate-300">
                            Field: {item.flag.fieldName || item.flag.field}
                          </span>
                        </div>
                      </div>

                      {/* Main Split Body: Large Document Preview + Comparison Boxes */}
                      <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
                        {/* Large Document Preview Card (4 cols) */}
                        <div className="md:col-span-4 flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/80 rounded-xl p-3">
                          <div
                            onClick={() => {
                              if (matchedDoc) setSelectedPreviewDoc(matchedDoc);
                            }}
                            className="w-full h-48 rounded-lg bg-slate-900 border border-slate-200 dark:border-slate-700 overflow-hidden cursor-pointer flex items-center justify-center group relative shadow-inner"
                            title="Click to zoom in on document scan"
                          >
                            {imageUrl ? (
                              <img
                                src={`${imageUrl}?t=${Date.now()}`}
                                alt="Document Scan"
                                className="w-full h-full object-contain group-hover:scale-105 transition-transform"
                              />
                            ) : (
                              <div className="flex flex-col items-center justify-center text-slate-400 gap-2">
                                <FileText className="w-8 h-8" />
                                <span className="text-xs font-medium">No Image Preview</span>
                              </div>
                            )}
                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center transition-opacity text-white gap-1.5 p-2 text-center">
                              <ZoomIn className="w-6 h-6" />
                              <span className="text-xs font-bold">Click to Inspect & Zoom Scan</span>
                            </div>
                          </div>
                          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mt-2">
                            Source Document Scan (Click to Expand)
                          </span>
                        </div>

                        {/* Side-by-Side Comparison Boxes (8 cols) */}
                        <div className="md:col-span-8 space-y-4">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {/* Extracted Box */}
                            <div className="p-4 rounded-xl bg-rose-50/60 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/50 space-y-1.5">
                              <div className="text-[11px] font-extrabold text-rose-600 dark:text-rose-400 uppercase tracking-wider flex items-center gap-1.5">
                                <ScanLine className="w-3.5 h-3.5" />
                                Extracted Value (From Scan)
                              </div>
                              <div className="text-base font-bold font-mono text-rose-900 dark:text-rose-200 bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-rose-100 dark:border-rose-900 shadow-xs">
                                {item.flag.extractedValue || '(Missing / Blank)'}
                              </div>
                              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                Read directly from the uploaded scan.
                              </p>
                            </div>

                            {/* Google Sheet Record Box */}
                            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-1.5">
                              <div className="text-[11px] font-extrabold text-slate-600 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                                <Database className="w-3.5 h-3.5" />
                                Google Sheet Record
                              </div>
                              <div className="text-base font-bold font-mono text-slate-900 dark:text-white bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 shadow-xs">
                                {item.flag.sheetValue || '(Not in Sheet)'}
                              </div>
                              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                Current value stored in student roster.
                              </p>
                            </div>
                          </div>

                          {/* Audit Diagnosis Message */}
                          <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 flex items-start gap-2 text-xs text-amber-900 dark:text-amber-200">
                            <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                            <div>
                              <span className="font-bold">Audit Analysis: </span>
                              {item.flag.message}
                            </div>
                          </div>

                          {/* Single-Click Suggested Correction Card */}
                          {item.flag.suggestedCorrection && (
                            <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 space-y-2.5 animate-fadeIn">
                              <div className="flex items-center justify-between flex-wrap gap-2">
                                <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-900 dark:text-emerald-100">
                                  <Wand2 className="w-4 h-4 text-emerald-600" />
                                  <span>Recommended Resolution:</span>
                                </div>
                                <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                                  item.flag.suggestedAction === 'enrich_full_name' || item.flag.suggestedAction === 'merge_caste'
                                    ? 'bg-teal-100 dark:bg-teal-900/60 text-teal-800 dark:text-teal-200 border border-teal-300 dark:border-teal-700'
                                    : 'bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200'
                                }`}>
                                  {item.flag.suggestedAction === 'enrich_full_name'
                                    ? 'Full Name & Caste Enrichment'
                                    : item.flag.suggestedAction === 'merge_caste'
                                    ? 'Incorporate Caste'
                                    : item.flag.suggestedAction || 'Suggested fix'}
                                </span>
                              </div>

                              <div className="flex items-center gap-2 text-xs">
                                <span className="text-slate-500 font-mono line-through truncate max-w-[140px]">
                                  {item.flag.sheetValue || '(blank)'}
                                </span>
                                <ArrowRight className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                                <span className="font-mono font-bold text-emerald-800 dark:text-emerald-200 bg-white dark:bg-slate-900 px-2 py-1 rounded border border-emerald-300 dark:border-emerald-700 shadow-xs">
                                  {item.flag.suggestedCorrection.newValue}
                                </span>
                              </div>

                              <p className="text-[11px] text-emerald-700 dark:text-emerald-300">
                                {item.flag.suggestedCorrection.reason}
                              </p>

                              <div className="flex items-center justify-end pt-1">
                                <button
                                  type="button"
                                  disabled={applyingFlagId === item.flag.id}
                                  onClick={() => handleApplyCorrection(item.grNo, item.flag)}
                                  className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 disabled:opacity-50"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                  <span>{applyingFlagId === item.flag.id ? 'Applying...' : 'Apply Correction to Google Sheet'}</span>
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Ranked Candidate Matches Section */}
                          {item.flag.rankedMatches && item.flag.rankedMatches.length > 0 && (
                            <div className="p-3.5 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800/60 space-y-2.5 animate-fadeIn">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-900 dark:text-indigo-100">
                                  <ListChecks className="w-4 h-4 text-indigo-600" />
                                  <span>Candidate Matches ({item.flag.rankedMatches.length})</span>
                                </div>
                                <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-medium">
                                  Ranked by match score
                                </span>
                              </div>

                              <div className="space-y-2">
                                {item.flag.rankedMatches.map((cand, cIdx) => {
                                  const isHighConf = cand.score >= 80;
                                  const isMedConf = cand.score >= 50 && cand.score < 80;

                                  return (
                                    <div
                                      key={cIdx}
                                      className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-indigo-100 dark:border-indigo-900/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shadow-xs"
                                    >
                                      <div className="space-y-1">
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <span
                                            className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${
                                              isHighConf
                                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                                : isMedConf
                                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                                : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                                            }`}
                                          >
                                            {cand.score}% Match
                                          </span>
                                          <span className="font-mono font-bold text-xs text-indigo-700 dark:text-indigo-300">
                                            GR #{cand.grNo}
                                          </span>
                                          <span className="font-bold text-xs text-slate-900 dark:text-white">
                                            {cand.studentName}
                                          </span>
                                          {cand.fatherName && (
                                            <span className="text-xs text-slate-500">
                                              s/o {cand.fatherName}
                                            </span>
                                          )}
                                          <span className="text-[10px] text-slate-400">
                                            ({cand.currentClass})
                                          </span>
                                        </div>

                                        {/* Evidence Chips */}
                                        <div className="flex flex-wrap gap-1 items-center">
                                          {cand.evidence.map((ev, evIdx) => (
                                            <span
                                              key={evIdx}
                                              className="px-1.5 py-0.2 rounded text-[9px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                                            >
                                              {ev}
                                            </span>
                                          ))}
                                          <span className="text-[10px] text-slate-400 italic">
                                            {cand.reasons}
                                          </span>
                                        </div>
                                      </div>

                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleResolveWithCandidate(
                                            item.flag.documentId || matchedDoc?.id || '',
                                            cand,
                                            item.flag.id
                                          )
                                        }
                                        className="px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-xs transition-all flex items-center justify-center gap-1 whitespace-nowrap self-end sm:self-center cursor-pointer active:scale-95"
                                      >
                                        <LinkIcon className="w-3.5 h-3.5" />
                                        <span>Resolve & Link to GR #{cand.grNo}</span>
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* Actions Bar */}
                          <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2">
                            <button
                              type="button"
                              onClick={() => handleDismissFlag(item.flag.id)}
                              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 shadow-xs transition-all"
                            >
                              Dismiss as False Flag
                            </button>
                            <button
                              type="button"
                              onClick={() => openStudentModal(item.grNo)}
                              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-brand-primary hover:bg-brand-primary/90 shadow-sm transition-all"
                            >
                              <Eye className="w-4 h-4" />
                              <span>Review Full Dossier</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
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
                className="p-1.5 rounded-lg text-brand-text-secondary hover:text-brand-text-primary hover:bg-brand-bg transition-colors"
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
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 border border-indigo-200 dark:border-indigo-800 transition-colors flex items-center gap-1.5"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isOperatingDoc ? 'animate-spin' : ''}`} />
                  <span>Rescan</span>
                </button>

                <button
                  type="button"
                  onClick={() => setDeletingDoc(selectedPreviewDoc)}
                  disabled={isOperatingDoc}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 border border-rose-200 dark:border-rose-900 transition-colors flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
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
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-brand-primary hover:bg-brand-primary/90 transition-colors"
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
                <UserPlus className="w-5 h-5 text-brand-primary" />
                <h4 className="text-sm font-bold text-brand-text-primary">
                  Assign Document to Student GR
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setAssigningDoc(null)}
                className="p-1.5 rounded-lg text-brand-text-secondary hover:text-brand-text-primary hover:bg-brand-bg"
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
                  <FileText className="w-5 h-5 text-slate-400" />
                )}
              </div>
              <div className="min-w-0">
                <span className="font-semibold text-brand-text-primary block truncate">
                  {assigningDoc.originalFilename}
                </span>
                <span className="text-brand-text-secondary text-[11px] block">
                  Detected Type: {DOCUMENT_LABELS[assigningDoc.classification] || assigningDoc.classification}
                </span>
                {assigningDoc.extractedData.studentName && (
                  <span className="text-emerald-600 dark:text-emerald-400 text-[10px] block font-semibold">
                    Extracted Name: {assigningDoc.extractedData.studentName}
                  </span>
                )}
              </div>
            </div>

            {/* Candidate Student Matches (ranked by match score) */}
            {loadingCandidatesDocId === assigningDoc.id && (
              <div className="p-3 bg-indigo-50/50 dark:bg-indigo-950/30 rounded-xl border border-indigo-200 dark:border-indigo-800 flex items-center gap-2 text-xs text-indigo-700 dark:text-indigo-300 animate-pulse">
                <RefreshCw className="w-4 h-4 animate-spin text-indigo-600" />
                <span>Matching against the student roster...</span>
              </div>
            )}

            {docCandidateMatches[assigningDoc.id] && docCandidateMatches[assigningDoc.id].length > 0 && (
              <div className="space-y-2 p-3 bg-indigo-50/60 dark:bg-indigo-950/30 rounded-xl border border-indigo-200 dark:border-indigo-800">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-indigo-900 dark:text-indigo-200 flex items-center gap-1.5">
                    <ListChecks className="w-3.5 h-3.5 text-indigo-600" />
                    Candidate Matches:
                  </span>
                </div>
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
                        <div className="text-[10px] opacity-80 mt-0.5 truncate max-w-[280px]">
                          {cand.reasons}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleResolveWithCandidate(assigningDoc.id, cand);
                        }}
                        className={`px-2 py-1 rounded text-[11px] font-bold transition-all whitespace-nowrap ${
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
                        className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-brand-bg transition-colors ${
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
                className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-brand-bg"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!targetAssignGr.trim()}
                onClick={() => handleAssignDoc(assigningDoc.id, targetAssignGr)}
                className="px-4 py-1.5 rounded-xl text-xs font-semibold text-white bg-brand-primary hover:bg-brand-primary/90 shadow-soft active:scale-95 transition-all disabled:opacity-50"
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
          onEdit={() => {}}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deletingDoc && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-brand-surface rounded-2xl border border-brand-border p-6 max-w-md w-full shadow-2xl space-y-4 animate-scaleUp">
            <div className="flex items-center gap-3 text-rose-500">
              <Trash2 className="w-6 h-6 flex-shrink-0" />
              <h3 className="text-lg font-bold text-brand-text-primary">Delete Document Scan?</h3>
            </div>
            <p className="text-xs text-brand-text-secondary leading-relaxed">
              Are you sure you want to permanently delete <strong className="text-brand-text-primary">{deletingDoc.originalFilename || deletingDoc.filename}</strong> (GR #{deletingDoc.grNo})?
              This will remove the physical scan file from disk and detach it from the student dossier.
            </p>
            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-brand-border">
              <button
                type="button"
                onClick={() => setDeletingDoc(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-brand-text-secondary hover:bg-brand-bg transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDeleteDoc(deletingDoc.id)}
                disabled={isOperatingDoc}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 shadow-xs transition-colors flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isOperatingDoc ? 'Deleting...' : 'Delete Scan'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Batch Delete Confirmation Modal */}
      {isConfirmingBatchDelete && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-brand-surface rounded-2xl border border-brand-border p-6 max-w-md w-full shadow-2xl space-y-4 animate-scaleUp">
            <div className="flex items-center gap-3 text-rose-500">
              <Trash2 className="w-7 h-7 flex-shrink-0" />
              <div>
                <h3 className="text-lg font-bold text-brand-text-primary">
                  Delete {selectedDocIds.length} Document Scans?
                </h3>
                <p className="text-xs text-rose-600 dark:text-rose-400 font-medium">
                  This bulk action is irreversible.
                </p>
              </div>
            </div>
            <p className="text-xs text-brand-text-secondary leading-relaxed">
              Are you sure you want to permanently delete <strong>{selectedDocIds.length}</strong> selected document scans from disk and detach them from all student dossiers?
            </p>
            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-brand-border">
              <button
                type="button"
                onClick={() => setIsConfirmingBatchDelete(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-brand-text-secondary hover:bg-brand-bg transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleBatchDeleteDocs}
                disabled={isOperatingDoc}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isOperatingDoc ? 'Deleting Scans...' : `Delete ${selectedDocIds.length} Scans`}</span>
              </button>
            </div>
          </div>
        </div>
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
    </div>
  );
};

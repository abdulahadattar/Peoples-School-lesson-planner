import React, { useState, useEffect, useRef } from 'react';
import {
  UploadCloud,
  FileArchive,
  CheckCircle2,
  AlertTriangle,
  RotateCw,
  Download,
  Filter,
  Search,
  RefreshCw,
  FileText,
  Clock,
  Layers,
  Sparkles,
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
} from '../services/documentClientService';
import {
  StudentDossier,
  BatchProcessingJob,
  StudentDocumentRecord,
  DocumentClassificationType,
  DocumentDiscrepancy,
} from '../types/documentArchive';
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
  const [successToastMsg, setSuccessToastMsg] = useState<string | null>(null);

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
              Student Document Center & AI Archivist
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
            title="Inspect background AI pipeline, per-file status, and debug logs"
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
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 md:gap-4">
        <div
          onClick={() => setActiveMainTab('dossiers')}
          className={`p-4 rounded-xl bg-white dark:bg-brand-surface border transition-all cursor-pointer shadow-soft ${
            activeMainTab === 'dossiers' ? 'border-brand-primary ring-1 ring-brand-primary/30' : 'border-brand-border hover:border-brand-primary/40'
          }`}
        >
          <span className="text-[11px] font-semibold text-brand-text-secondary uppercase tracking-wider block mb-1">
            Registered Student Dossiers
          </span>
          <span className="text-2xl font-bold text-brand-text-primary">{dossiers.length}</span>
        </div>

        <div
          onClick={() => setActiveMainTab('extracted')}
          className={`p-4 rounded-xl bg-white dark:bg-brand-surface border transition-all cursor-pointer shadow-soft ${
            activeMainTab === 'extracted' ? 'border-brand-primary ring-1 ring-brand-primary/30' : 'border-brand-border hover:border-brand-primary/40'
          }`}
        >
          <span className="text-[11px] font-semibold text-brand-text-secondary uppercase tracking-wider block mb-1">
            Total Scanned Documents
          </span>
          <span className="text-2xl font-bold text-brand-primary">{totalDocumentsCount}</span>
        </div>

        <div
          onClick={() => setActiveMainTab('audit')}
          className={`p-4 rounded-xl bg-white dark:bg-brand-surface border transition-all cursor-pointer shadow-soft ${
            activeMainTab === 'audit' ? 'border-rose-500 ring-1 ring-rose-500/30' : 'border-brand-border hover:border-rose-500/40'
          }`}
        >
          <span className="text-[11px] font-semibold text-brand-text-secondary uppercase tracking-wider block mb-1">
            Audit Discrepancies
          </span>
          <span className="text-2xl font-bold text-rose-600">{totalFlaggedCount}</span>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-brand-surface border border-brand-border shadow-soft">
          <span className="text-[11px] font-semibold text-brand-text-secondary uppercase tracking-wider block mb-1">
            AI Key Rotation Engine
          </span>
          <span className="text-2xl font-bold text-emerald-600">3 Models Active</span>
        </div>
      </div>

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
            <div className="p-4 border-b border-brand-border flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-brand-text-primary">
                  All Processed Document Scans & AI Extracted Fields
                </h3>
                <p className="text-xs text-brand-text-secondary">
                  Showing all {filteredDocuments.length} document scans identified and extracted by Gemini AI vision.
                </p>
              </div>
            </div>

            {filteredDocuments.length === 0 ? (
              <div className="p-12 text-center text-xs text-brand-text-secondary">
                No extracted documents found matching your filter.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-brand-bg text-brand-text-secondary uppercase text-[10px] tracking-wider border-b border-brand-border">
                    <tr>
                      <th className="py-3 px-4">Scan Preview</th>
                      <th className="py-3 px-4">GR # & Filename</th>
                      <th className="py-3 px-4">Identified Type</th>
                      <th className="py-3 px-4">AI Extracted Info (NADRA)</th>
                      <th className="py-3 px-4">Orientation</th>
                      <th className="py-3 px-4">Confidence</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-brand-border">
                    {filteredDocuments.map((doc) => {
                      const ext = doc.extractedData;
                      return (
                        <tr key={doc.id} className="hover:bg-brand-bg/50 transition-colors">
                          <td className="py-3 px-4">
                            <div
                              onClick={() => setSelectedPreviewDoc(doc)}
                              className="w-12 h-12 rounded-lg bg-slate-100 dark:bg-slate-800 border border-brand-border overflow-hidden cursor-pointer flex items-center justify-center group relative"
                            >
                              {doc.url ? (
                                <img
                                  src={`${doc.url}?t=${Date.now()}`}
                                  alt={doc.filename}
                                  className="w-full h-full object-cover group-hover:scale-110 transition-transform"
                                />
                              ) : (
                                <FileText className="w-5 h-5 text-slate-400" />
                              )}
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
                            <div className="flex items-center justify-end gap-2">
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
                                    className="p-1 rounded-lg text-slate-400 hover:text-brand-text-primary hover:bg-brand-bg transition-colors"
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

            {filteredDiscrepancies.length === 0 ? (
              <div className="p-12 text-center">
                <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
                <h4 className="text-sm font-bold text-brand-text-primary">100% Clean Audit</h4>
                <p className="text-xs text-brand-text-secondary mt-1">
                  All uploaded documents match their corresponding student Google Sheet records perfectly!
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6">
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
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 font-mono text-slate-700 dark:text-slate-300">
                            Field: {item.flag.fieldName || item.flag.field}
                          </span>
                        </div>
                      </div>

                      {/* Main Split Body: Large Document Preview + Comparison Boxes */}
                      <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-center">
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
                            {/* AI Extracted Box */}
                            <div className="p-4 rounded-xl bg-rose-50/60 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/50 space-y-1.5">
                              <div className="text-[11px] font-extrabold text-rose-600 dark:text-rose-400 uppercase tracking-wider flex items-center gap-1.5">
                                <Sparkles className="w-3.5 h-3.5" />
                                AI Extracted Value (From Scan)
                              </div>
                              <div className="text-base font-bold font-mono text-rose-900 dark:text-rose-200 bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-rose-100 dark:border-rose-900 shadow-xs">
                                {item.flag.extractedValue || '(Missing / Blank)'}
                              </div>
                              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                Read directly by Gemini AI Vision OCR engine.
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
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
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

            <div className="bg-slate-950 rounded-xl p-2 flex items-center justify-center max-h-[500px] overflow-hidden">
              <img
                src={`${selectedPreviewDoc.url}?t=${Date.now()}`}
                alt={selectedPreviewDoc.originalFilename}
                className="max-h-[480px] w-auto object-contain rounded"
              />
            </div>

            {selectedPreviewDoc.extractedData && (
              <div className="bg-brand-bg p-3 rounded-xl border border-brand-border text-xs">
                <div className="font-bold text-brand-primary uppercase text-[11px] mb-2 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  AI Extracted Record
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

            <div className="flex justify-end gap-2 pt-2 border-t border-brand-border">
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
      )}

      {/* Assign / Reassign Document Modal */}
      {assigningDoc && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 animate-fadeIn">
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

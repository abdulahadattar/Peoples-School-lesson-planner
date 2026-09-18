import React, { useState, useEffect, useRef } from 'react';
import {
  StudentDossier,
  StudentDocumentRecord,
  DocumentClassificationType,
  DocumentDiscrepancy,
} from '../../types/documentArchive';
import {
  fetchDossierByGr,
  updateDocumentTagOrRotation,
  auditDossier,
  uploadIndividualFiles,
  dismissDiscrepancyFlag,
  undismissDiscrepancyFlag,
  autoLinkDocuments,
  assignDocumentToStudent,
} from '../../services/documentClientService';
import { StudentRecord } from '../../services/googleSheetsService';
import { ProcessingTransparencyModal } from '../documents/ProcessingTransparencyModal';
import {
  RotateCw,
  Tag,
  AlertTriangle,
  CheckCircle2,
  Image as ImageIcon,
  FileText,
  Clock,
  Sparkles,
  ChevronRight,
  ZoomIn,
  UploadCloud,
  X,
  Activity,
  Check,
  Eye,
  RefreshCw,
  Link as LinkIcon,
  ShieldCheck,
  FileSearch,
  ExternalLink,
} from 'lucide-react';

interface StudentDocumentsTabProps {
  student: StudentRecord;
  onEditStudent?: (updated: StudentRecord) => void;
}

const DOCUMENT_LABELS: Record<DocumentClassificationType, string> = {
  STUDENT_PHOTO: 'Student Photo (Color)',
  B_FORM: 'NADRA B-Form / CRC',
  FATHER_CNIC_FRONT: 'Father CNIC (Front)',
  FATHER_CNIC_BACK: 'Father CNIC (Back)',
  STUDENT_PROFILE_FORM: 'Student Profile Form',
  MARKS_CERTIFICATE: 'Marks Certificate / Marksheet',
  BIRTH_CERTIFICATE: 'Birth Certificate',
  SCHOOL_LEAVING_CERTIFICATE: 'School Leaving Certificate',
  ADMISSION_FORM: 'Admission Form',
  OTHER_UNCLASSIFIED: 'Unclassified Document',
};

export const StudentDocumentsTab: React.FC<StudentDocumentsTabProps> = ({
  student,
  onEditStudent,
}) => {
  const [dossier, setDossier] = useState<StudentDossier | null>(null);
  const [discrepancies, setDiscrepancies] = useState<DocumentDiscrepancy[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDoc, setSelectedDoc] = useState<StudentDocumentRecord | null>(null);
  const [isRotating, setIsRotating] = useState(false);
  const [isChangingTag, setIsChangingTag] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [activeJob, setActiveJob] = useState<any | null>(null);
  const [isTransparencyModalOpen, setIsTransparencyModalOpen] = useState(false);
  const [previewModalDoc, setPreviewModalDoc] = useState<StudentDocumentRecord | null>(null);
  const [isAutoLinking, setIsAutoLinking] = useState(false);
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const data = await fetchDossierByGr(student.grNo);
      setDossier(data);
      if (data && data.documents.length > 0) {
        setSelectedDoc((prev) => (prev ? data.documents.find((d) => d.id === prev.id) || data.documents[0] : data.documents[0]));
      }

      // Run fresh discrepancy audit against current student record
      const flags = await auditDossier(student.grNo, student);
      setDiscrepancies(flags);
    } catch (err) {
      console.warn('Could not load student dossier:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [student.grNo, student]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files: File[] = e.target.files ? Array.from(e.target.files) : [];
    if (files.length === 0) return;

    try {
      setIsUploading(true);
      setUploadError(null);
      setUploadStatus(`Uploading ${files.length} document(s)...`);
      const job = await uploadIndividualFiles(files, student.grNo, (pct, msg) => {
        setUploadStatus(msg || `${pct}%`);
      });
      setActiveJob(job);
      setUploadStatus('Uploaded! Processing scans in background with Gemini AI...');
      setTimeout(() => {
        setUploadStatus(null);
        loadData();
      }, 2500);
    } catch (err: any) {
      setUploadError(err.message || 'Failed to upload document');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRotate = async (angle: 90 | 180 | 270) => {
    if (!selectedDoc) return;
    try {
      setIsRotating(true);
      const updated = await updateDocumentTagOrRotation(selectedDoc.id, undefined, angle);
      setSelectedDoc(updated);
      await loadData();
    } catch {
      alert('Failed to rotate document');
    } finally {
      setIsRotating(false);
    }
  };

  const handleTagChange = async (newTag: DocumentClassificationType) => {
    if (!selectedDoc) return;
    try {
      setIsChangingTag(true);
      const updated = await updateDocumentTagOrRotation(selectedDoc.id, newTag);
      setSelectedDoc(updated);
      await loadData();
    } catch {
      alert('Failed to update document tag');
    } finally {
      setIsChangingTag(false);
    }
  };

  const handleDismissFlag = async (flagId: string) => {
    try {
      await dismissDiscrepancyFlag(flagId);
      setDiscrepancies((prev) =>
        prev.map((f) => (f.id === flagId ? { ...f, isDismissed: true } : f))
      );
      setActionSuccessMsg('Flag marked as False Flag (Dismissed).');
      setTimeout(() => setActionSuccessMsg(null), 3000);
    } catch (err) {
      console.error('Failed to dismiss flag:', err);
    }
  };

  const handleUndismissFlag = async (flagId: string) => {
    try {
      await undismissDiscrepancyFlag(flagId);
      setDiscrepancies((prev) =>
        prev.map((f) => (f.id === flagId ? { ...f, isDismissed: false } : f))
      );
      setActionSuccessMsg('Flag restored.');
      setTimeout(() => setActionSuccessMsg(null), 3000);
    } catch (err) {
      console.error('Failed to restore flag:', err);
    }
  };

  const handleApplyAiValueToSheet = (flag: DocumentDiscrepancy) => {
    if (!onEditStudent || !flag.extractedValue) return;

    const updated = { ...student };
    const fieldLower = flag.field.toLowerCase();

    if (fieldLower.includes('student') || fieldLower.includes('name')) {
      updated.studentName = flag.extractedValue;
    } else if (fieldLower.includes('father')) {
      updated.fatherName = flag.extractedValue;
    } else if (fieldLower.includes('b-form') || fieldLower.includes('bform') || fieldLower.includes('crc')) {
      updated.bFormNo = flag.extractedValue;
    } else if (fieldLower.includes('cnic')) {
      updated.parentCnic = flag.extractedValue;
    } else if (fieldLower.includes('birth') || fieldLower.includes('dob')) {
      const parts = flag.extractedValue.split(/[-/]/);
      if (parts.length === 3) {
        updated.dobDay = parts[0];
        updated.dobMonth = parts[1];
        updated.dobYear = parts[2];
      }
    }

    onEditStudent(updated);
    handleDismissFlag(flag.id);
  };

  const handleAutoLink = async () => {
    try {
      setIsAutoLinking(true);
      const res = await autoLinkDocuments([student]);
      setActionSuccessMsg(`Auto-Link complete: Matched ${res.totalMatched} documents!`);
      await loadData();
      setTimeout(() => setActionSuccessMsg(null), 4000);
    } catch (err: any) {
      alert(`Auto-link error: ${err.message}`);
    } finally {
      setIsAutoLinking(false);
    }
  };

  if (loading) {
    return (
      <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-3">
        <div className="w-8 h-8 rounded-full border-2 border-brand-primary border-t-transparent animate-spin" />
        <span className="text-xs">Loading student archive documents & AI audit...</span>
      </div>
    );
  }

  const activeFlags = discrepancies.filter((f) => !f.isDismissed);
  const dismissedFlags = discrepancies.filter((f) => f.isDismissed);

  return (
    <div className="space-y-4">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleUpload}
        multiple
        accept=".jpg,.jpeg,.png,.webp,.pdf"
        className="hidden"
      />

      {/* Top Action & Status Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-white dark:bg-brand-surface border border-brand-border shadow-xs">
        <div className="flex items-center gap-2 text-xs">
          <Sparkles className="w-4 h-4 text-brand-primary flex-shrink-0" />
          <span className="text-brand-text-primary font-semibold">
            {dossier ? dossier.documents.length : 0} Document Scan(s)
          </span>
          <span className="text-slate-400">•</span>
          <span className="text-brand-text-secondary">GR #{student.grNo}</span>
          {activeFlags.length > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300 ml-1">
              {activeFlags.length} Flagged Difference(s)
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleAutoLink}
            disabled={isAutoLinking}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-brand-text-primary bg-brand-bg hover:bg-slate-200 dark:hover:bg-slate-700 border border-brand-border transition-all disabled:opacity-50"
            title="Scan all unassigned uploads and auto-link to this student"
          >
            <LinkIcon className={`w-3.5 h-3.5 text-brand-primary ${isAutoLinking ? 'animate-spin' : ''}`} />
            <span>{isAutoLinking ? 'Matching...' : 'Auto-Link Scans'}</span>
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-brand-primary hover:bg-brand-primary/90 shadow-soft active:scale-95 transition-all disabled:opacity-50"
          >
            <UploadCloud className="w-3.5 h-3.5" />
            <span>{isUploading ? 'Uploading...' : 'Upload PDFs / Scans'}</span>
          </button>
        </div>
      </div>

      {actionSuccessMsg && (
        <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-700 dark:text-emerald-300 font-medium flex items-center gap-2 animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          <span>{actionSuccessMsg}</span>
        </div>
      )}

      {uploadError && (
        <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 flex items-center justify-between">
          <span>{uploadError}</span>
          <button onClick={() => setUploadError(null)} className="text-rose-500 hover:text-rose-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {uploadStatus && (
        <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-700 dark:text-emerald-300 font-medium flex items-center justify-between">
          <span>{uploadStatus}</span>
          {activeJob && (
            <button
              type="button"
              onClick={() => setIsTransparencyModalOpen(true)}
              className="text-xs font-bold text-emerald-800 dark:text-emerald-200 underline hover:no-underline flex items-center gap-1"
            >
              <Activity className="w-3.5 h-3.5" />
              <span>Live Pipeline</span>
            </button>
          )}
        </div>
      )}

      {/* DISCREPANCY AUDIT & SIDE-BY-SIDE COMPARISON SECTION */}
      {activeFlags.length > 0 && (
        <div className="rounded-xl border border-rose-200 dark:border-rose-800/80 bg-rose-50/50 dark:bg-rose-950/20 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400" />
              <h4 className="font-bold text-xs text-rose-900 dark:text-rose-200 uppercase tracking-wider">
                Cross-Reference Discrepancies ({activeFlags.length})
              </h4>
            </div>
            <span className="text-[11px] text-rose-700 dark:text-rose-300">
              Scanned Document vs Registered Google Sheet
            </span>
          </div>

          <div className="space-y-3">
            {activeFlags.map((flag) => {
              const matchedDoc = dossier?.documents.find((d) => d.id === flag.documentId) || dossier?.documents[0];
              const docImgUrl = flag.documentUrl || matchedDoc?.url;

              return (
                <div
                  key={flag.id}
                  className="rounded-xl bg-white dark:bg-brand-surface border border-rose-200 dark:border-rose-900/60 p-3.5 shadow-sm space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300">
                          {flag.fieldName || flag.field}
                        </span>
                        <span className="text-[11px] font-semibold text-brand-text-primary">
                          {flag.message}
                        </span>
                      </div>
                    </div>
                    <span className="text-[10px] uppercase font-bold text-rose-600 dark:text-rose-400 px-2 py-0.5 bg-rose-50 dark:bg-rose-950 rounded">
                      {flag.severity}
                    </span>
                  </div>

                  {/* Side-by-side card with Picture Reference */}
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center bg-brand-bg/60 p-3 rounded-lg border border-brand-border">
                    {/* Picture Thumbnail */}
                    <div className="sm:col-span-3 flex items-center gap-2.5">
                      <div
                        onClick={() => {
                          if (matchedDoc) setPreviewModalDoc(matchedDoc);
                        }}
                        className="w-16 h-16 rounded-lg bg-slate-900 overflow-hidden border border-brand-border cursor-pointer relative group flex-shrink-0 flex items-center justify-center"
                        title="Click to view full scan"
                      >
                        {docImgUrl ? (
                          <img
                            src={`${docImgUrl}?t=${Date.now()}`}
                            alt="Scan reference"
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          />
                        ) : (
                          <ImageIcon className="w-6 h-6 text-slate-400" />
                        )}
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white">
                          <ZoomIn className="w-4 h-4" />
                        </div>
                      </div>
                      <div className="min-w-0">
                        <span className="text-[10px] text-slate-400 block truncate">Scan Source:</span>
                        <span className="text-[11px] font-medium text-brand-text-primary block truncate font-mono">
                          {matchedDoc ? matchedDoc.originalFilename : 'Document'}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            if (matchedDoc) setSelectedDoc(matchedDoc);
                          }}
                          className="text-[10px] text-brand-primary underline hover:no-underline mt-0.5 block"
                        >
                          Inspect File
                        </button>
                      </div>
                    </div>

                    {/* AI Extracted Value */}
                    <div className="sm:col-span-4 p-2.5 rounded-lg bg-rose-50/80 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/60">
                      <span className="text-[10px] uppercase font-bold text-rose-700 dark:text-rose-300 block mb-1">
                        AI Extracted from Scan:
                      </span>
                      <span className="font-mono font-bold text-rose-800 dark:text-rose-200 text-xs block break-all">
                        {flag.extractedValue || '(Not detected / Blank)'}
                      </span>
                    </div>

                    {/* Google Sheet Registered Value */}
                    <div className="sm:col-span-5 p-2.5 rounded-lg bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
                      <span className="text-[10px] uppercase font-bold text-brand-text-secondary block mb-1">
                        Google Sheet Record:
                      </span>
                      <span className="font-mono font-bold text-brand-text-primary text-xs block break-all">
                        {flag.sheetValue || '(Blank / Unfilled)'}
                      </span>
                    </div>
                  </div>

                  {/* Resolution Action Buttons */}
                  <div className="flex items-center justify-end gap-2 pt-1 border-t border-brand-border/60">
                    <button
                      type="button"
                      onClick={() => handleDismissFlag(flag.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-300 bg-brand-bg hover:bg-slate-200 dark:hover:bg-slate-700 border border-brand-border transition-colors"
                      title="Mark as false positive without changing sheet"
                    >
                      <Check className="w-3.5 h-3.5 text-slate-500" />
                      <span>Mark as False Flag (Dismiss)</span>
                    </button>

                    {flag.extractedValue && onEditStudent && (
                      <button
                        type="button"
                        onClick={() => handleApplyAiValueToSheet(flag)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 shadow-xs transition-all active:scale-95"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Update Sheet with AI Scan Value</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Dismissed Flags Accordion / Toggle */}
      {dismissedFlags.length > 0 && (
        <div className="p-3 rounded-xl bg-slate-100/70 dark:bg-slate-900/40 border border-brand-border text-xs flex items-center justify-between">
          <div className="flex items-center gap-2 text-brand-text-secondary">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            <span>{dismissedFlags.length} discrepancy flag(s) dismissed as false flag.</span>
          </div>
          <div className="flex items-center gap-2">
            {dismissedFlags.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => handleUndismissFlag(f.id)}
                className="text-[11px] text-brand-primary underline hover:no-underline"
              >
                Restore {f.field}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Incomplete Documents Notice */}
      {dossier && dossier.hasMissingDocuments && (
        <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="text-xs">
            <span className="font-semibold text-amber-800 dark:text-amber-200">
              Missing Required Documents:
            </span>{' '}
            <span className="text-amber-700 dark:text-amber-300">
              {dossier.missingTypes.map((t) => DOCUMENT_LABELS[t] || t).join(', ')}
            </span>
          </div>
        </div>
      )}

      {/* Empty State */}
      {(!dossier || dossier.documents.length === 0) && (
        <div className="rounded-xl border border-dashed border-brand-border p-8 text-center bg-brand-bg/50 space-y-4">
          <div className="w-12 h-12 mx-auto rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-brand-text-secondary">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <h4 className="font-semibold text-brand-text-primary text-sm mb-1">
              No Document Scans Attached to GR#{student.grNo}
            </h4>
            <p className="text-xs text-brand-text-secondary max-w-md mx-auto">
              Upload multi-page PDFs or image scans (B-Form, CNIC, Photo) for {student.studentName}. PDFs will be automatically split and classified!
            </p>
          </div>

          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-brand-primary hover:bg-brand-primary/90 shadow-soft active:scale-95 transition-all disabled:opacity-50"
            >
              <UploadCloud className="w-4 h-4" />
              <span>{isUploading ? 'Uploading...' : 'Upload Student Documents / PDFs'}</span>
            </button>
          </div>
        </div>
      )}

      {/* MAIN VIEW: Split Explorer (Document List on Left + Interactive Inspector on Right) */}
      {dossier && dossier.documents.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Document list */}
          <div className="space-y-2">
            <h5 className="text-xs font-bold uppercase tracking-wider text-brand-text-secondary px-1">
              Archived Scans ({dossier.documents.length})
            </h5>
            <div className="space-y-2">
              {dossier.documents.map((doc) => {
                const isSelected = selectedDoc?.id === doc.id;
                const isPhoto = doc.classification === 'STUDENT_PHOTO';
                return (
                  <button
                    key={doc.id}
                    type="button"
                    onClick={() => setSelectedDoc(doc)}
                    className={`w-full text-left p-2.5 rounded-xl border transition-all flex items-center gap-3 ${
                      isSelected
                        ? 'bg-brand-primary/10 border-brand-primary/40 ring-1 ring-brand-primary/20'
                        : 'bg-white dark:bg-brand-surface border-brand-border hover:bg-brand-bg'
                    }`}
                  >
                    <div className="w-12 h-12 rounded-lg bg-slate-100 dark:bg-slate-800 overflow-hidden border border-brand-border/60 flex-shrink-0 flex items-center justify-center">
                      {doc.url ? (
                        <img
                          src={`${doc.url}?t=${Date.now()}`}
                          alt={doc.filename}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <ImageIcon className="w-5 h-5 text-slate-400" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold text-brand-text-primary truncate">
                          {DOCUMENT_LABELS[doc.classification] || doc.classification}
                        </span>
                        {isPhoto && (
                          <span className="px-1.5 py-0.2 text-[9px] bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 rounded font-semibold">
                            Color
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-brand-text-secondary truncate mt-0.5 font-mono">
                        {doc.originalFilename}
                      </p>
                      <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-400">
                        <span>{(doc.fileSizeBytes / 1024).toFixed(0)} KB</span>
                        <span>•</span>
                        <span>{doc.isBlackAndWhite ? 'B&W Scan' : 'Color'}</span>
                      </div>
                    </div>
                    <ChevronRight
                      className={`w-4 h-4 flex-shrink-0 ${
                        isSelected ? 'text-brand-primary' : 'text-slate-400'
                      }`}
                    />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Selected Document Full View & Controls */}
          <div className="md:col-span-2 bg-white dark:bg-brand-surface rounded-xl border border-brand-border p-4 flex flex-col space-y-3">
            {selectedDoc ? (
              <>
                {/* Header actions: Tag dropdown & Rotate */}
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-brand-border">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-brand-text-secondary">Tag:</span>
                    <select
                      value={selectedDoc.classification}
                      disabled={isChangingTag}
                      onChange={(e) =>
                        handleTagChange(e.target.value as DocumentClassificationType)
                      }
                      className="text-xs font-medium bg-brand-bg border border-brand-border rounded-lg px-2.5 py-1 text-brand-text-primary focus:outline-hidden focus:ring-1 focus:ring-brand-primary"
                    >
                      {Object.entries(DOCUMENT_LABELS).map(([val, label]) => (
                        <option key={val} value={val}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleRotate(90)}
                      disabled={isRotating}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg bg-brand-bg hover:bg-slate-200 dark:hover:bg-slate-800 text-brand-text-primary border border-brand-border transition-colors active:scale-95"
                      title="Rotate 90° clockwise"
                    >
                      <RotateCw className={`w-3.5 h-3.5 ${isRotating ? 'animate-spin' : ''}`} />
                      <span>Rotate 90°</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPreviewModalDoc(selectedDoc)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg bg-brand-bg hover:bg-slate-200 dark:hover:bg-slate-800 text-brand-text-primary border border-brand-border transition-colors"
                      title="Zoom into scan"
                    >
                      <ZoomIn className="w-3.5 h-3.5" />
                      <span>Full View</span>
                    </button>
                  </div>
                </div>

                {/* Image Preview Container */}
                <div
                  onClick={() => setPreviewModalDoc(selectedDoc)}
                  className="relative rounded-lg overflow-hidden bg-slate-950 flex items-center justify-center min-h-[280px] max-h-[400px] border border-brand-border cursor-pointer group"
                >
                  <img
                    src={`${selectedDoc.url}?t=${Date.now()}`}
                    alt={selectedDoc.originalFilename}
                    className="max-h-[380px] w-auto object-contain rounded transition-transform group-hover:scale-102"
                  />
                  <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white">
                    <span className="px-3 py-1.5 rounded-lg bg-black/60 text-xs font-medium backdrop-blur-xs flex items-center gap-1.5">
                      <ZoomIn className="w-4 h-4" /> Click to Zoom
                    </span>
                  </div>
                </div>

                {/* Extracted Details Pill Card */}
                <div className="bg-brand-bg rounded-xl p-3 border border-brand-border text-xs space-y-2">
                  <div className="flex items-center justify-between text-brand-primary font-bold text-[11px] uppercase tracking-wider">
                    <div className="flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>AI Extracted Fields (NADRA Vision)</span>
                    </div>
                    <span className="text-slate-400 font-normal">
                      Confidence: {Math.round((selectedDoc.classificationConfidence || 0.85) * 100)}%
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-1">
                    <div>
                      <span className="text-[10px] text-brand-text-secondary block">Student Name</span>
                      <span className="font-semibold text-brand-text-primary">
                        {selectedDoc.extractedData.studentName || 'Not detected'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-brand-text-secondary block">Father Name</span>
                      <span className="font-semibold text-brand-text-primary">
                        {selectedDoc.extractedData.fatherName || 'Not detected'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-brand-text-secondary block">B-Form / CRC</span>
                      <span className="font-mono font-medium text-emerald-600 dark:text-emerald-400">
                        {selectedDoc.extractedData.bFormNo || 'N/A'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-brand-text-secondary block">Father CNIC</span>
                      <span className="font-mono font-medium text-indigo-600 dark:text-indigo-400">
                        {selectedDoc.extractedData.fatherCnic || 'N/A'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-brand-text-secondary block">Date of Birth</span>
                      <span className="font-medium text-brand-text-primary">
                        {selectedDoc.extractedData.dob || 'N/A'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-brand-text-secondary block">G.R. Number</span>
                      <span className="font-mono font-semibold text-brand-primary">
                        {selectedDoc.extractedData.grNo || selectedDoc.grNo}
                      </span>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="py-16 text-center text-slate-400 text-xs">
                Select a document from the left to view details
              </div>
            )}
          </div>
        </div>
      )}

      {/* Full Document Image Zoom Modal */}
      {previewModalDoc && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white dark:bg-brand-surface rounded-2xl max-w-4xl w-full p-4 border border-brand-border space-y-3 shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between pb-2 border-b border-brand-border">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold text-brand-primary">
                  GR #{previewModalDoc.grNo}
                </span>
                <span className="text-slate-400">•</span>
                <span className="text-xs font-semibold text-brand-text-primary">
                  {DOCUMENT_LABELS[previewModalDoc.classification] || previewModalDoc.classification}
                </span>
                <span className="text-[11px] text-brand-text-secondary font-mono">
                  ({previewModalDoc.originalFilename})
                </span>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={previewModalDoc.url}
                  target="_blank"
                  rel="noreferrer"
                  className="p-1.5 rounded-lg text-brand-text-secondary hover:text-brand-text-primary hover:bg-brand-bg transition-colors"
                  title="Open Raw Image in New Tab"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
                <button
                  type="button"
                  onClick={() => setPreviewModalDoc(null)}
                  className="p-1.5 rounded-lg text-brand-text-secondary hover:text-brand-text-primary hover:bg-brand-bg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto bg-slate-950 rounded-xl p-2 flex items-center justify-center min-h-[400px]">
              <img
                src={`${previewModalDoc.url}?t=${Date.now()}`}
                alt={previewModalDoc.originalFilename}
                className="max-h-[70vh] w-auto object-contain rounded"
              />
            </div>
          </div>
        </div>
      )}

      {/* Background Processing Pipeline Modal */}
      {activeJob && (
        <ProcessingTransparencyModal
          jobId={activeJob.id}
          isOpen={isTransparencyModalOpen}
          onClose={() => setIsTransparencyModalOpen(false)}
        />
      )}
    </div>
  );
};

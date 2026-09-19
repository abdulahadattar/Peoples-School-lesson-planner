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
  selectTargetChildClient,
  reprocessDocClient,
  reprocessDossierClient,
  applyDiscrepancyCorrectionClient,
  batchApplyDiscrepancyCorrectionsClient,
} from '../../services/documentClientService';
import { getAccessToken } from '../../services/googleAuth';
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
  ZoomOut,
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
  Edit2,
  Maximize2,
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
  IGNORED_NOISE: 'Ignored Noise / Blank Page',
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
  const [modalZoom, setModalZoom] = useState(1);
  const [isAutoLinking, setIsAutoLinking] = useState(false);
  const [isReprocessing, setIsReprocessing] = useState(false);
  const [isSelectingChild, setIsSelectingChild] = useState(false);
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);
  const [editedValues, setEditedValues] = useState<Record<string, string>>({});
  const [applyingFlagId, setApplyingFlagId] = useState<string | null>(null);
  const [isBatchApplying, setIsBatchApplying] = useState(false);
  const [applySuccessId, setApplySuccessId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadData = async (quiet = false) => {
    try {
      if (!quiet) setLoading(true);
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
      if (!quiet) setLoading(false);
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
        loadData(true);
      }, 2500);
    } catch (err: any) {
      setUploadError(err.message || 'Failed to upload document');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRotateScan = async (docId: string, angle: 90 | 180 | 270) => {
    try {
      setIsRotating(true);
      const updated = await updateDocumentTagOrRotation(docId, undefined, angle);
      const freshDoc = {
        ...updated,
        url: `${updated.url.split('?')[0]}?t=${Date.now()}`,
      };
      if (selectedDoc?.id === docId) {
        setSelectedDoc(freshDoc);
      }
      if (previewModalDoc?.id === docId) {
        setPreviewModalDoc(freshDoc);
      }
      setDossier((prev) => {
        if (!prev) return (updated as any)._dossier || null;
        const newDocs = prev.documents.map((d) => (d.id === freshDoc.id ? freshDoc : d));
        const isPhoto = freshDoc.classification === 'STUDENT_PHOTO';
        return {
          ...prev,
          documents: newDocs,
          avatarUrl: isPhoto ? freshDoc.url : prev.avatarUrl,
        };
      });
      setActionSuccessMsg(`Rotated scan ${angle}° clockwise.`);
      setTimeout(() => setActionSuccessMsg(null), 3000);
    } catch (err: any) {
      alert(`Failed to rotate document: ${err.message}`);
    } finally {
      setIsRotating(false);
    }
  };

  const handleRotate = async (angle: 90 | 180 | 270) => {
    if (!selectedDoc) return;
    await handleRotateScan(selectedDoc.id, angle);
  };

  const handleTagChange = async (newTag: DocumentClassificationType) => {
    if (!selectedDoc) return;
    try {
      setIsChangingTag(true);
      const updated = await updateDocumentTagOrRotation(selectedDoc.id, newTag);
      setSelectedDoc(updated);
      setDossier((prev) => {
        if (!prev) return (updated as any)._dossier || null;
        const newDocs = prev.documents.map((d) => (d.id === updated.id ? updated : d));
        return {
          ...prev,
          documents: newDocs,
        };
      });
      setActionSuccessMsg(`Document tagged as ${DOCUMENT_LABELS[newTag] || newTag}`);
      loadData(true);
      setTimeout(() => setActionSuccessMsg(null), 3000);
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

  const handleApplyCorrection = async (flag: DocumentDiscrepancy) => {
    const rawVal =
      editedValues[flag.id] !== undefined
        ? editedValues[flag.id]
        : flag.suggestedCorrection?.newValue || flag.extractedValue || '';
    const finalValue = rawVal.trim();
    if (!finalValue) return;

    try {
      setApplyingFlagId(flag.id);
      const token = await getAccessToken();

      const targetField =
        flag.suggestedCorrection?.field ||
        (flag.field.toLowerCase().includes('bform') ||
        flag.field.toLowerCase().includes('b-form') ||
        flag.field.toLowerCase().includes('crc')
          ? 'bFormNo'
          : flag.field.toLowerCase().includes('father')
          ? 'fatherName'
          : flag.field.toLowerCase().includes('student') || flag.field.toLowerCase().includes('name')
          ? 'studentName'
          : flag.field.toLowerCase().includes('cnic')
          ? 'parentCnic'
          : flag.field.toLowerCase().includes('dob') || flag.field.toLowerCase().includes('birth')
          ? 'dob'
          : 'bFormNo');

      const res = await applyDiscrepancyCorrectionClient(
        student.grNo,
        flag.id,
        {
          field: targetField,
          newValue: finalValue,
          reason: flag.suggestedCorrection?.reason || 'Verified against archive document by user',
        },
        token || undefined
      );

      if (onEditStudent) {
        const updated = { ...student };
        if (targetField === 'studentName') updated.studentName = finalValue;
        else if (targetField === 'fatherName') updated.fatherName = finalValue;
        else if (targetField === 'bFormNo') updated.bFormNo = finalValue;
        else if (targetField === 'parentCnic') updated.parentCnic = finalValue;
        else if (targetField === 'dob') {
          const parts = finalValue.split(/[-/]/);
          if (parts.length === 3) {
            updated.dobDay = parts[0];
            updated.dobMonth = parts[1];
            updated.dobYear = parts[2];
          }
        }
        onEditStudent(updated);
      }

      setDiscrepancies((prev) => prev.filter((f) => f.id !== flag.id));
      setApplySuccessId(flag.id);
      setActionSuccessMsg(res.message || `Applied correction: ${flag.fieldName || flag.field} updated to "${finalValue}".`);
      setTimeout(() => setActionSuccessMsg(null), 4000);
    } catch (err: any) {
      alert(`Failed to apply correction: ${err.message}`);
    } finally {
      setApplyingFlagId(null);
    }
  };

  const handleApplyAllSuggestions = async () => {
    const activeToApply = discrepancies.filter((f) => !f.isDismissed);
    if (activeToApply.length === 0) return;

    try {
      setIsBatchApplying(true);
      const token = await getAccessToken();
      const updated = { ...student };

      const batchList = activeToApply.map((flag) => {
        const rawVal =
          editedValues[flag.id] !== undefined
            ? editedValues[flag.id]
            : flag.suggestedCorrection?.newValue || flag.extractedValue || '';
        const finalValue = rawVal.trim();
        const targetField =
          flag.suggestedCorrection?.field ||
          (flag.field.toLowerCase().includes('bform') ||
          flag.field.toLowerCase().includes('b-form') ||
          flag.field.toLowerCase().includes('crc')
            ? 'bFormNo'
            : flag.field.toLowerCase().includes('father')
            ? 'fatherName'
            : flag.field.toLowerCase().includes('student') || flag.field.toLowerCase().includes('name')
            ? 'studentName'
            : flag.field.toLowerCase().includes('cnic')
            ? 'parentCnic'
            : flag.field.toLowerCase().includes('dob') || flag.field.toLowerCase().includes('birth')
            ? 'dob'
            : 'bFormNo');

        if (targetField === 'studentName') updated.studentName = finalValue;
        else if (targetField === 'fatherName') updated.fatherName = finalValue;
        else if (targetField === 'bFormNo') updated.bFormNo = finalValue;
        else if (targetField === 'parentCnic') updated.parentCnic = finalValue;
        else if (targetField === 'dob') {
          const parts = finalValue.split(/[-/]/);
          if (parts.length === 3) {
            updated.dobDay = parts[0];
            updated.dobMonth = parts[1];
            updated.dobYear = parts[2];
          }
        }

        return {
          grNo: student.grNo,
          flagId: flag.id,
          field: targetField,
          newValue: finalValue,
          reason: 'Batch verified and applied by user',
        };
      });

      const res = await batchApplyDiscrepancyCorrectionsClient(batchList, token || undefined);

      if (onEditStudent) {
        onEditStudent(updated);
      }

      setDiscrepancies([]);
      setActionSuccessMsg(`Batch applied ${res.appliedCount} corrections! Google Sheet updated.`);
      setTimeout(() => setActionSuccessMsg(null), 4500);
    } catch (err: any) {
      alert(`Batch apply error: ${err.message}`);
    } finally {
      setIsBatchApplying(false);
    }
  };

  const handleApplyAiValueToSheet = (flag: DocumentDiscrepancy) => {
    handleApplyCorrection(flag);
  };

  const handleAutoLink = async () => {
    try {
      setIsAutoLinking(true);
      const res = await autoLinkDocuments([student]);
      setActionSuccessMsg(`Auto-Link complete: Matched ${res.totalMatched} documents!`);
      await loadData(true);
      setTimeout(() => setActionSuccessMsg(null), 4000);
    } catch (err: any) {
      alert(`Auto-link error: ${err.message}`);
    } finally {
      setIsAutoLinking(false);
    }
  };

  const handleSelectChild = async (entryNoOrIndex: number) => {
    if (!selectedDoc) return;
    try {
      setIsSelectingChild(true);
      const res = await selectTargetChildClient(selectedDoc.id, entryNoOrIndex);
      setSelectedDoc(res.document);
      setActionSuccessMsg(`Selected sibling #${entryNoOrIndex} as active student target.`);
      await loadData(true);
      setTimeout(() => setActionSuccessMsg(null), 3500);
    } catch (err: any) {
      alert(`Error selecting child: ${err.message}`);
    } finally {
      setIsSelectingChild(false);
    }
  };

  const handleReprocessDoc = async (docId: string) => {
    try {
      setIsReprocessing(true);
      const res = await reprocessDocClient(docId);
      setSelectedDoc(res.document);
      setActionSuccessMsg('Document rescanned and re-evaluated with Gemini AI Vision!');
      await loadData(true);
      setTimeout(() => setActionSuccessMsg(null), 4000);
    } catch (err: any) {
      alert(`Error reprocessing scan: ${err.message}`);
    } finally {
      setIsReprocessing(false);
    }
  };

  const handleReprocessDossier = async () => {
    try {
      setIsReprocessing(true);
      await reprocessDossierClient(student.grNo);
      setActionSuccessMsg('All student documents rescanned with strict identity extraction.');
      await loadData(true);
      setTimeout(() => setActionSuccessMsg(null), 4000);
    } catch (err: any) {
      alert(`Error reprocessing student dossier: ${err.message}`);
    } finally {
      setIsReprocessing(false);
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
            onClick={handleReprocessDossier}
            disabled={isReprocessing}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 border border-indigo-200 dark:border-indigo-800 transition-all disabled:opacity-50"
            title="Re-extract and re-audit all documents for this student using updated AI vision rules"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isReprocessing ? 'animate-spin text-indigo-600' : ''}`} />
            <span>{isReprocessing ? 'Rescanning...' : 'Rescan AI Vision'}</span>
          </button>

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
        <div className="rounded-2xl border border-rose-200 dark:border-rose-800/80 bg-rose-50/40 dark:bg-rose-950/20 p-4 sm:p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-rose-200/70 dark:border-rose-900/50">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-rose-100 dark:bg-rose-900/60 text-rose-600 dark:text-rose-400">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-sm text-rose-950 dark:text-rose-200 tracking-tight">
                  Document Discrepancy Review ({activeFlags.length})
                </h4>
                <p className="text-xs text-rose-700/80 dark:text-rose-300/80">
                  Inspect the original scanned document above each record, edit any OCR characters, and apply corrections directly.
                </p>
              </div>
            </div>

            <button
              type="button"
              disabled={isBatchApplying}
              onClick={handleApplyAllSuggestions}
              className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 active:scale-95 shadow-sm flex items-center gap-2 transition-all disabled:opacity-50 cursor-pointer"
              title="Apply all suggested corrections to Google Sheet simultaneously"
            >
              {isBatchApplying ? (
                <>
                  <div className="w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  <span>Applying All Corrections...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Apply All Suggestions ({activeFlags.length})</span>
                </>
              )}
            </button>
          </div>

          <div className="space-y-5">
            {activeFlags.map((flag) => {
              const matchedDoc =
                dossier?.documents.find((d) => d.id === flag.documentId) ||
                (flag.docId && dossier?.documents.find((d) => d.id === flag.docId)) ||
                dossier?.documents.find((d) => d.classification === 'B_FORM' || d.classification === 'FATHER_CNIC_FRONT') ||
                dossier?.documents[0];
              const docImgUrl = flag.documentUrl || matchedDoc?.url;

              const suggestedVal =
                flag.suggestedCorrection?.newValue || flag.extractedValue || '';
              const currentInputVal =
                editedValues[flag.id] !== undefined ? editedValues[flag.id] : suggestedVal;
              const isUserEdited =
                editedValues[flag.id] !== undefined && editedValues[flag.id] !== suggestedVal;
              const isApplying = applyingFlagId === flag.id;
              const isAppliedSuccess = applySuccessId === flag.id;

              return (
                <div
                  key={flag.id}
                  className="rounded-2xl bg-white dark:bg-brand-surface border border-rose-200 dark:border-rose-900/60 p-4 sm:p-5 shadow-sm space-y-4"
                >
                  {/* Flag Header */}
                  <div className="flex flex-wrap items-start justify-between gap-2 pb-2 border-b border-brand-border/60">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-wider bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300">
                        {flag.fieldName || flag.field}
                      </span>
                      <span className="text-xs font-semibold text-brand-text-primary">
                        {flag.message}
                      </span>
                    </div>
                    <span className="text-[10px] uppercase font-bold text-rose-600 dark:text-rose-400 px-2.5 py-0.5 bg-rose-50 dark:bg-rose-950 rounded-full border border-rose-200 dark:border-rose-900/50">
                      {flag.severity} priority
                    </span>
                  </div>

                  {/* 1. LARGE DOCUMENT PICTURE ON TOP */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs text-brand-text-secondary px-1">
                      <span className="font-semibold text-brand-text-primary flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-brand-primary" />
                        Original Document Scan Source:
                      </span>
                      <span className="font-mono text-[11px] text-slate-500">
                        {matchedDoc ? `${DOCUMENT_LABELS[matchedDoc.classification] || matchedDoc.classification} (${matchedDoc.originalFilename})` : 'Document Scan'}
                      </span>
                    </div>

                    <div className="relative rounded-xl overflow-hidden bg-slate-950 border border-slate-800 flex items-center justify-center min-h-[220px] max-h-[360px] group shadow-inner">
                      {docImgUrl ? (
                        matchedDoc?.filename.toLowerCase().endsWith('.pdf') ? (
                          <iframe
                            src={docImgUrl}
                            className="w-full h-[320px] rounded border-0"
                            title={matchedDoc.originalFilename}
                          />
                        ) : (
                          <img
                            src={docImgUrl}
                            alt="Scanned Document Reference"
                            className="w-full h-full max-h-[340px] object-contain cursor-pointer transition-transform duration-200 p-2"
                            onClick={() => {
                              if (matchedDoc) {
                                setPreviewModalDoc(matchedDoc);
                                setModalZoom(1);
                              }
                            }}
                            title="Click to open high-resolution inspection modal"
                          />
                        )
                      ) : (
                        <div className="py-12 flex flex-col items-center justify-center text-slate-500">
                          <ImageIcon className="w-10 h-10 mb-2 opacity-50" />
                          <span className="text-xs">No scan image attached</span>
                        </div>
                      )}

                      {/* Controls Overlay on Top of the Picture */}
                      <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5 bg-slate-900/85 backdrop-blur-xs p-1 rounded-lg border border-white/10 shadow-md">
                        {matchedDoc && !matchedDoc.filename.toLowerCase().endsWith('.pdf') && (
                          <button
                            type="button"
                            onClick={() => handleRotateScan(matchedDoc.id, 90)}
                            disabled={isRotating}
                            className="px-2 py-1 rounded-md text-[11px] font-medium text-white hover:bg-white/20 transition-colors flex items-center gap-1 cursor-pointer"
                            title="Rotate scan 90° clockwise if sideways"
                          >
                            <RotateCw className={`w-3.5 h-3.5 ${isRotating ? 'animate-spin' : ''}`} />
                            <span>Rotate 90°</span>
                          </button>
                        )}
                        {matchedDoc && (
                          <button
                            type="button"
                            onClick={() => {
                              setPreviewModalDoc(matchedDoc);
                              setModalZoom(1);
                            }}
                            className="px-2 py-1 rounded-md text-[11px] font-medium text-white hover:bg-white/20 transition-colors flex items-center gap-1 cursor-pointer"
                            title="Enlarge scan in high-resolution viewer with zoom controls"
                          >
                            <Maximize2 className="w-3.5 h-3.5" />
                            <span>Enlarge</span>
                          </button>
                        )}
                      </div>

                      <div className="absolute bottom-2 left-2 pointer-events-none">
                        <span className="px-2 py-0.5 rounded bg-black/70 text-slate-300 text-[10px] font-mono backdrop-blur-xs">
                          Click image to zoom in high definition
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* 2. BELOW THE PICTURE: GOOGLE SHEET VERSION & EXTRACTED/EDITABLE CORRECTION */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Left: Current Google Sheet Registered Version */}
                    <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 flex flex-col justify-between space-y-2">
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            Current Google Sheet Record
                          </span>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                            {flag.fieldName || flag.field}
                          </span>
                        </div>
                        <div className="mt-2 font-mono font-bold text-slate-800 dark:text-slate-100 text-sm sm:text-base break-all bg-white dark:bg-slate-950 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 shadow-xs">
                          {flag.sheetValue ? (
                            flag.sheetValue
                          ) : (
                            <span className="italic font-normal text-slate-400 text-xs">
                              (Blank / Unfilled in Master Sheet)
                            </span>
                          )}
                        </div>
                      </div>
                      <p className="text-[11px] text-slate-400">
                        This is what currently appears in the student's row in Google Sheets.
                      </p>
                    </div>

                    {/* Right: AI Extracted Value & Editable Correction Input */}
                    <div className="p-4 rounded-xl bg-brand-primary/5 dark:bg-brand-primary/10 border border-brand-primary/30 dark:border-brand-primary/40 flex flex-col justify-between space-y-2">
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-brand-primary flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5" />
                            Extracted / Suggested Correction
                          </span>
                          {isUserEdited ? (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                              User Modified
                            </span>
                          ) : (
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-brand-primary/10 text-brand-primary">
                              AI Vision
                            </span>
                          )}
                        </div>

                        {/* Editable Input */}
                        <div className="relative mt-2">
                          <input
                            type="text"
                            value={currentInputVal}
                            onChange={(e) =>
                              setEditedValues((prev) => ({
                                ...prev,
                                [flag.id]: e.target.value,
                              }))
                            }
                            placeholder="Enter or fix corrected value..."
                            className="w-full px-3 py-2 text-xs sm:text-sm font-mono font-bold rounded-lg border border-brand-primary/40 focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20 bg-white dark:bg-slate-900 text-brand-text-primary shadow-xs outline-hidden"
                          />
                        </div>
                      </div>

                      <div className="flex items-start gap-1 text-[11px] text-slate-500 dark:text-slate-400">
                        <Edit2 className="w-3.5 h-3.5 text-brand-primary flex-shrink-0 mt-0.5" />
                        <span>
                          Check the scan image above. You can directly edit any mistyped letters or numbers before applying.
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Resolution Action Buttons */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-brand-border/60">
                    <button
                      type="button"
                      onClick={() => handleDismissFlag(flag.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                      title="Keep current Google Sheet value and dismiss this warning"
                    >
                      <Check className="w-3.5 h-3.5 text-slate-400" />
                      <span>Dismiss (Keep Sheet Value)</span>
                    </button>

                    <button
                      type="button"
                      disabled={isApplying || !currentInputVal.trim()}
                      onClick={() => handleApplyCorrection(flag)}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-brand-primary hover:bg-brand-primary-hover shadow-sm active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
                    >
                      {isApplying ? (
                        <>
                          <div className="w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                          <span>Applying to Google Sheet...</span>
                        </>
                      ) : isAppliedSuccess ? (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-white" />
                          <span>Applied!</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4" />
                          <span>Apply Correction to Google Sheet</span>
                        </>
                      )}
                    </button>
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
                          src={doc.url}
                          alt={doc.filename}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
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
                      onClick={() => handleReprocessDoc(selectedDoc.id)}
                      disabled={isReprocessing}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 transition-colors active:scale-95 disabled:opacity-50"
                      title="Rescan this document with Gemini Vision OCR"
                    >
                      <Sparkles className={`w-3.5 h-3.5 ${isReprocessing ? 'animate-spin' : ''}`} />
                      <span>Rescan AI</span>
                    </button>

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
                  {selectedDoc.filename.toLowerCase().endsWith('.pdf') ? (
                    <iframe
                      src={selectedDoc.url}
                      className="w-full h-[380px] rounded border-0"
                      title={selectedDoc.originalFilename}
                    />
                  ) : (
                    <img
                      src={selectedDoc.url}
                      alt={selectedDoc.originalFilename}
                      className="max-h-[380px] w-auto object-contain rounded transition-transform group-hover:scale-102"
                    />
                  )}
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
                      <span>AI Extracted Record (Target Student)</span>
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
                      <span className="text-[10px] text-brand-text-secondary block">
                        {selectedDoc.classification === 'FATHER_CNIC_FRONT' ? 'Father (Cardholder)' : 'Father Name'}
                      </span>
                      <span className="font-semibold text-brand-text-primary">
                        {selectedDoc.extractedData.fatherName || 'Not detected'}
                      </span>
                    </div>
                    {selectedDoc.extractedData.paternalGrandfatherName && (
                      <div>
                        <span className="text-[10px] text-brand-text-secondary block">Paternal Grandfather</span>
                        <span className="font-semibold text-slate-700 dark:text-slate-300">
                          {selectedDoc.extractedData.paternalGrandfatherName}
                        </span>
                      </div>
                    )}
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

                {/* Multi-Child CRC Sibling Entries Table */}
                {selectedDoc.extractedData.children && selectedDoc.extractedData.children.length > 0 && (
                  <div className="bg-brand-bg rounded-xl p-3 border border-brand-border text-xs space-y-2.5 animate-fadeIn">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-brand-text-primary">
                        <FileText className="w-3.5 h-3.5 text-brand-primary" />
                        <span>All Siblings on this B-Form Certificate ({selectedDoc.extractedData.children.length})</span>
                      </div>
                      <span className="text-[10px] text-brand-text-secondary">
                        Click &apos;Select&apos; to switch target student entry
                      </span>
                    </div>

                    <div className="overflow-x-auto custom-scrollbar">
                      <table className="w-full text-left border-collapse text-[11px]">
                        <thead>
                          <tr className="border-b border-brand-border/80 text-brand-text-secondary uppercase text-[10px]">
                            <th className="py-1.5 px-2">#</th>
                            <th className="py-1.5 px-2">Child Name</th>
                            <th className="py-1.5 px-2">B-Form / Citizen #</th>
                            <th className="py-1.5 px-2">DOB / Gender</th>
                            <th className="py-1.5 px-2 text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-brand-border/40 font-medium">
                          {selectedDoc.extractedData.children.map((ch, idx) => {
                            const isTarget =
                              (ch.bFormNo && ch.bFormNo.replace(/\D/g, '') === (selectedDoc.extractedData.bFormNo || '').replace(/\D/g, '')) ||
                              (ch.name && selectedDoc.extractedData.studentName && ch.name.toLowerCase().trim() === selectedDoc.extractedData.studentName.toLowerCase().trim());

                            return (
                              <tr
                                key={idx}
                                className={`transition-colors ${
                                  isTarget
                                    ? 'bg-brand-primary/10 text-brand-text-primary font-bold'
                                    : 'hover:bg-white/60 dark:hover:bg-slate-800/60 text-brand-text-secondary'
                                }`}
                              >
                                <td className="py-2 px-2 font-mono">{ch.entryNo || idx + 1}</td>
                                <td className="py-2 px-2">
                                  <div className="text-brand-text-primary font-semibold">
                                    {ch.name || 'Unnamed Entry'}
                                  </div>
                                  {ch.nameUrdu && (
                                    <div className="text-[10px] text-slate-400 font-normal">
                                      {ch.nameUrdu}
                                    </div>
                                  )}
                                  {ch.hasTickMark && (
                                    <span className="inline-block mt-0.5 px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300">
                                      ✓ Marked in Scan
                                    </span>
                                  )}
                                </td>
                                <td className="py-2 px-2 font-mono text-emerald-600 dark:text-emerald-400">
                                  {ch.bFormNo || 'N/A'}
                                </td>
                                <td className="py-2 px-2">
                                  <div>{ch.dob || '—'}</div>
                                  {ch.gender && (
                                    <span className="text-[10px] text-slate-400">{ch.gender}</span>
                                  )}
                                </td>
                                <td className="py-2 px-2 text-right">
                                  {isTarget ? (
                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 inline-flex items-center gap-1">
                                      <Check className="w-3 h-3" /> Selected
                                    </span>
                                  ) : (
                                    <button
                                      type="button"
                                      disabled={isSelectingChild}
                                      onClick={() => handleSelectChild(ch.entryNo || idx + 1)}
                                      className="px-2 py-1 rounded text-[10px] font-semibold bg-white dark:bg-slate-800 border border-brand-border hover:border-brand-primary text-brand-primary transition-all cursor-pointer active:scale-95 disabled:opacity-50"
                                    >
                                      Select Target
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
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
        <div className="fixed inset-0 z-[110] bg-black/85 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 animate-fadeIn">
          <div className="bg-white dark:bg-brand-surface rounded-2xl max-w-5xl w-full p-4 border border-brand-border space-y-3 shadow-2xl flex flex-col max-h-[92vh]">
            <div className="flex items-center justify-between pb-2 border-b border-brand-border">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold text-brand-primary">
                  GR #{previewModalDoc.grNo}
                </span>
                <span className="text-slate-400">•</span>
                <span className="text-xs font-semibold text-brand-text-primary">
                  {DOCUMENT_LABELS[previewModalDoc.classification] || previewModalDoc.classification}
                </span>
                <span className="text-[11px] text-brand-text-secondary font-mono truncate max-w-[180px] sm:max-w-[300px]">
                  ({previewModalDoc.originalFilename})
                </span>
              </div>

              <div className="flex items-center gap-2">
                {/* Rotate 90 inside modal */}
                {!previewModalDoc.filename.toLowerCase().endsWith('.pdf') && (
                  <button
                    type="button"
                    onClick={() => handleRotateScan(previewModalDoc.id, 90)}
                    disabled={isRotating}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center gap-1 cursor-pointer border border-brand-border"
                    title="Rotate document 90° clockwise"
                  >
                    <RotateCw className={`w-3.5 h-3.5 ${isRotating ? 'animate-spin' : ''}`} />
                    <span className="hidden sm:inline">Rotate 90°</span>
                  </button>
                )}

                {/* Zoom Controls */}
                {!previewModalDoc.filename.toLowerCase().endsWith('.pdf') && (
                  <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5 border border-brand-border">
                    <button
                      type="button"
                      onClick={() => setModalZoom((z) => Math.max(0.5, Number((z - 0.25).toFixed(2))))}
                      className="p-1 rounded hover:bg-white dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors"
                      title="Zoom Out"
                    >
                      <ZoomOut className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-[11px] font-mono px-2 text-brand-text-secondary">
                      {Math.round(modalZoom * 100)}%
                    </span>
                    <button
                      type="button"
                      onClick={() => setModalZoom((z) => Math.min(3, Number((z + 0.25).toFixed(2))))}
                      className="p-1 rounded hover:bg-white dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors"
                      title="Zoom In"
                    >
                      <ZoomIn className="w-3.5 h-3.5" />
                    </button>
                    {modalZoom !== 1 && (
                      <button
                        type="button"
                        onClick={() => setModalZoom(1)}
                        className="text-[10px] font-semibold px-1.5 py-0.5 ml-1 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-300"
                        title="Reset Zoom"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                )}

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
                  onClick={() => {
                    setPreviewModalDoc(null);
                    setModalZoom(1);
                  }}
                  className="p-1.5 rounded-lg text-brand-text-secondary hover:text-brand-text-primary hover:bg-brand-bg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto bg-slate-950 rounded-xl p-3 flex items-center justify-center min-h-[420px] max-h-[75vh]">
              {previewModalDoc.filename.toLowerCase().endsWith('.pdf') ? (
                <iframe
                  src={previewModalDoc.url}
                  className="w-full h-[68vh] rounded border-0"
                  title={previewModalDoc.originalFilename}
                />
              ) : (
                <div className="overflow-auto max-w-full max-h-full flex items-center justify-center">
                  <img
                    src={previewModalDoc.url}
                    alt={previewModalDoc.originalFilename}
                    style={{
                      transform: `scale(${modalZoom})`,
                      transformOrigin: 'center center',
                      transition: 'transform 0.15s ease-out',
                    }}
                    className="max-h-[70vh] w-auto object-contain rounded shadow-lg"
                  />
                </div>
              )}
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

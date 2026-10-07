import React, { useRef } from 'react';
import {
  DOCUMENT_LABELS,
} from '../../types/documentArchive';
import { StudentRecord } from '../../services/googleSheetsService';
import { ProcessingTransparencyModal } from '../documents/ProcessingTransparencyModal';
import { useToast } from '../../hooks/useToast';
import { DocumentPreviewModal } from '../ui/DocumentPreviewModal';
import {
  ShieldCheck,
  AlertTriangle,
  FileText,
  UploadCloud,
} from 'lucide-react';
import { useStudentDocuments } from './documents/useStudentDocuments';
import { DocumentScansList } from './documents/DocumentScansList';
import { SelectedDocumentInspector } from './documents/SelectedDocumentInspector';
import { DocumentDiscrepancyReview } from './documents/DocumentDiscrepancyReview';
import { StudentDocumentsHeader } from './documents/StudentDocumentsHeader';

interface StudentDocumentsTabProps {
  student: StudentRecord;
  onEditStudent?: (updated: StudentRecord) => void;
}

export const StudentDocumentsTab: React.FC<StudentDocumentsTabProps> = ({
  student,
  onEditStudent,
}) => {
  const { showToast, ToastComponent } = useToast(3500);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    dossier,
    discrepancies,
    loading,
    selectedDoc,
    setSelectedDoc,
    isRotating,
    isChangingTag,
    isUploading,
    uploadStatus,
    uploadError,
    setUploadError,
    activeJob,
    isTransparencyModalOpen,
    setIsTransparencyModalOpen,
    previewModalDoc,
    setPreviewModalDoc,
    isAutoLinking,
    isReprocessing,
    isSelectingChild,
    actionSuccessMsg,
    editedValues,
    setEditedValues,
    applyingFlagId,
    isBatchApplying,
    applySuccessId,
    handleUpload,
    handleRotateScan,
    handleRotate,
    handleTagChange,
    handleDismissFlag,
    handleUndismissFlag,
    handleApplyCorrection,
    handleApplyAllSuggestions,
    handleAutoLink,
    handleSelectChild,
    handleReprocessDoc,
    handleReprocessDossier,
  } = useStudentDocuments(student, onEditStudent, showToast);

  if (loading) {
    return (
      <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-3">
        <div className="w-8 h-8 rounded-full border-2 border-brand-primary border-t-transparent animate-spin" />
        <span className="text-xs">Loading student archive documents...</span>
      </div>
    );
  }

  const VALID_SHEET_FIELDS = new Set(['studentName', 'fatherName', 'bFormNo', 'parentCnic', 'dob']);
  const activeFlags = discrepancies.filter((f) => !f.isDismissed && VALID_SHEET_FIELDS.has(f.field));
  const dismissedFlags = discrepancies.filter((f) => f.isDismissed && VALID_SHEET_FIELDS.has(f.field));

  return (
    <div className="space-y-4">
      <StudentDocumentsHeader
        dossier={dossier}
        studentGrNo={student.grNo}
        activeFlagsCount={activeFlags.length}
        fileInputRef={fileInputRef}
        isReprocessing={isReprocessing}
        isAutoLinking={isAutoLinking}
        isUploading={isUploading}
        actionSuccessMsg={actionSuccessMsg}
        uploadError={uploadError}
        uploadStatus={uploadStatus}
        activeJob={activeJob}
        onReprocessDossier={handleReprocessDossier}
        onAutoLink={handleAutoLink}
        onClearUploadError={() => setUploadError(null)}
        onOpenTransparencyModal={() => setIsTransparencyModalOpen(true)}
        onFileInputChange={handleUpload}
      />

      {/* Discrepancy review section */}
      <DocumentDiscrepancyReview
        activeFlags={activeFlags}
        dossier={dossier}
        editedValues={editedValues}
        applyingFlagId={applyingFlagId}
        applySuccessId={applySuccessId}
        isBatchApplying={isBatchApplying}
        isRotating={isRotating}
        onEditValue={(id, val) => setEditedValues((prev) => ({ ...prev, [id]: val }))}
        onRotateScan={handleRotateScan}
        onPreviewModalDoc={setPreviewModalDoc}
        onDismissFlag={handleDismissFlag}
        onApplyCorrection={handleApplyCorrection}
        onApplyAllSuggestions={handleApplyAllSuggestions}
      />

      {/* Dismissed Flags Accordion */}
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

      {/* Missing Documents Alert */}
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

      {/* Split Explorer view or Empty state */}
      {dossier && dossier.documents.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <DocumentScansList
            dossier={dossier}
            selectedDoc={selectedDoc}
            onSelectDoc={setSelectedDoc}
          />
          <div className="md:col-span-2 bg-white dark:bg-brand-surface rounded-xl border border-brand-border p-4 flex flex-col space-y-3">
            <SelectedDocumentInspector
              selectedDoc={selectedDoc}
              isChangingTag={isChangingTag}
              isRotating={isRotating}
              isReprocessing={isReprocessing}
              isSelectingChild={isSelectingChild}
              onTagChange={handleTagChange}
              onRotate={handleRotate}
              onPreviewModal={setPreviewModalDoc}
              onReprocessDoc={handleReprocessDoc}
              onSelectChild={handleSelectChild}
            />
          </div>
        </div>
      ) : (
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

      {/* Modals & Toast */}
      <DocumentPreviewModal
        isOpen={!!previewModalDoc}
        document={previewModalDoc}
        onClose={() => setPreviewModalDoc(null)}
        onRotate={handleRotateScan}
        isRotating={isRotating}
      />

      {activeJob && (
        <ProcessingTransparencyModal
          jobId={activeJob.id}
          isOpen={isTransparencyModalOpen}
          onClose={() => setIsTransparencyModalOpen(false)}
        />
      )}

      {ToastComponent}
    </div>
  );
};

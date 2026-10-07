import React, { useState, useRef } from 'react';
import {
  uploadZipArchive,
  uploadIndividualFiles,
  assignDocumentToStudent,
} from '../services/documentClientService';
import {
  StudentDocumentRecord,
} from '../types/documentArchive';
import { StudentRecord } from '../services/googleSheetsService';
import { StudentDetailModal } from './records/StudentDetailModal';
import { ProcessingTransparencyModal } from './documents/ProcessingTransparencyModal';
import { DiscrepancyAuditTable, DiscrepancyAuditItem } from './documents/DiscrepancyAuditTable';
import { DocumentScansGrid } from './documents/DocumentScansGrid';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { useToast } from '../hooks/useToast';
import { useDocumentArchive } from '../hooks/useDocumentArchive';
import { ArchiveHeaderBanner } from './documents/archive/ArchiveHeaderBanner';
import { ArchiveFilterBar } from './documents/archive/ArchiveFilterBar';
import { AssignDocumentModal } from './documents/archive/AssignDocumentModal';
import { DocumentDetailPreviewModal } from './documents/archive/DocumentDetailPreviewModal';
import { DossiersGridView } from './documents/archive/DossiersGridView';
import { FolderOpen, ScanLine, ShieldAlert } from 'lucide-react';

export const DocumentArchiveCenterView: React.FC = () => {
  const [activeMainTab, setActiveMainTab] = useState<'dossiers' | 'extracted' | 'audit'>('dossiers');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClass, setSelectedClass] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'all' | 'flagged' | 'clean' | 'missing'>('all');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ percent: number; statusText: string } | null>(null);
  const [activeStudentModal, setActiveStudentModal] = useState<StudentRecord | null>(null);
  const [isTransparencyModalOpen, setIsTransparencyModalOpen] = useState(false);
  const [selectedPreviewDoc, setSelectedPreviewDoc] = useState<StudentDocumentRecord | null>(null);
  const [assigningDoc, setAssigningDoc] = useState<StudentDocumentRecord | null>(null);
  const [targetAssignGr, setTargetAssignGr] = useState('');
  const { showToast, ToastComponent } = useToast(4000);

  const {
    dossiers,
    documents,
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
  } = useDocumentArchive(showToast);

  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderZipInputRef = useRef<HTMLInputElement>(null);

  const filteredDossiers = dossiers.filter((d) => {
    if (selectedClass !== 'ALL' && d.currentClass !== selectedClass) return false;
    if (statusFilter === 'flagged' && d.allFlags.length === 0) return false;
    if (statusFilter === 'clean' && (d.allFlags.length > 0 || d.hasMissingDocuments)) return false;
    if (statusFilter === 'missing' && !d.hasMissingDocuments) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        d.grNo.toLowerCase().includes(q) ||
        d.studentName.toLowerCase().includes(q) ||
        d.fatherName.toLowerCase().includes(q) ||
        (d.bFormNo && d.bFormNo.includes(q))
      );
    }
    return true;
  });

  const allDiscrepancies: DiscrepancyAuditItem[] = dossiers.flatMap((d) =>
    d.allFlags.map((f) => ({ grNo: d.grNo, studentName: d.studentName, currentClass: d.currentClass, flag: f }))
  );

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {ToastComponent}
      <input type="file" ref={folderZipInputRef} accept=".zip" className="hidden" onChange={async (e) => {
        const file = e.target.files?.[0];
        if (file) {
          setIsUploading(true);
          try {
            const job = await uploadZipArchive(file, (p, s) => setUploadProgress({ percent: p, statusText: s || '' }));
            setActiveJob(job);
            setIsTransparencyModalOpen(true);
            await refreshData();
          } finally {
            setIsUploading(false);
            setUploadProgress(null);
          }
        }
      }} />
      <input type="file" ref={fileInputRef} multiple accept="image/*,.pdf" className="hidden" onChange={async (e) => {
        const fileList = Array.from(e.target.files || []) as File[];
        const files: Array<{ file: File; grNo?: string }> = fileList.map((f: File) => ({ file: f }));
        if (files.length > 0) {
          setIsUploading(true);
          try {
            const job = await uploadIndividualFiles(files, (p) => setUploadProgress({ percent: p, statusText: `Uploading ${files.length} files...` }));
            setActiveJob(job);
            setIsTransparencyModalOpen(true);
            await refreshData();
          } finally {
            setIsUploading(false);
            setUploadProgress(null);
          }
        }
      }} />

      <ArchiveHeaderBanner
        activeJob={activeJob}
        dossiersCount={dossiers.length}
        documentsCount={documents.length}
        flaggedCount={allDiscrepancies.length}
        isUploading={isUploading}
        uploadProgress={uploadProgress}
        onOpenTransparency={() => setIsTransparencyModalOpen(true)}
        onUploadZipClick={() => folderZipInputRef.current?.click()}
        onUploadFilesClick={() => fileInputRef.current?.click()}
      />

      <ArchiveFilterBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        selectedClass={selectedClass}
        onClassChange={setSelectedClass}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        isAutoLinking={isAutoLinking}
        onAutoLink={handleAutoLink}
        isRescanningAll={isRescanningAll}
        onRescanAll={handleRescanAll}
        onDownloadReport={() => window.open(`/api/documents/export/zip?class=${encodeURIComponent(selectedClass)}`, '_blank')}
      />

      <div className="flex border-b border-brand-border bg-white dark:bg-brand-surface rounded-2xl p-1 shadow-soft">
        <button
          type="button"
          onClick={() => setActiveMainTab('dossiers')}
          className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer ${
            activeMainTab === 'dossiers' ? 'bg-brand-primary text-white shadow-xs' : 'text-brand-text-secondary hover:text-brand-text-primary'
          }`}
        >
          <FolderOpen className="w-4 h-4" /> Student Dossiers ({filteredDossiers.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveMainTab('extracted')}
          className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer ${
            activeMainTab === 'extracted' ? 'bg-brand-primary text-white shadow-xs' : 'text-brand-text-secondary hover:text-brand-text-primary'
          }`}
        >
          <ScanLine className="w-4 h-4" /> Document Scans ({documents.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveMainTab('audit')}
          className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer ${
            activeMainTab === 'audit' ? 'bg-brand-primary text-white shadow-xs' : 'text-brand-text-secondary hover:text-brand-text-primary'
          }`}
        >
          <ShieldAlert className="w-4 h-4" /> Discrepancy Audit ({allDiscrepancies.length})
        </button>
      </div>

      {activeMainTab === 'dossiers' && (
        <DossiersGridView
          dossiers={filteredDossiers}
          onPreviewDoc={setSelectedPreviewDoc}
          onOpenStudentModal={(gr) => {
            const s = sheetRecords.find((r) => String(r.grNo || r['G.R.NO'] || '').trim() === gr);
            if (s) setActiveStudentModal(s);
          }}
        />
      )}

      {activeMainTab === 'extracted' && (
        <DocumentScansGrid
          filteredDocuments={documents}
          selectedDocIds={selectedDocIds}
          isOperatingDoc={isOperatingDoc}
          onToggleSelectDoc={handleToggleSelectDoc}
          onToggleSelectAll={handleToggleSelectAll}
          onClearSelection={() => setSelectedDocIds([])}
          onBatchDeletePrompt={() => setConfirmDialog({
            isOpen: true,
            title: `Delete ${selectedDocIds.length} Document Scans?`,
            message: `Permanently delete ${selectedDocIds.length} document scans?`,
            onConfirm: handleBatchDeleteDocs,
          })}
          onPreviewDoc={setSelectedPreviewDoc}
          onRescanDoc={handleRescanDoc}
          onDeleteDocPrompt={handleDeleteDoc}
          onAssignDocPrompt={setAssigningDoc}
          onOpenStudentModal={(gr) => {
            const s = sheetRecords.find((r) => String(r.grNo || r['G.R.NO'] || '').trim() === gr);
            if (s) setActiveStudentModal(s);
          }}
        />
      )}

      {activeMainTab === 'audit' && (
        <DiscrepancyAuditTable
          filteredDiscrepancies={allDiscrepancies}
          documents={documents}
          applyingFlagId={applyingFlagId}
          isBatchApplying={isBatchApplying}
          onPreviewDoc={setSelectedPreviewDoc}
          onApplyCorrection={handleApplyCorrection}
          onBatchApplyCorrections={handleBatchApplyCorrections}
          onResolveWithCandidate={async (docId, cand) => {
            await assignDocumentToStudent(docId, cand.grNo);
            await refreshData();
          }}
          onDismissFlag={async (id) => {
            await dismissDiscrepancyFlag(id);
            await refreshData();
          }}
          onOpenStudentModal={(gr) => {
            const s = sheetRecords.find((r) => String(r.grNo || r['G.R.NO'] || '').trim() === gr);
            if (s) setActiveStudentModal(s);
          }}
        />
      )}

      {activeJob && (
        <ProcessingTransparencyModal
          jobId={activeJob.id}
          isOpen={isTransparencyModalOpen}
          onClose={() => setIsTransparencyModalOpen(false)}
        />
      )}

      <AssignDocumentModal
        isOpen={Boolean(assigningDoc)}
        onClose={() => setAssigningDoc(null)}
        document={assigningDoc}
        targetGr={targetAssignGr}
        onTargetGrChange={setTargetAssignGr}
        onAssign={() => {
          if (assigningDoc && targetAssignGr.trim()) {
            handleAssignDoc(assigningDoc.id, targetAssignGr);
            setAssigningDoc(null);
            setTargetAssignGr('');
          }
        }}
        isOperating={isOperatingDoc}
      />

      <DocumentDetailPreviewModal
        document={selectedPreviewDoc}
        onClose={() => setSelectedPreviewDoc(null)}
        onRescan={handleRescanDoc}
        onDelete={handleDeleteDoc}
        isOperating={isOperatingDoc}
      />

      {activeStudentModal && (
        <StudentDetailModal
          isOpen={Boolean(activeStudentModal)}
          onClose={() => setActiveStudentModal(null)}
          student={activeStudentModal}
        />
      )}

      {confirmDialog && (
        <ConfirmDialog
          isOpen={confirmDialog.isOpen}
          title={confirmDialog.title}
          message={confirmDialog.message}
          onConfirm={confirmDialog.onConfirm}
          onCancel={() => setConfirmDialog(null)}
        />
      )}
    </div>
  );
};

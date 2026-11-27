import React, { useState, useRef, useMemo } from 'react';
import {
  uploadZipArchive,
  uploadIndividualFiles,
  assignDocumentToStudent,
  getExportZipUrl,
} from '../services/documentClientService';
import { StudentDocumentRecord } from '../types/documentArchive';
import { StudentRecord } from '../services/googleSheetsService';
import { StudentDetailModal } from './records/StudentDetailModal';
import { ProcessingTransparencyModal } from './documents/ProcessingTransparencyModal';
import { DiscrepancyAuditTable, DiscrepancyAuditItem } from './documents/DiscrepancyAuditTable';
import { DocumentScansGrid } from './documents/DocumentScansGrid';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { useToast } from '../hooks/useToast';
import { useDocumentArchive } from '../hooks/useDocumentArchive';
import { useDriveImport } from '../hooks/useDocumentArchive/useDriveImport';
import { parseClientFolderGr } from '../hooks/useDocumentArchive/driveImportState';
import { toUserErrorMessage } from '../utils/userMessage';
import { ArchiveHeaderBanner } from './documents/archive/ArchiveHeaderBanner';
import { DriveImportPanel } from './documents/archive/DriveImportPanel';
import { ArchiveFilterBar } from './documents/archive/ArchiveFilterBar';
import { AssignDocumentModal } from './documents/archive/AssignDocumentModal';
import { DocumentDetailPreviewModal } from './documents/archive/DocumentDetailPreviewModal';
import { DossiersGridView } from './documents/archive/DossiersGridView';
import {
  filterArchiveDossiers,
  filterArchiveDocuments,
  buildStudentModalFallback,
} from './documents/archive/archiveFilters';
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

  const archive = useDocumentArchive(showToast);
  const {
    dossiers,
    documents,
    aiConfigured,
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
  } = archive;

  const drive = useDriveImport({
    sheetRecords,
    onActiveJobChange: setActiveJob,
    onRefreshArchive: refreshData,
    showToast,
  });

  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderZipInputRef = useRef<HTMLInputElement>(null);

  const dossierByGr = useMemo(() => new Map(dossiers.map((d) => [d.grNo, d])), [dossiers]);

  const filteredDossiers = useMemo(
    () => filterArchiveDossiers(dossiers, selectedClass, statusFilter, searchQuery),
    [dossiers, selectedClass, statusFilter, searchQuery]
  );

  const filteredDocuments = useMemo(
    () => filterArchiveDocuments(documents, dossierByGr, selectedClass, statusFilter, searchQuery),
    [documents, dossierByGr, selectedClass, statusFilter, searchQuery]
  );

  const allDiscrepancies: DiscrepancyAuditItem[] = dossiers.flatMap((d) =>
    d.allFlags.map((f) => ({ grNo: d.grNo, studentName: d.studentName, currentClass: d.currentClass, flag: f }))
  );

  const openStudentDossier = (gr: string) => {
    const resolved = buildStudentModalFallback(gr, sheetRecords, dossiers);
    if (resolved) {
      setActiveStudentModal(resolved);
      return;
    }
    showToast(`Student GR #${gr.trim()} not found`, 'error');
  };

  const handleDownloadZip = () => {
    const url = getExportZipUrl(selectedClass);
    const a = document.createElement('a');
    a.href = url;
    a.download = selectedClass === 'ALL' ? 'PHSSJ_All_Students_Documents.zip' : `PHSSJ_Class_${selectedClass}_Documents.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const handleIndividualUploadChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputEl = e.currentTarget;
    const fileList = Array.from(inputEl.files || []) as File[];
    inputEl.value = '';
    if (fileList.length === 0) return;

    const batchTag = `pkt_${Date.now()}`;
    const files = fileList.map((f) => {
      const rel = (f as any).webkitRelativePath as string | undefined;
      const folderSeg = rel && rel.includes('/') ? rel.split('/').slice(-2, -1)[0] : '';
      const parsedGr = folderSeg ? parseClientFolderGr(folderSeg) : parseClientFolderGr(f.name);
      return {
        file: f,
        grNo: parsedGr || undefined,
        folderName: folderSeg || undefined,
        packetId: folderSeg ? `${batchTag}_${folderSeg}` : undefined,
        parsedFolderGrNo: parsedGr || undefined,
      };
    });

    setIsUploading(true);
    try {
      const job = await uploadIndividualFiles(files, (p, s) =>
        setUploadProgress({ percent: p, statusText: s || `Uploading ${files.length} file${files.length === 1 ? '' : 's'}…` })
      );
      setActiveJob(job);
      setIsTransparencyModalOpen(true);
      await refreshData();
    } catch (err: any) {
      showToast(toUserErrorMessage(err, 'File upload failed'), 'error');
    } finally {
      setIsUploading(false);
      setUploadProgress(null);
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {ToastComponent}
      <input
        type="file"
        ref={folderZipInputRef}
        accept=".zip"
        className="hidden"
        onChange={async (e) => {
          const inputEl = e.currentTarget;
          const file = inputEl.files?.[0];
          inputEl.value = '';
          if (!file) return;
          setIsUploading(true);
          try {
            const job = await uploadZipArchive(file, (p, s) => setUploadProgress({ percent: p, statusText: s || '' }));
            setActiveJob(job);
            setIsTransparencyModalOpen(true);
            await refreshData();
          } catch (err: any) {
            showToast(toUserErrorMessage(err, 'ZIP upload failed'), 'error');
          } finally {
            setIsUploading(false);
            setUploadProgress(null);
          }
        }}
      />
      <input
        type="file"
        ref={fileInputRef}
        multiple
        accept="image/*,.pdf"
        className="hidden"
        onChange={handleIndividualUploadChange}
      />

      <ArchiveHeaderBanner
        activeJob={activeJob}
        aiConfigured={aiConfigured}
        manualReviewCount={documents.filter((d) => d.status === 'manual_review').length}
        dossiersCount={dossiers.length}
        documentsCount={documents.length}
        flaggedCount={allDiscrepancies.length}
        isUploading={isUploading}
        uploadProgress={uploadProgress}
        onOpenTransparency={() => setIsTransparencyModalOpen(true)}
        onUploadZipClick={() => folderZipInputRef.current?.click()}
        onUploadFilesClick={() => fileInputRef.current?.click()}
      />

      <DriveImportPanel
        driveState={drive.driveState}
        incrementalSync={drive.incrementalSync}
        isAdmin={isAdmin}
        isResettingArchive={isResettingArchive}
        onToggleIncrementalSync={drive.setIncrementalSync}
        onFolderInputChange={drive.setFolderInput}
        onStartImport={drive.startImport}
        onForceRescan={drive.forceRescanImport}
        onResetCache={drive.resetDriveCache}
        onPauseImport={drive.pauseImport}
        onResumeImport={drive.resumeImport}
        onStopImport={drive.stopImport}
        onConnectDrive={drive.connectGoogleDrive}
        onResetArchiveForTesting={handleResetArchiveForTesting}
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
        onDownloadReport={handleDownloadZip}
      />

      <div className="flex border-b border-brand-border bg-white dark:bg-brand-surface rounded-2xl p-1 shadow-soft">
        <button
          type="button"
          onClick={() => setActiveMainTab('dossiers')}
          className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-[color,background-color,border-color,box-shadow] flex items-center justify-center gap-2 cursor-pointer ${
            activeMainTab === 'dossiers' ? 'bg-brand-primary text-white shadow-xs' : 'text-brand-text-secondary hover:text-brand-text-primary'
          }`}
        >
          <FolderOpen className="w-4 h-4" /> Student Folders ({filteredDossiers.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveMainTab('extracted')}
          className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-[color,background-color,border-color,box-shadow] flex items-center justify-center gap-2 cursor-pointer ${
            activeMainTab === 'extracted' ? 'bg-brand-primary text-white shadow-xs' : 'text-brand-text-secondary hover:text-brand-text-primary'
          }`}
        >
          <ScanLine className="w-4 h-4" /> Documents ({filteredDocuments.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveMainTab('audit')}
          className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-[color,background-color,border-color,box-shadow] flex items-center justify-center gap-2 cursor-pointer ${
            activeMainTab === 'audit' ? 'bg-brand-primary text-white shadow-xs' : 'text-brand-text-secondary hover:text-brand-text-primary'
          }`}
        >
          <ShieldAlert className="w-4 h-4" /> Mismatches ({allDiscrepancies.length})
        </button>
      </div>

      {activeMainTab === 'dossiers' && (
        <DossiersGridView
          dossiers={filteredDossiers}
          onPreviewDoc={setSelectedPreviewDoc}
          onOpenStudentModal={openStudentDossier}
        />
      )}

      {activeMainTab === 'extracted' && (
        <DocumentScansGrid
          filteredDocuments={filteredDocuments}
          selectedDocIds={selectedDocIds}
          isOperatingDoc={isOperatingDoc}
          onToggleSelectDoc={handleToggleSelectDoc}
          onToggleSelectAll={handleToggleSelectAll}
          onClearSelection={() => setSelectedDocIds([])}
          onBatchDeletePrompt={() =>
            setConfirmDialog({
              isOpen: true,
              title: `Delete ${selectedDocIds.length} Documents?`,
              message: `Permanently delete ${selectedDocIds.length} documents?`,
              onConfirm: handleBatchDeleteDocs,
            })
          }
          onPreviewDoc={setSelectedPreviewDoc}
          onRescanDoc={handleRescanDoc}
          onDeleteDocPrompt={handleDeleteDoc}
          onAssignDocPrompt={setAssigningDoc}
          onOpenStudentModal={openStudentDossier}
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
          onOpenStudentModal={openStudentDossier}
        />
      )}

      {activeJob && (
        <ProcessingTransparencyModal
          jobId={activeJob.id}
          isOpen={isTransparencyModalOpen}
          onClose={() => setIsTransparencyModalOpen(false)}
          onJobUpdated={(updatedJob) => setActiveJob(updatedJob)}
        />
      )}

      <AssignDocumentModal
        isOpen={Boolean(assigningDoc)}
        onClose={() => setAssigningDoc(null)}
        document={assigningDoc}
        targetGr={targetAssignGr}
        onTargetGrChange={setTargetAssignGr}
        onAssign={async () => {
          if (assigningDoc && targetAssignGr.trim()) {
            await handleAssignDoc(assigningDoc.id, targetAssignGr);
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

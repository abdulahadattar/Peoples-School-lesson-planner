import React, { useState } from 'react';
import {
  StudentDossier,
  StudentDocumentRecord,
  DocumentClassificationType,
} from '../../../types/documentArchive';
import {
  updateDocumentTagOrRotation,
  uploadIndividualFiles,
} from '../../../services/documentClientService';

export function useDocumentUploadAndScan(
  studentGrNo: string,
  selectedDoc: StudentDocumentRecord | null,
  setSelectedDoc: React.Dispatch<React.SetStateAction<StudentDocumentRecord | null>>,
  previewModalDoc: StudentDocumentRecord | null,
  setPreviewModalDoc: React.Dispatch<React.SetStateAction<StudentDocumentRecord | null>>,
  setDossier: React.Dispatch<React.SetStateAction<StudentDossier | null>>,
  loadData: (quiet?: boolean) => Promise<void>,
  showToast?: (msg: string, type?: 'info' | 'error' | 'success') => void,
  setActionSuccessMsg?: (msg: string | null) => void
) {
  const [isRotating, setIsRotating] = useState(false);
  const [isChangingTag, setIsChangingTag] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [activeJob, setActiveJob] = useState<any | null>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files: File[] = e.target.files ? Array.from(e.target.files) : [];
    if (files.length === 0) return;

    try {
      setIsUploading(true);
      setUploadError(null);
      setUploadStatus(`Uploading ${files.length} document(s)...`);
      const job = await uploadIndividualFiles(
        files.map((file) => ({ file, grNo: studentGrNo })),
        (pct, msg) => {
          setUploadStatus(msg || `${pct}%`);
        }
      );
      setActiveJob(job);
      setUploadStatus('Uploaded! Processing scans in background...');
      setTimeout(() => {
        setUploadStatus(null);
        loadData(true);
      }, 2500);
    } catch (err: any) {
      setUploadError(err.message || 'Failed to upload document');
    } finally {
      setIsUploading(false);
      e.target.value = '';
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
      if (selectedDoc?.id === docId) setSelectedDoc(freshDoc);
      if (previewModalDoc?.id === docId) setPreviewModalDoc(freshDoc);
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
      setActionSuccessMsg?.(`Rotated scan ${angle}° clockwise.`);
      setTimeout(() => setActionSuccessMsg?.(null), 3000);
    } catch (err: any) {
      showToast?.(`Failed to rotate document: ${err.message}`, 'error');
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
        return { ...prev, documents: newDocs };
      });
      setActionSuccessMsg?.(`Updated scan classification to ${newTag}.`);
      setTimeout(() => setActionSuccessMsg?.(null), 3000);
    } catch (err) {
      showToast?.('Failed to update document tag', 'error');
    } finally {
      setIsChangingTag(false);
    }
  };

  return {
    isRotating,
    isChangingTag,
    isUploading,
    uploadStatus,
    uploadError,
    setUploadError,
    activeJob,
    handleUpload,
    handleRotateScan,
    handleRotate,
    handleTagChange,
  };
}

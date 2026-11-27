import React, { useState, useRef, useEffect } from 'react';
import {
  StudentDossier,
  StudentDocumentRecord,
  DocumentClassificationType,
} from '../../../types/documentArchive';
import {
  updateDocumentTagOrRotation,
  uploadIndividualFiles,
} from '../../../services/documentClientService';
import { toUserErrorMessage } from '../../../utils/userMessage';

export function useDocumentUploadAndScan(
  studentGrNo: string,
  selectedDoc: StudentDocumentRecord | null,
  setSelectedDoc: React.Dispatch<React.SetStateAction<StudentDocumentRecord | null>>,
  previewModalDoc: StudentDocumentRecord | null,
  setPreviewModalDoc: React.Dispatch<React.SetStateAction<StudentDocumentRecord | null>>,
  setDossier: React.Dispatch<React.SetStateAction<StudentDossier | null>>,
  loadData: (quiet?: boolean) => Promise<void>,
  showToast?: (msg: string, type?: 'info' | 'error' | 'success') => void,
  showActionSuccess?: (msg: string | null, durationMs?: number) => void
) {
  const [isRotating, setIsRotating] = useState(false);
  const [isChangingTag, setIsChangingTag] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [activeJob, setActiveJob] = useState<any | null>(null);
  const uploadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (uploadTimerRef.current) clearTimeout(uploadTimerRef.current);
    };
  }, []);

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
      setUploadStatus('Uploaded. Saving files...');
      if (uploadTimerRef.current) clearTimeout(uploadTimerRef.current);
      uploadTimerRef.current = setTimeout(() => {
        uploadTimerRef.current = null;
        setUploadStatus(null);
        loadData(true);
      }, 2500);
    } catch (err: any) {
      setUploadError(toUserErrorMessage(err, 'Failed to upload document'));
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
      showActionSuccess?.(`Rotated ${angle}° clockwise.`, 3000);
    } catch (err: any) {
      showToast?.(toUserErrorMessage(err, 'Failed to rotate document'), 'error');
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
      showActionSuccess?.('Updated document type.', 3000);
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

import { useState, useEffect } from 'react';
import {
  StudentDossier,
  StudentDocumentRecord,
  DocumentDiscrepancy,
} from '../../../types/documentArchive';
import {
  fetchDossierByGr,
  auditDossier,
  dismissDiscrepancyFlag,
  undismissDiscrepancyFlag,
  autoLinkDocuments,
  selectTargetChildClient,
  reprocessDocClient,
  reprocessDossierClient,
  applyDiscrepancyCorrectionClient,
  batchApplyDiscrepancyCorrectionsClient,
} from '../../../services/documentClientService';
import { getAccessToken } from '../../../services/googleAuth';
import { StudentRecord } from '../../../services/googleSheetsService';
import { resolveTargetField, applyFieldToStudent } from './studentCorrectionHelpers';
import { useDocumentUploadAndScan } from './useDocumentUploadAndScan';

export function useStudentDocuments(
  student: StudentRecord,
  onEditStudent?: (updated: StudentRecord) => void,
  showToast?: (msg: string, type?: 'info' | 'error' | 'success') => void
) {
  const [dossier, setDossier] = useState<StudentDossier | null>(null);
  const [discrepancies, setDiscrepancies] = useState<DocumentDiscrepancy[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDoc, setSelectedDoc] = useState<StudentDocumentRecord | null>(null);
  const [isTransparencyModalOpen, setIsTransparencyModalOpen] = useState(false);
  const [previewModalDoc, setPreviewModalDoc] = useState<StudentDocumentRecord | null>(null);
  const [isAutoLinking, setIsAutoLinking] = useState(false);
  const [isReprocessing, setIsReprocessing] = useState(false);
  const [isSelectingChild, setIsSelectingChild] = useState(false);
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);
  const [editedValues, setEditedValues] = useState<Record<string, string>>({});
  const [applyingFlagId, setApplyingFlagId] = useState<string | null>(null);
  const [isBatchApplying, setIsBatchApplying] = useState(false);
  const [applySuccessId, setApplySuccessId] = useState<string | null>(null);

  const loadData = async (quiet = false) => {
    try {
      if (!quiet) setLoading(true);
      const data = await fetchDossierByGr(student.grNo);
      setDossier(data);
      if (data && data.documents.length > 0) {
        setSelectedDoc((prev) => (prev ? data.documents.find((d) => d.id === prev.id) || data.documents[0] : data.documents[0]));
      }
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

  const uploadAndScan = useDocumentUploadAndScan(
    student.grNo,
    selectedDoc,
    setSelectedDoc,
    previewModalDoc,
    setPreviewModalDoc,
    setDossier,
    loadData,
    showToast,
    setActionSuccessMsg
  );

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
      const targetField = resolveTargetField(flag);

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
        onEditStudent(applyFieldToStudent(student, targetField, finalValue));
      }

      setDiscrepancies((prev) => prev.filter((f) => f.id !== flag.id));
      setApplySuccessId(flag.id);
      setActionSuccessMsg(res.message || `Applied correction: ${flag.fieldName || flag.field} updated to "${finalValue}".`);
      setTimeout(() => setActionSuccessMsg(null), 4000);
    } catch (err: any) {
      showToast?.(`Failed to apply correction: ${err.message}`, 'error');
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
      let updated = { ...student };

      const batchList = activeToApply.map((flag) => {
        const rawVal =
          editedValues[flag.id] !== undefined
            ? editedValues[flag.id]
            : flag.suggestedCorrection?.newValue || flag.extractedValue || '';
        const finalValue = rawVal.trim();
        const targetField = resolveTargetField(flag);
        updated = applyFieldToStudent(updated, targetField, finalValue);

        return {
          grNo: student.grNo,
          flagId: flag.id,
          field: targetField,
          newValue: finalValue,
          reason: 'Batch verified and applied by user',
        };
      });

      const res = await batchApplyDiscrepancyCorrectionsClient(batchList, token || undefined);
      if (onEditStudent) onEditStudent(updated);
      setDiscrepancies([]);
      setActionSuccessMsg(`Batch applied ${res.appliedCount} corrections! Google Sheet updated.`);
      setTimeout(() => setActionSuccessMsg(null), 4500);
    } catch (err: any) {
      showToast?.(`Batch apply error: ${err.message}`, 'error');
    } finally {
      setIsBatchApplying(false);
    }
  };

  const handleAutoLink = async () => {
    try {
      setIsAutoLinking(true);
      const res = await autoLinkDocuments([student]);
      setActionSuccessMsg(`Auto-Link complete: Matched ${res.totalMatched} documents!`);
      await loadData(true);
      setTimeout(() => setActionSuccessMsg(null), 4000);
    } catch (err: any) {
      showToast?.(`Auto-link error: ${err.message}`, 'error');
    } finally {
      setIsAutoLinking(false);
    }
  };

  const handleSelectChild = async (entryNoOrIndex: number) => {
    if (!selectedDoc) return;
    try {
      setIsSelectingChild(true);
      const res = await selectTargetChildClient(selectedDoc.id, entryNoOrIndex);
      setSelectedDoc(res);
      setActionSuccessMsg(`Selected sibling #${entryNoOrIndex} as active student target.`);
      await loadData(true);
      setTimeout(() => setActionSuccessMsg(null), 3500);
    } catch (err: any) {
      showToast?.(`Error selecting child: ${err.message}`, 'error');
    } finally {
      setIsSelectingChild(false);
    }
  };

  const handleReprocessDoc = async (docId: string) => {
    try {
      setIsReprocessing(true);
      const res = await reprocessDocClient(docId);
      setSelectedDoc(res);
      setActionSuccessMsg('Document rescanned and re-audited.');
      await loadData(true);
      setTimeout(() => setActionSuccessMsg(null), 4000);
    } catch (err: any) {
      showToast?.(`Error reprocessing scan: ${err.message}`, 'error');
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
      showToast?.(`Error reprocessing student dossier: ${err.message}`, 'error');
    } finally {
      setIsReprocessing(false);
    }
  };

  return {
    dossier,
    discrepancies,
    loading,
    selectedDoc,
    setSelectedDoc,
    ...uploadAndScan,
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
    handleDismissFlag,
    handleUndismissFlag,
    handleApplyCorrection,
    handleApplyAllSuggestions,
    handleAutoLink,
    handleSelectChild,
    handleReprocessDoc,
    handleReprocessDossier,
  };
}

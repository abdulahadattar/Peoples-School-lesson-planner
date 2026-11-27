import { useState, useEffect, useRef } from 'react';
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
import { toUserErrorMessage } from '../../../utils/userMessage';

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

  const requestSeqRef = useRef(0);
  const loadedGrRef = useRef<string | null>(null);
  const latestStudentRef = useRef(student);
  latestStudentRef.current = student;
  const actionMsgTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showActionSuccess = (msg: string | null, durationMs = 3500) => {
    if (actionMsgTimerRef.current) {
      clearTimeout(actionMsgTimerRef.current);
      actionMsgTimerRef.current = null;
    }
    setActionSuccessMsg(msg);
    if (msg) {
      actionMsgTimerRef.current = setTimeout(() => {
        actionMsgTimerRef.current = null;
        setActionSuccessMsg(null);
      }, durationMs);
    }
  };

  useEffect(() => {
    return () => {
      if (actionMsgTimerRef.current) clearTimeout(actionMsgTimerRef.current);
    };
  }, []);

  const loadData = async (quiet = false) => {
    const seq = ++requestSeqRef.current;
    const targetStudent = latestStudentRef.current;
    const targetGr = targetStudent.grNo;

    try {
      if (!quiet) setLoading(true);
      const data = await fetchDossierByGr(targetGr);
      if (seq !== requestSeqRef.current) return;
      setDossier(data);
      if (data && data.documents.length > 0) {
        setSelectedDoc((prev) => (prev ? data.documents.find((d) => d.id === prev.id) || data.documents[0] : data.documents[0]));
      } else {
        setSelectedDoc(null);
      }
      const flags = await auditDossier(targetGr, targetStudent);
      if (seq !== requestSeqRef.current) return;
      setDiscrepancies(flags);
      loadedGrRef.current = targetGr;
    } catch (err) {
      if (seq === requestSeqRef.current) {
        console.warn('Could not load student folder:', err);
      }
    } finally {
      if (seq === requestSeqRef.current && !quiet) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    const isSameStudent = loadedGrRef.current === student.grNo;
    if (!isSameStudent) {
      setSelectedDoc(null);
      setEditedValues({});
    }
    void loadData(isSameStudent);
    return () => {
      requestSeqRef.current += 1;
    };
  }, [student]);

  const uploadAndScan = useDocumentUploadAndScan(
    student.grNo,
    selectedDoc,
    setSelectedDoc,
    previewModalDoc,
    setPreviewModalDoc,
    setDossier,
    loadData,
    showToast,
    showActionSuccess
  );

  const handleDismissFlag = async (flagId: string) => {
    try {
      await dismissDiscrepancyFlag(flagId);
      setDiscrepancies((prev) =>
        prev.map((f) => (f.id === flagId ? { ...f, isDismissed: true } : f))
      );
      showActionSuccess('Mismatch dismissed.', 3000);
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
      showActionSuccess('Mismatch restored.', 3000);
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
          reason: flag.suggestedCorrection?.reason || 'Verified by user',
        },
        token || undefined
      );

      if (onEditStudent) {
        onEditStudent(applyFieldToStudent(student, targetField, finalValue));
      }

      setDiscrepancies((prev) => prev.filter((f) => f.id !== flag.id));
      setApplySuccessId(flag.id);
      showActionSuccess(res.message || `Updated ${flag.fieldName || flag.field} to "${finalValue}".`, 4000);
    } catch (err: any) {
      showToast?.(toUserErrorMessage(err, 'Failed to apply update.'), 'error');
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
          reason: 'Verified by user',
        };
      });

      const res = await batchApplyDiscrepancyCorrectionsClient(batchList, token || undefined);
      if (onEditStudent) onEditStudent(updated);
      setDiscrepancies([]);
      showActionSuccess(`Updated ${res.appliedCount} field(s).`, 4500);
    } catch (err: any) {
      showToast?.(toUserErrorMessage(err, 'Failed to apply updates.'), 'error');
    } finally {
      setIsBatchApplying(false);
    }
  };

  const handleAutoLink = async () => {
    try {
      setIsAutoLinking(true);
      const res = await autoLinkDocuments([student]);
      showActionSuccess(`Matched ${res.totalMatched} document(s).`, 4000);
      await loadData(true);
    } catch (err: any) {
      showToast?.(toUserErrorMessage(err, 'Could not match files.'), 'error');
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
      showActionSuccess(`Selected sibling #${entryNoOrIndex}.`, 3500);
      await loadData(true);
    } catch (err: any) {
      showToast?.(toUserErrorMessage(err, 'Could not select student entry.'), 'error');
    } finally {
      setIsSelectingChild(false);
    }
  };

  const handleReprocessDoc = async (docId: string) => {
    try {
      setIsReprocessing(true);
      const res = await reprocessDocClient(docId);
      setSelectedDoc(res);
      showActionSuccess('Document re-checked.', 4000);
      await loadData(true);
    } catch (err: any) {
      showToast?.(toUserErrorMessage(err, 'Could not re-check document.'), 'error');
    } finally {
      setIsReprocessing(false);
    }
  };

  const handleReprocessDossier = async () => {
    try {
      setIsReprocessing(true);
      await reprocessDossierClient(student.grNo);
      showActionSuccess('All student documents re-checked.', 4000);
      await loadData(true);
    } catch (err: any) {
      showToast?.(toUserErrorMessage(err, 'Could not re-check student documents.'), 'error');
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

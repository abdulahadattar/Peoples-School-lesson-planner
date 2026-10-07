import { useState } from 'react';
import { User } from 'firebase/auth';
import { SchoolConfig } from '../../types';
import { StudentRecord } from '../../services/googleSheetsService';
import { publishSharedEdit } from '../../services/sharedRecordEdits';
import { DiffItem } from './ConfirmationModal';
import { ConfirmationState } from './RecordsModals';

export function useRecordModals(
  schoolConfig: SchoolConfig,
  isAdmin: boolean,
  authUser: User | null,
  showNotification: (msg: string, type?: 'success' | 'error' | 'info') => void
) {
  const [detailStudent, setDetailStudent] = useState<StudentRecord | null>(null);
  const [detailModalTab, setDetailModalTab] = useState<'details' | 'documents'>('details');
  const [editStudent, setEditStudent] = useState<StudentRecord | null>(null);
  const [isAddMode, setIsAddMode] = useState<boolean>(false);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<{ url: string; name: string; grNo: string } | null>(null);

  const [confirmationState, setConfirmationState] = useState<ConfirmationState>({
    isOpen: false,
    title: '',
    student: null,
    diffs: [],
    isAdd: false,
    isSubmitting: false,
  });

  const isSheetEditingLocked = !schoolConfig.sheetEditingEnabled && !isAdmin;

  const handleOpenEdit = (student: StudentRecord) => {
    if (isSheetEditingLocked) {
      showNotification(
        schoolConfig.sheetEditingLockedMessage ||
          'Student records editing is locked by School Administration. View-only access is active.',
        'error'
      );
      return;
    }
    setIsAddMode(false);
    setEditStudent(student);
  };

  const handleOpenAdd = () => {
    if (isSheetEditingLocked) {
      showNotification(
        schoolConfig.sheetEditingLockedMessage ||
          'Student records addition is locked by School Administration. View-only access is active.',
        'error'
      );
      return;
    }
    setIsAddMode(true);
    setEditStudent(null);
  };

  const handleRequestConfirm = (
    updatedRecord: StudentRecord,
    diffs: DiffItem[],
    isAdd: boolean
  ) => {
    setEditStudent(null);
    setConfirmationState({
      isOpen: true,
      title: isAdd ? 'Confirm Adding New Student Record' : 'Confirm Updating Student Record',
      student: updatedRecord,
      diffs,
      isAdd,
      isSubmitting: false,
    });
  };

  const handleExecuteConfirm = async () => {
    const { student, isAdd } = confirmationState;
    if (!student) return;

    setConfirmationState((prev) => ({ ...prev, isSubmitting: true }));

    try {
      const editorName = authUser?.displayName || authUser?.email || 'Authorized Teacher';
      const shared = await publishSharedEdit(student, isAdd ? 'add' : 'update');

      if (shared) {
        showNotification(
          `${student.studentName} saved (edit by ${editorName}). Everyone can see it now. Press "Sync to Sheet" when you are done to update the sheet itself.`,
          'success'
        );
      } else {
        showNotification(
          `Could not save ${student.studentName}: the shared records store was unreachable. ` +
            `Check your connection and that you are signed in, then try again. Nothing was changed.`,
          'error'
        );
        setConfirmationState((prev) => ({ ...prev, isSubmitting: false }));
        return;
      }

      setConfirmationState({
        isOpen: false,
        title: '',
        student: null,
        diffs: [],
        isAdd: false,
        isSubmitting: false,
      });
    } catch (err: any) {
      console.error('Error saving record locally:', err);
      showNotification(
        `Could not save ${student.studentName} on this device: ${err?.message || err}. The change was not stored.`,
        'error'
      );
      setConfirmationState((prev) => ({ ...prev, isSubmitting: false }));
    }
  };

  return {
    detailStudent,
    setDetailStudent,
    detailModalTab,
    setDetailModalTab,
    editStudent,
    setEditStudent,
    isAddMode,
    setIsAddMode,
    avatarPreviewUrl,
    setAvatarPreviewUrl,
    confirmationState,
    setConfirmationState,
    isSheetEditingLocked,
    handleOpenEdit,
    handleOpenAdd,
    handleRequestConfirm,
    handleExecuteConfirm,
  };
}

import React from 'react';
import { Teacher } from '../../types';
import { ClassTeacherConfig } from '../../services/schoolConfigService';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { ClassEditorModal } from './ClassEditorModal';
import { TeacherEditorModal } from './TeacherEditorModal';

export interface SchoolSettingsModalsProps {
  showResetConfirm: boolean;
  onCancelResetConfirm: () => void;
  onConfirmReset: () => void;
  confirmDialog: {
    isOpen: boolean;
    title: string;
    message: string;
    variant?: 'danger' | 'warning' | 'primary';
    confirmLabel?: string;
    onConfirm: () => void;
  } | null;
  onCancelConfirmDialog: () => void;
  isClassModalOpen: boolean;
  onCloseClassModal: () => void;
  onSaveClass: (cls: ClassTeacherConfig) => void;
  editingClass: ClassTeacherConfig | null;
  teachers: Teacher[];
  isTeacherModalOpen: boolean;
  onCloseTeacherModal: () => void;
  onSaveTeacher: (teacher: Teacher) => void;
  editingTeacher: Teacher | null;
  availableClassKeys: string[];
}

export const SchoolSettingsModals: React.FC<SchoolSettingsModalsProps> = ({
  showResetConfirm,
  onCancelResetConfirm,
  onConfirmReset,
  confirmDialog,
  onCancelConfirmDialog,
  isClassModalOpen,
  onCloseClassModal,
  onSaveClass,
  editingClass,
  teachers,
  isTeacherModalOpen,
  onCloseTeacherModal,
  onSaveTeacher,
  editingTeacher,
  availableClassKeys,
}) => {
  return (
    <>
      <ConfirmDialog
        isOpen={showResetConfirm}
        title="Reset to Institutional Defaults?"
        message="This will restore all 18 classes, class teachers, period timings, and baseline enrollments (868 students) to the official handwritten school register. Custom modifications will be replaced."
        variant="warning"
        confirmLabel="Yes, Restore Defaults"
        onConfirm={onConfirmReset}
        onCancel={onCancelResetConfirm}
      />

      {confirmDialog && (
        <ConfirmDialog
          isOpen={confirmDialog.isOpen}
          title={confirmDialog.title}
          message={confirmDialog.message}
          variant={confirmDialog.variant || 'danger'}
          confirmLabel={confirmDialog.confirmLabel || 'Confirm'}
          onConfirm={confirmDialog.onConfirm}
          onCancel={onCancelConfirmDialog}
        />
      )}

      <ClassEditorModal
        isOpen={isClassModalOpen}
        onClose={onCloseClassModal}
        onSave={onSaveClass}
        initialData={editingClass}
        teachers={teachers}
      />

      <TeacherEditorModal
        isOpen={isTeacherModalOpen}
        onClose={onCloseTeacherModal}
        onSave={onSaveTeacher}
        initialData={editingTeacher}
        availableClassKeys={availableClassKeys}
      />
    </>
  );
};

import React from 'react';
import { X } from 'lucide-react';
import { StudentRecord } from '../../services/googleSheetsService';
import { StudentDetailModal } from './StudentDetailModal';
import { StudentEditModal } from './StudentEditModal';
import { ConfirmationModal, DiffItem } from './ConfirmationModal';

export interface ConfirmationState {
  isOpen: boolean;
  title: string;
  student: StudentRecord | null;
  diffs: DiffItem[];
  isAdd: boolean;
  isSubmitting: boolean;
}

export interface RecordsModalsProps {
  detailStudent: StudentRecord | null;
  detailModalTab: 'details' | 'documents';
  onCloseDetail: () => void;
  onEditFromDetail: (student: StudentRecord) => void;

  editStudent: StudentRecord | null;
  isAddMode: boolean;
  onCloseEdit: () => void;
  onRequestConfirm: (updatedStudent: StudentRecord, originalStudent: StudentRecord | null, isAdd: boolean) => void;

  confirmationState: ConfirmationState;
  onExecuteConfirm: () => void;
  onCancelConfirm: () => void;

  avatarPreviewUrl: { url: string; name: string; grNo: string } | null;
  onCloseAvatarPreview: () => void;
}

export const RecordsModals: React.FC<RecordsModalsProps> = ({
  detailStudent,
  detailModalTab,
  onCloseDetail,
  onEditFromDetail,
  editStudent,
  isAddMode,
  onCloseEdit,
  onRequestConfirm,
  confirmationState,
  onExecuteConfirm,
  onCancelConfirm,
  avatarPreviewUrl,
  onCloseAvatarPreview,
}) => {
  return (
    <>
      <StudentDetailModal
        isOpen={!!detailStudent}
        student={detailStudent}
        initialTab={detailModalTab}
        onClose={onCloseDetail}
        onEdit={(student) => {
          onCloseDetail();
          onEditFromDetail(student);
        }}
      />

      <StudentEditModal
        isOpen={!!editStudent || isAddMode}
        student={editStudent}
        isAddMode={isAddMode}
        onClose={onCloseEdit}
        onRequestConfirm={onRequestConfirm}
      />

      <ConfirmationModal
        isOpen={confirmationState.isOpen}
        title={confirmationState.title}
        studentName={confirmationState.student?.studentName || ''}
        grNo={confirmationState.student?.grNo || ''}
        rowNumber={confirmationState.student?.rowNumber || 0}
        diffs={confirmationState.diffs}
        isAdd={confirmationState.isAdd}
        isSubmitting={confirmationState.isSubmitting}
        onConfirm={onExecuteConfirm}
        onCancel={onCancelConfirm}
      />

      {avatarPreviewUrl && (
        <div
          className="fixed inset-0 z-[150] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={onCloseAvatarPreview}
        >
          <div
            className="relative max-w-lg w-full bg-white dark:bg-brand-surface rounded-2xl overflow-hidden shadow-2xl p-4 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-brand-text-primary text-sm">{avatarPreviewUrl.name}</h3>
                <p className="text-xs text-brand-text-secondary">GR# {avatarPreviewUrl.grNo}</p>
              </div>
              <button
                type="button"
                onClick={onCloseAvatarPreview}
                className="p-1 rounded-lg text-brand-text-secondary hover:text-brand-text-primary hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="relative aspect-square w-full rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-900 border border-brand-border">
              <img
                src={avatarPreviewUrl.url}
                alt={avatarPreviewUrl.name}
                className="w-full h-full object-cover"
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
};

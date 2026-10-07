import React from 'react';
import { BaseModal } from '../../ui/BaseModal';
import { StudentDocumentRecord } from '../../../types/documentArchive';
import { UserPlus } from 'lucide-react';

export interface AssignDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  document: StudentDocumentRecord | null;
  targetGr: string;
  onTargetGrChange: (gr: string) => void;
  onAssign: () => void;
  isOperating: boolean;
}

export const AssignDocumentModal: React.FC<AssignDocumentModalProps> = ({
  isOpen,
  onClose,
  document,
  targetGr,
  onTargetGrChange,
  onAssign,
  isOperating,
}) => {
  if (!isOpen || !document) return null;

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title="Assign Document to Student"
      maxWidth="max-w-md"
    >
      <div className="space-y-4">
        <div className="p-3 rounded-xl bg-brand-bg border border-brand-border text-xs space-y-1">
          <div className="font-bold text-brand-text-primary truncate">
            {document.originalFilename || document.filename}
          </div>
          <div className="text-brand-text-tertiary">
            Type: <span className="font-semibold text-brand-text-secondary">{document.classification}</span>
          </div>
          {document.extractedData?.studentName && (
            <div className="text-brand-text-tertiary">
              Extracted Name: <span className="font-semibold text-brand-text-secondary">{document.extractedData.studentName}</span>
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-bold text-brand-text-primary">
            Target Student GR Number
          </label>
          <input
            type="text"
            value={targetGr}
            onChange={(e) => onTargetGrChange(e.target.value)}
            placeholder="e.g. 1042 or 1299"
            className="w-full px-3 py-2 text-xs rounded-xl bg-brand-bg border border-brand-border text-brand-text-primary focus:outline-hidden focus:border-brand-primary font-mono font-bold"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-brand-text-secondary hover:bg-brand-bg transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!targetGr.trim() || isOperating}
            onClick={onAssign}
            className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-brand-primary hover:bg-brand-primary-hover shadow-sm transition-all flex items-center gap-1.5 disabled:opacity-50"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>{isOperating ? 'Assigning...' : 'Assign to Student'}</span>
          </button>
        </div>
      </div>
    </BaseModal>
  );
};

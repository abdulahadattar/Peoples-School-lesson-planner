import React from 'react';
import { BaseModal } from '../../ui/BaseModal';
import { StudentDocumentRecord, DOCUMENT_LABELS } from '../../../types/documentArchive';
import { RefreshCw, Trash2, ExternalLink } from 'lucide-react';

export interface DocumentDetailPreviewModalProps {
  document: StudentDocumentRecord | null;
  onClose: () => void;
  onRescan: (docId: string) => void;
  onDelete: (doc: StudentDocumentRecord) => void;
  isOperating: boolean;
}

export const DocumentDetailPreviewModal: React.FC<DocumentDetailPreviewModalProps> = ({
  document,
  onClose,
  onRescan,
  onDelete,
  isOperating,
}) => {
  if (!document) return null;

  return (
    <BaseModal
      isOpen={Boolean(document)}
      onClose={onClose}
      title={DOCUMENT_LABELS[document.classification] || document.classification}
      maxWidth="max-w-3xl"
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between text-xs border-b border-brand-border pb-3">
          <div className="flex items-center gap-2">
            <span className="font-mono font-bold px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300">
              GR #{document.grNo}
            </span>
            <span className="text-brand-text-tertiary truncate max-w-xs">
              {document.originalFilename || document.filename}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onRescan(document.id)}
              disabled={isOperating}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-brand-text-primary hover:bg-slate-200 transition-colors flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Rescan
            </button>
            <button
              type="button"
              onClick={() => onDelete(document)}
              disabled={isOperating}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300 hover:bg-rose-100 transition-colors flex items-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-slate-950 rounded-xl overflow-hidden flex items-center justify-center p-2 max-h-[420px]">
            <img
              src={document.url}
              alt="Scan"
              className="max-h-full max-w-full object-contain rounded-lg"
            />
          </div>

          <div className="space-y-3 text-xs">
            <h4 className="font-bold text-brand-text-primary">Extracted Metadata</h4>
            <div className="bg-brand-bg rounded-xl p-3 space-y-2 border border-brand-border">
              <div>
                <span className="text-brand-text-tertiary">Student Name:</span>{' '}
                <span className="font-semibold text-brand-text-primary">
                  {document.extractedData?.studentName || '—'}
                </span>
              </div>
              <div>
                <span className="text-brand-text-tertiary">Father Name:</span>{' '}
                <span className="font-semibold text-brand-text-primary">
                  {document.extractedData?.fatherName || '—'}
                </span>
              </div>
              <div>
                <span className="text-brand-text-tertiary">NADRA B-Form:</span>{' '}
                <span className="font-mono font-semibold text-brand-text-primary">
                  {document.extractedData?.bFormNo || '—'}
                </span>
              </div>
              <div>
                <span className="text-brand-text-tertiary">Father CNIC:</span>{' '}
                <span className="font-mono font-semibold text-brand-text-primary">
                  {document.extractedData?.fatherCnic || '—'}
                </span>
              </div>
              <div>
                <span className="text-brand-text-tertiary">Date of Birth:</span>{' '}
                <span className="font-mono font-semibold text-brand-text-primary">
                  {document.extractedData?.dob || '—'}
                </span>
              </div>
            </div>

            {document.discrepancies.length > 0 && (
              <div className="space-y-1.5">
                <h5 className="font-bold text-rose-600">Discrepancies</h5>
                {document.discrepancies.map((d, i) => (
                  <div key={i} className="p-2 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 text-[11px]">
                    {d.message}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </BaseModal>
  );
};

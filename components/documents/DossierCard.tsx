import React from 'react';
import { Check, Eye } from 'lucide-react';
import { StudentDocumentRecord, StudentDossier } from '../../types/documentArchive';

export interface DossierCardProps {
  dossier: StudentDossier;
  onPreviewDoc?: (doc: StudentDocumentRecord) => void;
  onOpenStudentModal: (grNo: string) => void;
}

export const DossierCard: React.FC<DossierCardProps> = React.memo(({ dossier, onPreviewDoc, onOpenStudentModal }) => {
  const photoDoc = dossier.documents.find((d) => d.classification === 'STUDENT_PHOTO');
  const bFormDoc = dossier.documents.find((d) => d.classification === 'B_FORM');
  const cnicDoc = dossier.documents.find((d) => d.classification.includes('CNIC'));
  const hasPhoto = Boolean(photoDoc);
  const hasBForm = Boolean(bFormDoc);
  const hasCnic = Boolean(cnicDoc);
  const sharedSiblingsCount =
    bFormDoc && Array.isArray(bFormDoc.linkedGrNos) && bFormDoc.linkedGrNos.length > 1
      ? bFormDoc.linkedGrNos.length
      : 0;

  return (
    <div className="rounded-xl bg-white dark:bg-brand-surface border border-brand-border hover:border-brand-primary/40 transition-colors p-4 shadow-soft flex flex-col justify-between space-y-4 group">
      <div>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              onClick={() => photoDoc && onPreviewDoc?.(photoDoc)}
              className={`w-12 h-12 rounded-xl bg-brand-bg border border-brand-border/80 overflow-hidden flex-shrink-0 flex items-center justify-center ${
                photoDoc && onPreviewDoc ? 'cursor-pointer hover:ring-2 hover:ring-brand-primary/40' : ''
              }`}
            >
              {dossier.avatarUrl ? (
                <img
                  src={dossier.avatarUrl}
                  alt={dossier.studentName}
                  width={48}
                  height={48}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="text-xs font-bold text-brand-primary">
                  {dossier.studentName ? dossier.studentName[0] : 'S'}
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center gap-1.5">
                <span className="px-2 py-0.5 rounded-md bg-brand-primary/10 text-brand-primary font-mono text-[11px] font-bold">
                  GR# {dossier.grNo}
                </span>
                {dossier.currentClass && (
                  <span className="text-[10px] text-brand-text-secondary font-medium">
                    {dossier.currentClass}
                  </span>
                )}
              </div>
              <h4 className="font-bold text-brand-text-primary text-sm tracking-tight mt-0.5 truncate max-w-[180px]">
                {dossier.studentName || `Student GR ${dossier.grNo}`}
              </h4>
              <p className="text-[11px] text-brand-text-secondary truncate">
                S/O {dossier.fatherName || 'Guardian'}
              </p>
            </div>
          </div>

          <span
            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
              dossier.allFlags.length > 0
                ? 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
            }`}
          >
            {dossier.allFlags.length > 0 ? `${dossier.allFlags.length} Mismatch${dossier.allFlags.length === 1 ? '' : 'es'}` : 'Verified'}
          </span>
        </div>

        {/* Document Verification Chips */}
        <div className="flex flex-wrap gap-1.5 mt-3">
          <span
            className={`px-2 py-0.5 rounded text-[10px] font-medium flex items-center gap-1 ${
              hasPhoto
                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                : 'bg-slate-100 text-slate-400 dark:bg-slate-800'
            }`}
          >
            {hasPhoto && <Check className="w-3 h-3" />} Photo
          </span>
          <span
            className={`px-2 py-0.5 rounded text-[10px] font-medium flex items-center gap-1 ${
              hasBForm
                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                : 'bg-slate-100 text-slate-400 dark:bg-slate-800'
            }`}
          >
            {hasBForm && <Check className="w-3 h-3" />} B-Form
          </span>
          <span
            className={`px-2 py-0.5 rounded text-[10px] font-medium flex items-center gap-1 ${
              hasCnic
                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                : 'bg-slate-100 text-slate-400 dark:bg-slate-800'
            }`}
          >
            {hasCnic && <Check className="w-3 h-3" />} Father CNIC
          </span>
          {sharedSiblingsCount > 1 && (
            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300">
              {sharedSiblingsCount} Siblings Linked
            </span>
          )}
        </div>

        {/* Consolidated Extracted Data Summary */}
        <div className="mt-3 pt-2.5 border-t border-brand-border/60 text-[11px] space-y-1 text-brand-text-secondary">
          <div className="flex justify-between">
            <span>NADRA B-Form:</span>
            <span className="font-mono font-medium text-brand-text-primary">
              {dossier.bFormNo || 'Not captured'}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Father CNIC:</span>
            <span className="font-mono font-medium text-brand-text-primary">
              {dossier.parentCnic || 'Not captured'}
            </span>
          </div>
        </div>
      </div>

      {/* Footer Action */}
      <div className="pt-2 border-t border-brand-border/60 flex items-center justify-between">
        <span className="text-[10px] text-slate-400">
          {dossier.documents.length} file(s)
        </span>

        <button
          type="button"
          onClick={() => onOpenStudentModal(dossier.grNo)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-brand-primary bg-brand-primary/10 hover:bg-brand-primary/20 transition-colors cursor-pointer"
        >
          <Eye className="w-3.5 h-3.5" />
          <span>View Folder</span>
        </button>
      </div>
    </div>
  );
});

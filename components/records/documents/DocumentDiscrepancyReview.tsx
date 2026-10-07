import React from 'react';
import {
  StudentDossier,
  StudentDocumentRecord,
  DocumentDiscrepancy,
} from '../../../types/documentArchive';
import {
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import { DiscrepancyFlagCard } from './DiscrepancyFlagCard';

export interface DocumentDiscrepancyReviewProps {
  activeFlags: DocumentDiscrepancy[];
  dossier: StudentDossier | null;
  editedValues: Record<string, string>;
  applyingFlagId: string | null;
  applySuccessId: string | null;
  isBatchApplying: boolean;
  isRotating: boolean;
  onEditValue: (flagId: string, val: string) => void;
  onRotateScan: (docId: string, angle: 90 | 180 | 270) => void;
  onPreviewModalDoc: (doc: StudentDocumentRecord) => void;
  onDismissFlag: (flagId: string) => void;
  onApplyCorrection: (flag: DocumentDiscrepancy) => void;
  onApplyAllSuggestions: () => void;
}

export const DocumentDiscrepancyReview: React.FC<DocumentDiscrepancyReviewProps> = ({
  activeFlags,
  dossier,
  editedValues,
  applyingFlagId,
  applySuccessId,
  isBatchApplying,
  isRotating,
  onEditValue,
  onRotateScan,
  onPreviewModalDoc,
  onDismissFlag,
  onApplyCorrection,
  onApplyAllSuggestions,
}) => {
  if (activeFlags.length === 0) return null;

  return (
    <div className="rounded-2xl border border-rose-200 dark:border-rose-800/80 bg-rose-50/40 dark:bg-rose-950/20 p-4 sm:p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-rose-200/70 dark:border-rose-900/50">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-rose-100 dark:bg-rose-900/60 text-rose-600 dark:text-rose-400">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-rose-950 dark:text-rose-100">
              Discrepancies Detected with Physical Scans ({activeFlags.length})
            </h4>
            <p className="text-xs text-rose-700/80 dark:text-rose-300/80">
              The AI compared your master sheet data against the uploaded document scans and noticed differences.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onApplyAllSuggestions}
          disabled={isBatchApplying}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-rose-900 dark:text-rose-100 bg-rose-200/80 dark:bg-rose-900/80 hover:bg-rose-300 dark:hover:bg-rose-800 border border-rose-300 dark:border-rose-700 transition-all disabled:opacity-50"
        >
          {isBatchApplying ? (
            <div className="w-3.5 h-3.5 rounded-full border-2 border-rose-900 dark:border-rose-100 border-t-transparent animate-spin" />
          ) : (
            <CheckCircle2 className="w-3.5 h-3.5 text-rose-700 dark:text-rose-300" />
          )}
          <span>Apply All Non-Conflicting</span>
        </button>
      </div>

      <div className="space-y-4">
        {activeFlags.map((flag) => {
          const matchedDoc = dossier?.documents.find(
            (d) => d.id === flag.documentId || (d.classification && flag.sourceDocument?.includes(d.classification))
          );
          const docImgUrl = matchedDoc?.thumbnailUrl || matchedDoc?.fileUrl || null;
          const currentInputVal = editedValues[flag.id] ?? flag.extractedValue ?? '';
          const isUserEdited = editedValues[flag.id] !== undefined && editedValues[flag.id] !== flag.extractedValue;
          const isApplying = applyingFlagId === flag.id;
          const isAppliedSuccess = applySuccessId === flag.id;

          return (
            <DiscrepancyFlagCard
              key={flag.id}
              flag={flag}
              matchedDoc={matchedDoc}
              docImgUrl={docImgUrl}
              currentInputVal={currentInputVal}
              isUserEdited={isUserEdited}
              isApplying={isApplying}
              isAppliedSuccess={isAppliedSuccess}
              isRotating={isRotating}
              onEditValue={onEditValue}
              onRotateScan={onRotateScan}
              onPreviewModalDoc={onPreviewModalDoc}
              onDismissFlag={onDismissFlag}
              onApplyCorrection={onApplyCorrection}
            />
          );
        })}
      </div>
    </div>
  );
};

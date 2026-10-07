import React from 'react';
import { ShieldAlert, CheckCircle2 } from 'lucide-react';
import {
  CandidateStudentMatch,
  DocumentDiscrepancy,
  StudentDocumentRecord,
} from '../../types/documentArchive';
import { DiscrepancyAuditCard } from './DiscrepancyAuditCard';

export interface DiscrepancyAuditItem {
  grNo: string;
  studentName: string;
  currentClass: string;
  flag: DocumentDiscrepancy;
}

export interface DiscrepancyAuditTableProps {
  filteredDiscrepancies: DiscrepancyAuditItem[];
  documents: StudentDocumentRecord[];
  applyingFlagId: string | null;
  isBatchApplying: boolean;
  onPreviewDoc: (doc: StudentDocumentRecord) => void;
  onApplyCorrection: (grNo: string, flag: DocumentDiscrepancy) => void;
  onBatchApplyCorrections: (flags: DiscrepancyAuditItem[]) => void;
  onResolveWithCandidate: (
    documentId: string,
    candidate: CandidateStudentMatch,
    flagId: string
  ) => void;
  onDismissFlag: (flagId: string) => void;
  onOpenStudentModal: (grNo: string) => void;
}

export const DiscrepancyAuditTable: React.FC<DiscrepancyAuditTableProps> = React.memo(({
  filteredDiscrepancies,
  documents,
  applyingFlagId,
  isBatchApplying,
  onPreviewDoc,
  onApplyCorrection,
  onBatchApplyCorrections,
  onResolveWithCandidate,
  onDismissFlag,
  onOpenStudentModal,
}) => {
  const flagsWithCorrection = filteredDiscrepancies.filter(
    (d) => d.flag.suggestedCorrection && !d.flag.isDismissed
  );

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-brand-surface rounded-xl border border-brand-border shadow-soft overflow-hidden">
        <div className="p-4 border-b border-brand-border flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-rose-600" />
              <h3 className="text-sm font-bold text-brand-text-primary">
                Cross-Check Discrepancies & Flagged Records
              </h3>
            </div>
            <p className="text-xs text-brand-text-secondary mt-0.5">
              Comparison between data extracted from uploaded documents and data registered in Google Sheet.
            </p>
          </div>

          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300">
            {filteredDiscrepancies.length} Flagged Issue(s)
          </span>
        </div>

        {flagsWithCorrection.length > 0 && (
          <div className="bg-emerald-50 dark:bg-emerald-950/40 border-b border-emerald-200 dark:border-emerald-800 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-fadeIn">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-emerald-600 text-white shadow-xs">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-emerald-900 dark:text-emerald-100">
                  {flagsWithCorrection.length} Correction(s) Ready to Apply
                </h4>
                <p className="text-[11px] text-emerald-700 dark:text-emerald-300 mt-0.5">
                  Review each correction before applying to Google Sheet records.
                </p>
              </div>
            </div>
            <button
              type="button"
              disabled={isBatchApplying}
              onClick={() => onBatchApplyCorrections(flagsWithCorrection)}
              className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95 disabled:opacity-60 whitespace-nowrap"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{isBatchApplying ? 'Applying...' : `Apply All ${flagsWithCorrection.length} to Sheet`}</span>
            </button>
          </div>
        )}

        {filteredDiscrepancies.length === 0 ? (
          <div className="p-12 text-center">
            <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
            <h4 className="text-sm font-bold text-brand-text-primary">No discrepancies</h4>
            <p className="text-xs text-brand-text-secondary mt-1">
              Every document matches its student record.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 p-4">
            {filteredDiscrepancies.map((item, idx) => (
              <DiscrepancyAuditCard
                key={item.flag.id || idx}
                item={item}
                documents={documents}
                applyingFlagId={applyingFlagId}
                onPreviewDoc={onPreviewDoc}
                onApplyCorrection={onApplyCorrection}
                onResolveWithCandidate={onResolveWithCandidate}
                onDismissFlag={onDismissFlag}
                onOpenStudentModal={onOpenStudentModal}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
});
DiscrepancyAuditTable.displayName = 'DiscrepancyAuditTable';

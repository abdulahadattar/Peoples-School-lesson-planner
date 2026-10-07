import React from 'react';
import {
  ScanLine,
  Database,
  AlertCircle,
  Wand2,
  ArrowRight,
  Check,
  ListChecks,
  Link as LinkIcon,
  Eye,
  ZoomIn,
  FileText,
} from 'lucide-react';
import {
  CandidateStudentMatch,
  DocumentDiscrepancy,
  StudentDocumentRecord,
} from '../../types/documentArchive';
import { DiscrepancyAuditItem } from './DiscrepancyAuditTable';

export interface DiscrepancyAuditCardProps {
  item: DiscrepancyAuditItem;
  documents: StudentDocumentRecord[];
  applyingFlagId: string | null;
  onPreviewDoc: (doc: StudentDocumentRecord) => void;
  onApplyCorrection: (grNo: string, flag: DocumentDiscrepancy) => void;
  onResolveWithCandidate: (documentId: string, candidate: CandidateStudentMatch, flagId: string) => void;
  onDismissFlag: (flagId: string) => void;
  onOpenStudentModal: (grNo: string) => void;
}

export const DiscrepancyAuditCard: React.FC<DiscrepancyAuditCardProps> = ({
  item,
  documents,
  applyingFlagId,
  onPreviewDoc,
  onApplyCorrection,
  onResolveWithCandidate,
  onDismissFlag,
  onOpenStudentModal,
}) => {
  const docImgUrl = item.flag.documentUrl;
  const matchedDoc = documents.find((d) => d.id === item.flag.documentId);
  const imageUrl = docImgUrl || matchedDoc?.url;

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-3 flex-wrap">
          <span
            className={`px-2.5 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-wider ${
              item.flag.severity === 'critical'
                ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/80 dark:text-rose-300'
                : item.flag.severity === 'high'
                ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/80 dark:text-amber-300'
                : item.flag.severity === 'medium'
                ? 'bg-sky-100 text-sky-700 dark:bg-sky-950/80 dark:text-sky-300'
                : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
            }`}
          >
            {item.flag.severity} Priority
          </span>
          <span className="px-3 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 font-mono text-xs font-bold">
            GR #{item.grNo}
          </span>
          <button
            type="button"
            onClick={() => onOpenStudentModal(item.grNo)}
            className="text-sm font-bold text-brand-text-primary hover:text-brand-primary underline transition-colors cursor-pointer"
          >
            {item.studentName || 'Student'} ({item.currentClass || 'General'})
          </button>
        </div>
        <div className="flex items-center gap-2">
          {item.flag.isDismissed ? (
            <span className="text-xs font-bold text-slate-400 bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-lg">
              Dismissed
            </span>
          ) : (
            <button
              type="button"
              onClick={() => onDismissFlag(item.flag.id)}
              className="text-xs font-bold text-slate-500 hover:text-slate-700 dark:text-slate-400 px-3 py-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              Dismiss
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
        <div className="md:col-span-3">
          {imageUrl ? (
            <button
              type="button"
              onClick={() => matchedDoc && onPreviewDoc(matchedDoc)}
              className="relative group block w-full rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-950 aspect-[4/3]"
            >
              <img src={imageUrl} alt="Document" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-xs font-bold gap-1 transition-opacity">
                <ZoomIn className="w-4 h-4" /> View Scan
              </div>
            </button>
          ) : (
            <div className="w-full aspect-[4/3] rounded-xl border border-dashed border-slate-300 flex items-center justify-center text-slate-400 text-xs">
              <FileText className="w-6 h-6 mb-1" />
            </div>
          )}
        </div>

        <div className="md:col-span-9 space-y-3">
          <div className="text-xs text-brand-text-secondary bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-200/60 dark:border-slate-700/60">
            <span className="font-bold text-brand-text-primary">{item.flag.fieldName}:</span> {item.flag.message}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="p-3 rounded-xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-800/40">
              <div className="text-[10px] font-bold text-amber-800 dark:text-amber-300 uppercase flex items-center gap-1.5 mb-1">
                <Database className="w-3.5 h-3.5" /> Sheet Value
              </div>
              <div className="font-mono font-bold text-slate-800 dark:text-slate-100 truncate">
                {item.flag.sheetValue || '(Empty)'}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-sky-50/50 dark:bg-sky-950/20 border border-sky-200/60 dark:border-sky-800/40">
              <div className="text-[10px] font-bold text-sky-800 dark:text-sky-300 uppercase flex items-center gap-1.5 mb-1">
                <ScanLine className="w-3.5 h-3.5" /> Document Extracted
              </div>
              <div className="font-mono font-bold text-slate-800 dark:text-slate-100 truncate">
                {item.flag.extractedValue || '(Empty)'}
              </div>
            </div>
          </div>

          {item.flag.suggestedCorrection && !item.flag.isDismissed && (
            <div className="flex items-center justify-between gap-3 pt-2">
              <span className="text-xs text-emerald-700 dark:text-emerald-300 font-medium">
                {item.flag.suggestedCorrection.reason}
              </span>
              <button
                type="button"
                disabled={applyingFlagId === item.flag.id}
                onClick={() => onApplyCorrection(item.grNo, item.flag)}
                className="px-4 py-1.5 rounded-xl text-xs font-bold text-white bg-brand-primary hover:bg-brand-primary-hover shadow-sm transition-all flex items-center gap-1.5"
              >
                <Wand2 className="w-3.5 h-3.5" />
                <span>{applyingFlagId === item.flag.id ? 'Applying...' : 'Apply Correction'}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

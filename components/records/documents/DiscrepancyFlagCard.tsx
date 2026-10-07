import React from 'react';
import {
  StudentDocumentRecord,
  DocumentDiscrepancy,
  DOCUMENT_LABELS,
} from '../../../types/documentArchive';
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Image as ImageIcon,
  RotateCw,
  Maximize2,
  ScanLine,
  Edit2,
  Check,
} from 'lucide-react';

export interface DiscrepancyFlagCardProps {
  flag: DocumentDiscrepancy;
  matchedDoc: StudentDocumentRecord | undefined;
  docImgUrl: string | null;
  currentInputVal: string;
  isUserEdited: boolean;
  isApplying: boolean;
  isAppliedSuccess: boolean;
  isRotating: boolean;
  onEditValue: (flagId: string, val: string) => void;
  onRotateScan: (docId: string, angle: 90 | 180 | 270) => void;
  onPreviewModalDoc: (doc: StudentDocumentRecord) => void;
  onDismissFlag: (flagId: string) => void;
  onApplyCorrection: (flag: DocumentDiscrepancy) => void;
}

export const DiscrepancyFlagCard: React.FC<DiscrepancyFlagCardProps> = ({
  flag,
  matchedDoc,
  docImgUrl,
  currentInputVal,
  isUserEdited,
  isApplying,
  isAppliedSuccess,
  isRotating,
  onEditValue,
  onRotateScan,
  onPreviewModalDoc,
  onDismissFlag,
  onApplyCorrection,
}) => {
  return (
    <div
      key={flag.id}
      className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-brand-surface border border-brand-border shadow-xs space-y-4"
    >
      {/* Header with message */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-500 flex-shrink-0" />
          <span className="text-xs font-semibold text-brand-text-primary">
            {flag.message}
          </span>
        </div>
        <span className="text-[10px] uppercase font-bold text-rose-600 dark:text-rose-400 px-2.5 py-0.5 bg-rose-50 dark:bg-rose-950 rounded-full border border-rose-200 dark:border-rose-900/50">
          {flag.severity} priority
        </span>
      </div>

      {/* Scanned Document Picture Container */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs text-brand-text-secondary px-1">
          <span className="font-semibold text-brand-text-primary flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5 text-brand-primary" />
            Original Document Scan Source:
          </span>
          <span className="font-mono text-[11px] text-slate-500">
            {matchedDoc ? `${DOCUMENT_LABELS[matchedDoc.classification] || matchedDoc.classification} (${matchedDoc.originalFilename})` : 'Document Scan'}
          </span>
        </div>

        <div className="relative rounded-xl overflow-hidden bg-slate-950 border border-slate-800 flex items-center justify-center min-h-[220px] max-h-[360px] group shadow-inner">
          {docImgUrl ? (
            matchedDoc?.filename.toLowerCase().endsWith('.pdf') ? (
              <iframe
                src={docImgUrl}
                className="w-full h-[320px] rounded border-0"
                title={matchedDoc.originalFilename}
              />
            ) : (
              <img
                src={docImgUrl}
                alt="Scanned Document Reference"
                className="w-full h-full max-h-[340px] object-contain cursor-pointer transition-transform duration-200 p-2"
                onClick={() => {
                  if (matchedDoc) {
                    onPreviewModalDoc(matchedDoc);
                  }
                }}
                title="Click to open high-resolution inspection modal"
              />
            )
          ) : (
            <div className="py-12 flex flex-col items-center justify-center text-slate-500">
              <ImageIcon className="w-10 h-10 mb-2 opacity-50" />
              <span className="text-xs">No scan image attached</span>
            </div>
          )}

          <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5 bg-slate-900/85 backdrop-blur-xs p-1 rounded-lg border border-white/10 shadow-md">
            {matchedDoc && !matchedDoc.filename.toLowerCase().endsWith('.pdf') && (
              <button
                type="button"
                onClick={() => onRotateScan(matchedDoc.id, 90)}
                disabled={isRotating}
                className="px-2 py-1 rounded-md text-[11px] font-medium text-white hover:bg-white/20 transition-colors flex items-center gap-1 cursor-pointer"
                title="Rotate scan 90° clockwise if sideways"
              >
                <RotateCw className={`w-3.5 h-3.5 ${isRotating ? 'animate-spin' : ''}`} />
                <span>Rotate 90°</span>
              </button>
            )}
            {matchedDoc && (
              <button
                type="button"
                onClick={() => onPreviewModalDoc(matchedDoc)}
                className="px-2 py-1 rounded-md text-[11px] font-medium text-white hover:bg-white/20 transition-colors flex items-center gap-1 cursor-pointer"
                title="Enlarge scan in high-resolution viewer with zoom controls"
              >
                <Maximize2 className="w-3.5 h-3.5" />
                <span>Enlarge</span>
              </button>
            )}
          </div>

          <div className="absolute bottom-2 left-2 pointer-events-none">
            <span className="px-2 py-0.5 rounded bg-black/70 text-slate-300 text-[10px] font-mono backdrop-blur-xs">
              Click image to zoom in high definition
            </span>
          </div>
        </div>
      </div>

      {/* Side by side: Sheet value vs Editable OCR */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 flex flex-col justify-between space-y-2">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Current Google Sheet Record
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                {flag.fieldName || flag.field}
              </span>
            </div>
            <div className="mt-2 font-mono font-bold text-slate-800 dark:text-slate-100 text-sm sm:text-base break-all bg-white dark:slate-950 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 shadow-xs">
              {flag.sheetValue ? (
                flag.sheetValue
              ) : (
                <span className="italic font-normal text-slate-400 text-xs">
                  (Blank / Unfilled in Master Sheet)
                </span>
              )}
            </div>
          </div>
          <p className="text-[11px] text-slate-400">
            This is what currently appears in the student's row in Google Sheets.
          </p>
        </div>

        <div className="p-4 rounded-xl bg-brand-primary/5 dark:bg-brand-primary/10 border border-brand-primary/30 dark:border-brand-primary/40 flex flex-col justify-between space-y-2">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-brand-primary flex items-center gap-1.5">
                <ScanLine className="w-3.5 h-3.5" />
                Extracted / Suggested Correction
              </span>
              {isUserEdited ? (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                  User Modified
                </span>
              ) : (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-brand-primary/10 text-brand-primary">
                  From Scan
                </span>
              )}
            </div>

            <div className="relative mt-2">
              <input
                type="text"
                value={currentInputVal}
                onChange={(e) => onEditValue(flag.id, e.target.value)}
                placeholder="Enter or fix corrected value..."
                className="w-full px-3 py-2 text-xs sm:text-sm font-mono font-bold rounded-lg border border-brand-primary/40 focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20 bg-white dark:bg-slate-900 text-brand-text-primary shadow-xs outline-hidden"
              />
            </div>
          </div>

          <div className="flex items-start gap-1 text-[11px] text-slate-500 dark:text-slate-400">
            <Edit2 className="w-3.5 h-3.5 text-brand-primary flex-shrink-0 mt-0.5" />
            <span>
              Check the scan image above. You can directly edit any mistyped letters or numbers before applying.
            </span>
          </div>
        </div>
      </div>

      {/* Resolution Action Buttons */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-brand-border/60">
        <button
          type="button"
          onClick={() => onDismissFlag(flag.id)}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          title="Keep current Google Sheet value and dismiss this warning"
        >
          <Check className="w-3.5 h-3.5 text-slate-400" />
          <span>Dismiss (Keep Sheet Value)</span>
        </button>

        <button
          type="button"
          disabled={isApplying || !currentInputVal.trim()}
          onClick={() => onApplyCorrection(flag)}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-brand-primary hover:bg-brand-primary-hover shadow-sm active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
        >
          {isApplying ? (
            <>
              <div className="w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
              <span>Applying to Google Sheet...</span>
            </>
          ) : isAppliedSuccess ? (
            <>
              <CheckCircle2 className="w-4 h-4 text-white" />
              <span>Applied!</span>
            </>
          ) : (
            <>
              <CheckCircle2 className="w-4 h-4" />
              <span>Apply Correction to Google Sheet</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};

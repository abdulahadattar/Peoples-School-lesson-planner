import React from 'react';
import {
  ShieldAlert,
  CheckCircle2,
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

        {/* Batch Apply Synchronization Banner */}
        {flagsWithCorrection.length > 0 && (
          <div className="bg-emerald-50 dark:bg-emerald-950/40 border-b border-emerald-200 dark:border-emerald-800 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-fadeIn">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-emerald-600 text-white shadow-xs">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-emerald-900 dark:text-emerald-100 flex items-center gap-2">
                  <span>{flagsWithCorrection.length} Correction(s) Ready to Apply</span>
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
            {filteredDiscrepancies.map((item, idx) => {
              const docImgUrl = item.flag.documentUrl;
              const matchedDoc = documents.find((d) => d.id === item.flag.documentId);
              const imageUrl = docImgUrl || matchedDoc?.url;

              return (
                <div
                  key={item.flag.id || idx}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all space-y-4"
                >
                  {/* Top Header Row */}
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
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                        {item.studentName || 'Student'}
                      </h4>
                      <span className="text-xs text-slate-500">
                        ({item.currentClass || 'General'})
                      </span>
                      {item.flag.incompleteOcr && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                          Partial OCR (&lt;13 Digits) • Sheet Authoritative
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 font-mono text-slate-700 dark:text-slate-300">
                        Field: {item.flag.fieldName || item.flag.field}
                      </span>
                    </div>
                  </div>

                  {/* Main Split Body: Large Document Preview + Comparison Boxes */}
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
                    {/* Large Document Preview Card (4 cols) */}
                    <div className="md:col-span-4 flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/80 rounded-xl p-3">
                      <div
                        onClick={() => {
                          if (matchedDoc) onPreviewDoc(matchedDoc);
                        }}
                        className="w-full h-48 rounded-lg bg-slate-900 border border-slate-200 dark:border-slate-700 overflow-hidden cursor-pointer flex items-center justify-center group relative shadow-inner"
                        title="Click to zoom in on document scan"
                      >
                        {imageUrl ? (
                          <img
                            src={`${imageUrl}?t=${Date.now()}`}
                            alt="Document Scan"
                            className="w-full h-full object-contain group-hover:scale-105 transition-transform"
                          />
                        ) : (
                          <div className="flex flex-col items-center justify-center text-slate-400 gap-2">
                            <FileText className="w-8 h-8" />
                            <span className="text-xs font-medium">No Image Preview</span>
                          </div>
                        )}
                        <div className="absolute inset-0 bg-black/50 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 flex flex-col items-center justify-center transition-opacity text-white gap-1.5 p-2 text-center">
                          <ZoomIn className="w-6 h-6" />
                          <span className="text-xs font-bold">Click to Inspect & Zoom Scan</span>
                        </div>
                      </div>
                      <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mt-2">
                        Source Document Scan (Click to Expand)
                      </span>
                    </div>

                    {/* Side-by-Side Comparison Boxes (8 cols) */}
                    <div className="md:col-span-8 space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {/* Extracted Box */}
                        <div className="p-4 rounded-xl bg-rose-50/60 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/50 space-y-1.5">
                          <div className="text-[11px] font-extrabold text-rose-600 dark:text-rose-400 uppercase tracking-wider flex items-center gap-1.5">
                            <ScanLine className="w-3.5 h-3.5" />
                            Extracted Value (From Scan)
                          </div>
                          <div className="text-base font-bold font-mono text-rose-900 dark:text-rose-200 bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-rose-100 dark:border-rose-900 shadow-xs">
                            {item.flag.extractedValue || '(Missing / Blank)'}
                          </div>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400">
                            Read directly from the uploaded scan.
                          </p>
                        </div>

                        {/* Google Sheet Record Box */}
                        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-1.5">
                          <div className="text-[11px] font-extrabold text-slate-600 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                            <Database className="w-3.5 h-3.5" />
                            Google Sheet Record
                          </div>
                          <div className="text-base font-bold font-mono text-slate-900 dark:text-white bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 shadow-xs">
                            {item.flag.sheetValue || '(Not in Sheet)'}
                          </div>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400">
                            Current value stored in student roster.
                          </p>
                        </div>
                      </div>

                      {/* Audit Diagnosis Message */}
                      <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 flex items-start gap-2 text-xs text-amber-900 dark:text-amber-200">
                        <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                        <div>
                          <span className="font-bold">Audit Analysis: </span>
                          {item.flag.message}
                        </div>
                      </div>

                      {/* Single-Click Suggested Correction Card */}
                      {item.flag.suggestedCorrection && (
                        <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 space-y-2.5 animate-fadeIn">
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-900 dark:text-emerald-100">
                              <Wand2 className="w-4 h-4 text-emerald-600" />
                              <span>Recommended Resolution:</span>
                            </div>
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                                item.flag.suggestedAction === 'enrich_full_name' ||
                                item.flag.suggestedAction === 'merge_caste'
                                  ? 'bg-teal-100 dark:bg-teal-900/60 text-teal-800 dark:text-teal-200 border border-teal-300 dark:border-teal-700'
                                  : 'bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200'
                              }`}
                            >
                              {item.flag.suggestedAction === 'enrich_full_name'
                                ? 'Full Name & Caste Enrichment'
                                : item.flag.suggestedAction === 'merge_caste'
                                ? 'Incorporate Caste'
                                : item.flag.suggestedAction || 'Suggested fix'}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 text-xs">
                            <span className="text-slate-500 font-mono line-through truncate max-w-[140px]">
                              {item.flag.sheetValue || '(blank)'}
                            </span>
                            <ArrowRight className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                            <span className="font-mono font-bold text-emerald-800 dark:text-emerald-200 bg-white dark:bg-slate-900 px-2 py-1 rounded border border-emerald-300 dark:border-emerald-700 shadow-xs">
                              {item.flag.suggestedCorrection.newValue}
                            </span>
                          </div>

                          <p className="text-[11px] text-emerald-700 dark:text-emerald-300">
                            {item.flag.suggestedCorrection.reason}
                          </p>

                          <div className="flex items-center justify-end pt-1">
                            <button
                              type="button"
                              disabled={applyingFlagId === item.flag.id}
                              onClick={() => onApplyCorrection(item.grNo, item.flag)}
                              className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 disabled:opacity-50"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>
                                {applyingFlagId === item.flag.id
                                  ? 'Applying...'
                                  : 'Apply Correction to Google Sheet'}
                              </span>
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Ranked Candidate Matches Section */}
                      {item.flag.rankedMatches && item.flag.rankedMatches.length > 0 && (
                        <div className="p-3.5 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800/60 space-y-2.5 animate-fadeIn">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-900 dark:text-indigo-100">
                              <ListChecks className="w-4 h-4 text-indigo-600" />
                              <span>Candidate Matches ({item.flag.rankedMatches.length})</span>
                            </div>
                            <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-medium">
                              Ranked by match score
                            </span>
                          </div>

                          <div className="space-y-2">
                            {item.flag.rankedMatches.map((cand, cIdx) => {
                              const isHighConf = cand.score >= 80;
                              const isMedConf = cand.score >= 50 && cand.score < 80;

                              return (
                                <div
                                  key={cIdx}
                                  className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-indigo-100 dark:border-indigo-900/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shadow-xs"
                                >
                                  <div className="space-y-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span
                                        className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${
                                          isHighConf
                                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                            : isMedConf
                                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                            : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                                        }`}
                                      >
                                        {cand.score}% Match
                                      </span>
                                      <span className="font-mono font-bold text-xs text-indigo-700 dark:text-indigo-300">
                                        GR #{cand.grNo}
                                      </span>
                                      <span className="font-bold text-xs text-slate-900 dark:text-white">
                                        {cand.studentName}
                                      </span>
                                      {cand.fatherName && (
                                        <span className="text-xs text-slate-500">
                                          s/o {cand.fatherName}
                                        </span>
                                      )}
                                      <span className="text-[10px] text-slate-400">
                                        ({cand.currentClass})
                                      </span>
                                    </div>

                                    {/* Evidence Chips */}
                                    <div className="flex flex-wrap gap-1 items-center">
                                      {cand.evidence.map((ev, evIdx) => (
                                        <span
                                          key={evIdx}
                                          className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                                        >
                                          {ev}
                                        </span>
                                      ))}
                                      <span className="text-[10px] text-slate-400 italic">
                                        {cand.reasons}
                                      </span>
                                    </div>
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() =>
                                      onResolveWithCandidate(
                                        item.flag.documentId || matchedDoc?.id || '',
                                        cand,
                                        item.flag.id
                                      )
                                    }
                                    className="px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-xs transition-all flex items-center justify-center gap-1 whitespace-nowrap self-end sm:self-center cursor-pointer active:scale-95"
                                  >
                                    <LinkIcon className="w-3.5 h-3.5" />
                                    <span>Resolve & Link to GR #{cand.grNo}</span>
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Actions Bar */}
                      <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2">
                        <button
                          type="button"
                          onClick={() => onDismissFlag(item.flag.id)}
                          className="px-4 py-2 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 shadow-xs transition-all cursor-pointer"
                        >
                          Dismiss as False Flag
                        </button>
                        <button
                          type="button"
                          onClick={() => onOpenStudentModal(item.grNo)}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-brand-primary hover:bg-brand-primary/90 shadow-sm transition-all cursor-pointer"
                        >
                          <Eye className="w-4 h-4" />
                          <span>Review Full Dossier</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
});

import React from 'react';
import {
  CheckSquare,
  Trash2,
  ZoomIn,
  RefreshCw,
  UserPlus,
} from 'lucide-react';
import {
  StudentDocumentRecord,
  DOCUMENT_LABELS,
} from '../../types/documentArchive';
import { DocThumbnail } from './DocThumbnail';

export interface DocumentScansGridProps {
  filteredDocuments: StudentDocumentRecord[];
  selectedDocIds: string[];
  isOperatingDoc: boolean;
  onToggleSelectDoc: (docId: string) => void;
  onToggleSelectAll: (docs: StudentDocumentRecord[]) => void;
  onClearSelection: () => void;
  onBatchDeletePrompt: () => void;
  onPreviewDoc: (doc: StudentDocumentRecord) => void;
  onRescanDoc: (docId: string) => void;
  onDeleteDocPrompt: (doc: StudentDocumentRecord) => void;
  onAssignDocPrompt: (doc: StudentDocumentRecord) => void;
  onOpenStudentModal: (grNo: string) => void;
}

export const DocumentScansGrid: React.FC<DocumentScansGridProps> = React.memo(({
  filteredDocuments,
  selectedDocIds,
  isOperatingDoc,
  onToggleSelectDoc,
  onToggleSelectAll,
  onClearSelection,
  onBatchDeletePrompt,
  onPreviewDoc,
  onRescanDoc,
  onDeleteDocPrompt,
  onAssignDocPrompt,
  onOpenStudentModal,
}) => {
  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-brand-surface rounded-xl border border-brand-border shadow-soft overflow-hidden">
        <div className="p-4 border-b border-brand-border flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="text-sm font-bold text-brand-text-primary">
              All Processed Document Scans
            </h3>
            <p className="text-xs text-brand-text-secondary">
              Showing all {filteredDocuments.length} document scans.
            </p>
          </div>

          {/* Quick Batch Selection Helpers */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onToggleSelectAll(filteredDocuments)}
              className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-brand-bg border border-brand-border text-brand-text-secondary hover:text-brand-text-primary transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <CheckSquare className="w-3.5 h-3.5 text-brand-primary" />
              <span>
                {filteredDocuments.length > 0 &&
                filteredDocuments.every((d) => selectedDocIds.includes(d.id))
                  ? 'Deselect All'
                  : 'Select All Visible'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                const unassignedDocs = filteredDocuments.filter((d) => d.grNo === 'UNASSIGNED');
                onToggleSelectAll(unassignedDocs);
              }}
              className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 hover:bg-amber-100 transition-colors cursor-pointer"
            >
              Select Unassigned ({filteredDocuments.filter((d) => d.grNo === 'UNASSIGNED').length})
            </button>
          </div>
        </div>

        {/* Sticky Floating Batch Selection Banner */}
        {selectedDocIds.length > 0 && (
          <div className="bg-rose-50 dark:bg-rose-950/90 border-b border-rose-200 dark:border-rose-800 p-3 px-4 flex items-center justify-between flex-wrap gap-3 animate-fadeIn">
            <div className="flex items-center gap-3">
              <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-rose-600 text-white font-bold text-xs shadow-xs">
                {selectedDocIds.length}
              </span>
              <div>
                <h4 className="text-xs font-bold text-rose-900 dark:text-rose-100">
                  {selectedDocIds.length} Document Scan{selectedDocIds.length > 1 ? 's' : ''} Selected
                </h4>
                <p className="text-[11px] text-rose-700 dark:text-rose-300">
                  Delete all selected document scans in a single bulk action.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClearSelection}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/60 transition-colors cursor-pointer"
              >
                Clear Selection
              </button>
              <button
                type="button"
                onClick={onBatchDeletePrompt}
                disabled={isOperatingDoc}
                className="px-4 py-1.5 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 shadow-sm transition-all flex items-center gap-1.5 active:scale-95 cursor-pointer disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                <span>Delete Selected ({selectedDocIds.length})</span>
              </button>
            </div>
          </div>
        )}

        {filteredDocuments.length === 0 ? (
          <div className="p-12 text-center text-xs text-brand-text-secondary">
            No extracted documents found matching your filter.
          </div>
        ) : (
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left text-xs min-w-[700px]">
              <thead className="bg-brand-bg text-brand-text-secondary uppercase text-[10px] tracking-wider border-b border-brand-border">
                <tr>
                  <th className="py-3 px-3 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={
                        filteredDocuments.length > 0 &&
                        filteredDocuments.every((d) => selectedDocIds.includes(d.id))
                      }
                      onChange={() => onToggleSelectAll(filteredDocuments)}
                      className="w-4 h-4 rounded border-brand-border text-brand-primary focus:ring-brand-primary accent-brand-primary cursor-pointer"
                      title="Select / Deselect all visible documents"
                    />
                  </th>
                  <th className="py-3 px-4">Scan Preview</th>
                  <th className="py-3 px-4">GR # & Filename</th>
                  <th className="py-3 px-4">Identified Type</th>
                  <th className="py-3 px-4">Extracted Info (NADRA)</th>
                  <th className="py-3 px-4">Orientation</th>
                  <th className="py-3 px-4">Confidence</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-border">
                {filteredDocuments.map((doc) => {
                  const ext = doc.extractedData;
                  const isDocSelected = selectedDocIds.includes(doc.id);
                  return (
                    <tr
                      key={doc.id}
                      className={`transition-colors ${
                        isDocSelected
                          ? 'bg-rose-50/60 dark:bg-rose-950/40'
                          : 'hover:bg-brand-bg/50'
                      }`}
                    >
                      <td className="py-3 px-3 w-10 text-center">
                        <input
                          type="checkbox"
                          checked={isDocSelected}
                          onChange={() => onToggleSelectDoc(doc.id)}
                          className="w-4 h-4 rounded border-brand-border text-brand-primary focus:ring-brand-primary accent-brand-primary cursor-pointer"
                        />
                      </td>
                      <td className="py-3 px-4">
                        <div
                          onClick={() => onPreviewDoc(doc)}
                          className="w-12 h-12 rounded-lg bg-slate-100 dark:bg-slate-800 border border-brand-border overflow-hidden cursor-pointer flex items-center justify-center group relative"
                        >
                          <DocThumbnail
                            url={doc.url}
                            filename={doc.filename}
                            classification={doc.classification}
                            className="w-full h-full object-cover group-hover:scale-110 transition-transform"
                          />
                          <div className="absolute inset-0 bg-black/40 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 flex items-center justify-center transition-opacity text-white">
                            <ZoomIn className="w-4 h-4" />
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          {doc.grNo === 'UNASSIGNED' ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200 animate-pulse border border-amber-300 dark:border-amber-800">
                              UNASSIGNED
                            </span>
                          ) : (
                            <span className="font-mono font-bold text-brand-primary text-xs block">
                              GR #{doc.grNo}
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-brand-text-secondary truncate max-w-[150px] block font-mono mt-0.5">
                          {doc.originalFilename}
                        </span>
                        <span className="text-[10px] text-slate-400 block">
                          {(doc.fileSizeBytes / 1024).toFixed(0)} KB • {doc.isBlackAndWhite ? 'B&W' : 'Color'}
                        </span>
                      </td>

                      <td className="py-3 px-4">
                        <span className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-900 inline-block">
                          {DOCUMENT_LABELS[doc.classification] || doc.classification}
                        </span>
                      </td>

                      <td className="py-3 px-4">
                        {ext && (ext.studentName || ext.fatherName || ext.bFormNo || ext.fatherCnic) ? (
                          <div className="space-y-0.5 text-[11px]">
                            {ext.studentName && (
                              <div>
                                <span className="text-slate-400">Student: </span>
                                <span className="font-semibold text-brand-text-primary">{ext.studentName}</span>
                              </div>
                            )}
                            {ext.fatherName && (
                              <div>
                                <span className="text-slate-400">Father: </span>
                                <span className="font-medium text-brand-text-primary">{ext.fatherName}</span>
                              </div>
                            )}
                            {ext.bFormNo && (
                              <div>
                                <span className="text-slate-400">B-Form: </span>
                                <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                                  {ext.bFormNo}
                                </span>
                              </div>
                            )}
                            {ext.fatherCnic && (
                              <div>
                                <span className="text-slate-400">CNIC: </span>
                                <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
                                  {ext.fatherCnic}
                                </span>
                              </div>
                            )}
                            {ext.dob && (
                              <div>
                                <span className="text-slate-400">DOB: </span>
                                <span className="text-brand-text-secondary">{ext.dob}</span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 italic text-[11px]">
                            No NADRA text detected
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4">
                        <span className="font-medium text-brand-text-primary text-xs">
                          {doc.rotationApplied || 0}° CW
                        </span>
                      </td>

                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          <div className="w-12 bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
                            <div
                              className="bg-emerald-500 h-full"
                              style={{
                                width: `${Math.round((doc.classificationConfidence || 0.8) * 100)}%`,
                              }}
                            />
                          </div>
                          <span className="font-mono text-[11px] font-semibold text-brand-text-primary">
                            {Math.round((doc.classificationConfidence || 0.8) * 100)}%
                          </span>
                        </div>
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => onRescanDoc(doc.id)}
                            disabled={isOperatingDoc}
                            className="p-1.5 rounded-lg min-w-[36px] min-h-[36px] flex items-center justify-center text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 transition-colors cursor-pointer"
                            title="Rescan document"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => onDeleteDocPrompt(doc)}
                            disabled={isOperatingDoc}
                            className="p-1.5 rounded-lg min-w-[36px] min-h-[36px] flex items-center justify-center text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/60 transition-colors cursor-pointer"
                            title="Delete document scan"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>

                          {doc.grNo === 'UNASSIGNED' ? (
                            <button
                              type="button"
                              onClick={() => onAssignDocPrompt(doc)}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 shadow-xs transition-colors cursor-pointer"
                            >
                              <UserPlus className="w-3.5 h-3.5" />
                              <span>Assign to GR</span>
                            </button>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => onAssignDocPrompt(doc)}
                                className="p-1.5 rounded-lg min-w-[36px] min-h-[36px] flex items-center justify-center text-slate-400 hover:text-brand-text-primary hover:bg-brand-bg transition-colors cursor-pointer"
                                title="Reassign to another GR"
                              >
                                <UserPlus className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => onOpenStudentModal(doc.grNo)}
                                className="px-2.5 py-1 rounded-lg text-xs font-semibold text-brand-primary bg-brand-primary/10 hover:bg-brand-primary/20 transition-colors cursor-pointer"
                              >
                                View Dossier
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
});

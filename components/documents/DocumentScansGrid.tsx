import React from 'react';
import { CheckSquare, Trash2 } from 'lucide-react';
import { StudentDocumentRecord } from '../../types/documentArchive';
import { DocumentScansTableRow } from './DocumentScansTableRow';

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
                      className="rounded border-slate-300 text-brand-primary focus:ring-brand-primary cursor-pointer"
                    />
                  </th>
                  <th className="py-3 px-3 w-16">Preview</th>
                  <th className="py-3 px-3">GR No</th>
                  <th className="py-3 px-3">Type</th>
                  <th className="py-3 px-3">Identified Subject</th>
                  <th className="py-3 px-3">Key Identifiers</th>
                  <th className="py-3 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-border/40">
                {filteredDocuments.map((doc) => (
                  <DocumentScansTableRow
                    key={doc.id}
                    doc={doc}
                    isSelected={selectedDocIds.includes(doc.id)}
                    isOperatingDoc={isOperatingDoc}
                    onToggleSelectDoc={onToggleSelectDoc}
                    onPreviewDoc={onPreviewDoc}
                    onRescanDoc={onRescanDoc}
                    onDeleteDocPrompt={onDeleteDocPrompt}
                    onAssignDocPrompt={onAssignDocPrompt}
                    onOpenStudentModal={onOpenStudentModal}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
});
DocumentScansGrid.displayName = 'DocumentScansGrid';

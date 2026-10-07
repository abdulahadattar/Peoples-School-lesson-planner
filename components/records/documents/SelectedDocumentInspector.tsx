import React from 'react';
import {
  StudentDocumentRecord,
  DocumentClassificationType,
  DOCUMENT_LABELS,
} from '../../../types/documentArchive';
import {
  RotateCw,
  ZoomIn,
  RefreshCw,
  ScanLine,
  FileText,
  Check,
} from 'lucide-react';

export interface SelectedDocumentInspectorProps {
  selectedDoc: StudentDocumentRecord | null;
  isChangingTag: boolean;
  isRotating: boolean;
  isReprocessing: boolean;
  isSelectingChild: boolean;
  onTagChange: (newTag: DocumentClassificationType) => void;
  onRotate: (angle: 90 | 180 | 270) => void;
  onPreviewModal: (doc: StudentDocumentRecord) => void;
  onReprocessDoc: (docId: string) => void;
  onSelectChild: (entryNoOrIndex: number) => void;
}

export const SelectedDocumentInspector: React.FC<SelectedDocumentInspectorProps> = ({
  selectedDoc,
  isChangingTag,
  isRotating,
  isReprocessing,
  isSelectingChild,
  onTagChange,
  onRotate,
  onPreviewModal,
  onReprocessDoc,
  onSelectChild,
}) => {
  if (!selectedDoc) {
    return (
      <div className="py-16 text-center text-slate-400 text-xs">
        Select a document from the left to view details
      </div>
    );
  }

  return (
    <>
      {/* Header actions: Tag dropdown & Rotate */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-brand-border">
        <div className="flex items-center gap-2">
          <span className="text-xs text-brand-text-secondary">Tag:</span>
          <select
            value={selectedDoc.classification}
            disabled={isChangingTag}
            onChange={(e) => onTagChange(e.target.value as DocumentClassificationType)}
            className="text-xs font-medium bg-brand-bg border border-brand-border rounded-lg px-2.5 py-1 text-brand-text-primary focus:outline-hidden focus:ring-1 focus:ring-brand-primary"
          >
            {Object.entries(DOCUMENT_LABELS).map(([val, label]) => (
              <option key={val} value={val}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onReprocessDoc(selectedDoc.id)}
            disabled={isReprocessing}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 transition-colors active:scale-95 disabled:opacity-50"
            title="Rescan this document"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isReprocessing ? 'animate-spin' : ''}`} />
            <span>Rescan</span>
          </button>

          <button
            type="button"
            onClick={() => onRotate(90)}
            disabled={isRotating}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg bg-brand-bg hover:bg-slate-200 dark:hover:bg-slate-800 text-brand-text-primary border border-brand-border transition-colors active:scale-95"
            title="Rotate 90° clockwise"
          >
            <RotateCw className={`w-3.5 h-3.5 ${isRotating ? 'animate-spin' : ''}`} />
            <span>Rotate 90°</span>
          </button>

          <button
            type="button"
            onClick={() => onPreviewModal(selectedDoc)}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg bg-brand-bg hover:bg-slate-200 dark:hover:bg-slate-800 text-brand-text-primary border border-brand-border transition-colors"
            title="Zoom into scan"
          >
            <ZoomIn className="w-3.5 h-3.5" />
            <span>Full View</span>
          </button>
        </div>
      </div>

      {/* Image Preview Container */}
      <div className="relative rounded-lg overflow-hidden bg-slate-950 flex items-center justify-center min-h-[280px] max-h-[400px] border border-brand-border group">
        {selectedDoc.filename.toLowerCase().endsWith('.pdf') ? (
          <iframe
            src={selectedDoc.url}
            className="w-full h-[380px] rounded border-0 pointer-events-none"
            title={selectedDoc.originalFilename}
          />
        ) : (
          <img
            src={selectedDoc.url}
            alt={selectedDoc.originalFilename}
            className="max-h-[380px] w-auto object-contain rounded transition-transform sm:group-hover:scale-102"
          />
        )}
        <button
          type="button"
          onClick={() => onPreviewModal(selectedDoc)}
          aria-label="Open full-screen document preview"
          className="absolute inset-0 bg-black/30 flex items-center justify-center transition-opacity text-white active:bg-black/45 sm:opacity-0 sm:group-hover:opacity-100"
        >
          <span className="px-3 py-1.5 rounded-lg bg-black/60 text-xs font-medium backdrop-blur-xs flex items-center gap-1.5">
            <ZoomIn className="w-4 h-4" /> Tap to Zoom
          </span>
        </button>
      </div>

      {/* Extracted Details Pill Card */}
      <div className="bg-brand-bg rounded-xl p-3 border border-brand-border text-xs space-y-2">
        <div className="flex items-center justify-between text-brand-primary font-bold text-[11px] uppercase tracking-wider">
          <div className="flex items-center gap-1.5">
            <ScanLine className="w-3.5 h-3.5" />
            <span>Extracted Record (Target Student)</span>
          </div>
          <span className="text-slate-400 font-normal">
            Confidence: {Math.round((selectedDoc.classificationConfidence || 0.85) * 100)}%
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-1">
          <div>
            <span className="text-[10px] text-brand-text-secondary block">Student Name</span>
            <span className="font-semibold text-brand-text-primary">
              {selectedDoc.extractedData.studentName || 'Not detected'}
            </span>
          </div>
          <div>
            <span className="text-[10px] text-brand-text-secondary block">
              {selectedDoc.classification === 'FATHER_CNIC_FRONT' ? 'Father (Cardholder)' : 'Father Name'}
            </span>
            <span className="font-semibold text-brand-text-primary">
              {selectedDoc.extractedData.fatherName || 'Not detected'}
            </span>
          </div>
          {selectedDoc.extractedData.paternalGrandfatherName && (
            <div>
              <span className="text-[10px] text-brand-text-secondary block">Paternal Grandfather</span>
              <span className="font-semibold text-slate-700 dark:text-slate-300">
                {selectedDoc.extractedData.paternalGrandfatherName}
              </span>
            </div>
          )}
          <div>
            <span className="text-[10px] text-brand-text-secondary block">B-Form / CRC</span>
            <span className="font-mono font-medium text-emerald-600 dark:text-emerald-400">
              {selectedDoc.extractedData.bFormNo || 'N/A'}
            </span>
          </div>
          <div>
            <span className="text-[10px] text-brand-text-secondary block">Father CNIC</span>
            <span className="font-mono font-medium text-indigo-600 dark:text-indigo-400">
              {selectedDoc.extractedData.fatherCnic || 'N/A'}
            </span>
          </div>
          <div>
            <span className="text-[10px] text-brand-text-secondary block">Date of Birth</span>
            <span className="font-medium text-brand-text-primary">
              {selectedDoc.extractedData.dob || 'N/A'}
            </span>
          </div>
          <div>
            <span className="text-[10px] text-brand-text-secondary block">G.R. Number</span>
            <span className="font-mono font-semibold text-brand-primary">
              {selectedDoc.extractedData.grNo || selectedDoc.grNo}
            </span>
          </div>
        </div>
      </div>

      {/* Multi-Child CRC Sibling Entries Table */}
      {selectedDoc.extractedData.children && selectedDoc.extractedData.children.length > 0 && (
        <div className="bg-brand-bg rounded-xl p-3 border border-brand-border text-xs space-y-2.5 animate-fadeIn">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-bold text-brand-text-primary">
              <FileText className="w-3.5 h-3.5 text-brand-primary" />
              <span>All Siblings on this B-Form Certificate ({selectedDoc.extractedData.children.length})</span>
            </div>
            <span className="text-[10px] text-brand-text-secondary">
              Click &apos;Select&apos; to switch target student entry
            </span>
          </div>

          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left border-collapse text-[11px]">
              <thead>
                <tr className="border-b border-brand-border/80 text-brand-text-secondary uppercase text-[10px]">
                  <th className="py-1.5 px-2">#</th>
                  <th className="py-1.5 px-2">Child Name</th>
                  <th className="py-1.5 px-2">B-Form / Citizen #</th>
                  <th className="py-1.5 px-2">DOB / Gender</th>
                  <th className="py-1.5 px-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-border/40 font-medium">
                {selectedDoc.extractedData.children.map((ch, idx) => {
                  const isTarget =
                    (ch.bFormNo && ch.bFormNo.replace(/\D/g, '') === (selectedDoc.extractedData.bFormNo || '').replace(/\D/g, '')) ||
                    (ch.name && selectedDoc.extractedData.studentName && ch.name.toLowerCase().trim() === selectedDoc.extractedData.studentName.toLowerCase().trim());

                  return (
                    <tr
                      key={idx}
                      className={`transition-colors ${
                        isTarget
                          ? 'bg-brand-primary/10 text-brand-text-primary font-bold'
                          : 'hover:bg-white/60 dark:hover:bg-slate-800/60 text-brand-text-secondary'
                      }`}
                    >
                      <td className="py-2 px-2 font-mono">{ch.entryNo || idx + 1}</td>
                      <td className="py-2 px-2">
                        <div className="text-brand-text-primary font-semibold">
                          {ch.name || 'Unnamed Entry'}
                        </div>
                        {ch.nameUrdu && (
                          <div className="text-[10px] text-slate-400 font-normal">
                            {ch.nameUrdu}
                          </div>
                        )}
                        {ch.hasTickMark && (
                          <span className="inline-block mt-0.5 px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300">
                            ✓ Marked in Scan
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-2 font-mono text-emerald-600 dark:text-emerald-400">
                        {ch.bFormNo || 'N/A'}
                      </td>
                      <td className="py-2 px-2">
                        <div>{ch.dob || '—'}</div>
                        {ch.gender && (
                          <span className="text-[10px] text-slate-400">{ch.gender}</span>
                        )}
                      </td>
                      <td className="py-2 px-2 text-right">
                        {isTarget ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 inline-flex items-center gap-1">
                            <Check className="w-3 h-3" /> Selected
                          </span>
                        ) : (
                          <button
                            type="button"
                            disabled={isSelectingChild}
                            onClick={() => onSelectChild(ch.entryNo || idx + 1)}
                            className="px-2 py-1 rounded text-[10px] font-semibold bg-white dark:bg-slate-800 border border-brand-border hover:border-brand-primary text-brand-primary transition-all cursor-pointer active:scale-95 disabled:opacity-50"
                          >
                            Select Target
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
};

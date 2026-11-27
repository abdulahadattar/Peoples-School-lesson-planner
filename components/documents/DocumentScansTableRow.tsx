import React from 'react';
import { ZoomIn, RefreshCw, Trash2, UserPlus } from 'lucide-react';
import { StudentDocumentRecord, DOCUMENT_LABELS } from '../../types/documentArchive';
import { DocThumbnail } from './DocThumbnail';

export interface DocumentScansTableRowProps {
  doc: StudentDocumentRecord;
  isSelected: boolean;
  isOperatingDoc: boolean;
  onToggleSelectDoc: (docId: string) => void;
  onPreviewDoc: (doc: StudentDocumentRecord) => void;
  onRescanDoc: (docId: string) => void;
  onDeleteDocPrompt: (doc: StudentDocumentRecord) => void;
  onAssignDocPrompt: (doc: StudentDocumentRecord) => void;
  onOpenStudentModal: (grNo: string) => void;
}

export const DocumentScansTableRow: React.FC<DocumentScansTableRowProps> = ({
  doc,
  isSelected,
  isOperatingDoc,
  onToggleSelectDoc,
  onPreviewDoc,
  onRescanDoc,
  onDeleteDocPrompt,
  onAssignDocPrompt,
  onOpenStudentModal,
}) => {
  const isUnassigned = doc.grNo === 'UNASSIGNED';

  return (
    <tr
      className={`border-b border-brand-border/60 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors ${
        isSelected ? 'bg-indigo-50/50 dark:bg-indigo-950/30' : ''
      }`}
    >
      <td className="py-2.5 px-3 text-center">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onToggleSelectDoc(doc.id)}
          className="rounded border-slate-300 text-brand-primary focus:ring-brand-primary cursor-pointer"
        />
      </td>
      <td className="py-2.5 px-3">
        <div
          onClick={() => onPreviewDoc(doc)}
          className="relative group cursor-pointer w-12 h-16 rounded-md overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xs"
        >
          <DocThumbnail
            url={doc.url}
            classification={doc.classification}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
            <ZoomIn className="w-3.5 h-3.5" />
          </div>
        </div>
      </td>
      <td className="py-2.5 px-3">
        {isUnassigned ? (
          <span className="px-2 py-0.5 rounded-md font-mono text-[11px] font-bold bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
            UNASSIGNED
          </span>
        ) : (
          <div className="flex flex-wrap items-center gap-1">
            <button
              type="button"
              onClick={() => onOpenStudentModal(doc.grNo)}
              className="font-mono font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
            >
              GR #{doc.grNo}
            </button>
            {Array.isArray(doc.linkedGrNos) &&
              doc.linkedGrNos
                .filter((g) => g && g !== doc.grNo)
                .slice(0, 3)
                .map((sibGr) => (
                  <button
                    key={sibGr}
                    type="button"
                    onClick={() => onOpenStudentModal(sibGr)}
                    title={`Linked sibling GR #${sibGr}`}
                    className="px-1.5 py-0.5 rounded bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 font-mono text-[10px] font-semibold hover:underline cursor-pointer"
                  >
                    +{sibGr}
                  </button>
                ))}
          </div>
        )}
      </td>
      <td className="py-2.5 px-3">
        <div className="flex flex-wrap items-center gap-1">
          <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-brand-bg text-brand-text-primary border border-brand-border inline-block">
            {DOCUMENT_LABELS[doc.classification] || doc.classification}
          </span>
          {(doc.preClassifiedAs === 'portrait' || doc.aiSkipped) && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
              Photo
            </span>
          )}
          {doc.misfiledWarning && (
            <span
              title={doc.misfiledWarning}
              className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300"
            >
              Misfiled
            </span>
          )}
        </div>
      </td>
      <td className="py-2.5 px-3">
        <div className="font-semibold text-brand-text-primary text-[11px]">
          {doc.extractedData?.studentName || doc.extractedData?.fatherName || doc.extractedData?.cardholderName || '—'}
        </div>
        <div className="text-[10px] text-brand-text-tertiary truncate max-w-[180px]">
          {doc.folderName ? `${doc.folderName} / ` : ''}
          {doc.originalFilename || doc.filename}
        </div>
      </td>
      <td className="py-2.5 px-3">
        <div className="font-mono text-[11px] text-brand-text-secondary">
          {doc.extractedData?.bFormNo || doc.extractedData?.fatherCnic || '—'}
        </div>
      </td>
      <td className="py-2.5 px-3 text-right">
        <div className="flex items-center justify-end gap-1">
          {isUnassigned && (
            <button
              type="button"
              onClick={() => onAssignDocPrompt(doc)}
              title="Assign to Student"
              className="p-1.5 rounded-lg text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/50 transition-colors"
            >
              <UserPlus className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => onRescanDoc(doc.id)}
            disabled={isOperatingDoc}
            title="Re-check document"
            className="p-1.5 rounded-lg text-slate-500 hover:text-brand-primary hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onDeleteDocPrompt(doc)}
            disabled={isOperatingDoc}
            title="Delete document"
            className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
};

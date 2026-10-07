import React from 'react';
import {
  StudentDossier,
  StudentDocumentRecord,
  DOCUMENT_LABELS,
} from '../../../types/documentArchive';
import { Image as ImageIcon, ChevronRight } from 'lucide-react';

export interface DocumentScansListProps {
  dossier: StudentDossier;
  selectedDoc: StudentDocumentRecord | null;
  onSelectDoc: (doc: StudentDocumentRecord) => void;
}

export const DocumentScansList: React.FC<DocumentScansListProps> = ({
  dossier,
  selectedDoc,
  onSelectDoc,
}) => {
  return (
    <div className="space-y-2">
      <h5 className="text-xs font-bold uppercase tracking-wider text-brand-text-secondary px-1">
        Archived Scans ({dossier.documents.length})
      </h5>
      <div className="space-y-2">
        {dossier.documents.map((doc) => {
          const isSelected = selectedDoc?.id === doc.id;
          const isPhoto = doc.classification === 'STUDENT_PHOTO';
          return (
            <button
              key={doc.id}
              type="button"
              onClick={() => onSelectDoc(doc)}
              className={`w-full text-left p-2.5 rounded-xl border transition-all flex items-center gap-3 ${
                isSelected
                  ? 'bg-brand-primary/10 border-brand-primary/40 ring-1 ring-brand-primary/20'
                  : 'bg-white dark:bg-brand-surface border-brand-border hover:bg-brand-bg'
              }`}
            >
              <div className="w-12 h-12 rounded-lg bg-slate-100 dark:bg-slate-800 overflow-hidden border border-brand-border/60 flex-shrink-0 flex items-center justify-center">
                {doc.url ? (
                  <img
                    src={doc.url}
                    alt={doc.filename}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                ) : (
                  <ImageIcon className="w-5 h-5 text-slate-400" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-brand-text-primary truncate">
                    {DOCUMENT_LABELS[doc.classification] || doc.classification}
                  </span>
                  {isPhoto && (
                    <span className="px-1.5 py-0.2 text-[9px] bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 rounded font-semibold">
                      Color
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-brand-text-secondary truncate mt-0.5 font-mono">
                  {doc.originalFilename}
                </p>
                <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-400">
                  <span>{(doc.fileSizeBytes / 1024).toFixed(0)} KB</span>
                  <span>•</span>
                  <span>{doc.isBlackAndWhite ? 'B&W Scan' : 'Color'}</span>
                </div>
              </div>
              <ChevronRight
                className={`w-4 h-4 flex-shrink-0 ${
                  isSelected ? 'text-brand-primary' : 'text-slate-400'
                }`}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
};

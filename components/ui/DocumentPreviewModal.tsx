import React, { useState, useEffect } from 'react';
import { X, ZoomIn, ZoomOut, RotateCw, ExternalLink, Download } from 'lucide-react';
import { DOCUMENT_LABELS, DocumentClassificationType } from '../../types/documentArchive';
import { triggerFileDownload } from '../../utils/download';

export interface PreviewableDocument {
  id?: string;
  url: string;
  filename: string;
  originalFilename?: string;
  classification?: DocumentClassificationType | string;
  grNo?: string;
  studentName?: string;
}

export interface DocumentPreviewModalProps {
  document: PreviewableDocument | null;
  isOpen: boolean;
  onClose: () => void;
  onRotate?: (id: string, angle: number) => void;
  isRotating?: boolean;
}

export const DocumentPreviewModal: React.FC<DocumentPreviewModalProps> = ({
  document: doc,
  isOpen,
  onClose,
  onRotate,
  isRotating = false,
}) => {
  const [zoom, setZoom] = useState<number>(1);

  useEffect(() => {
    if (!isOpen) return;
    setZoom(1);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !doc) return null;

  const isPdf = (doc.filename || doc.url || '').toLowerCase().endsWith('.pdf');
  const displayName = doc.originalFilename || doc.filename;
  const classificationLabel = doc.classification
    ? DOCUMENT_LABELS[doc.classification as DocumentClassificationType] || doc.classification
    : 'Document';

  return (
    <div
      className="fixed inset-0 z-[125] bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 animate-fadeIn"
      role="dialog"
      aria-modal="true"
    >
      <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />

      <div
        className="relative bg-white dark:bg-slate-900 rounded-2xl max-w-5xl w-full p-4 border border-black/[0.08] dark:border-white/[0.1] shadow-2xl flex flex-col max-h-[92vh] z-10 transition-all space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-black/[0.06] dark:border-white/[0.08] shrink-0">
          <div className="flex items-center gap-2 min-w-0 pr-2">
            {doc.grNo && (
              <span className="text-xs font-mono font-bold text-primary shrink-0">
                GR #{doc.grNo}
              </span>
            )}
            {doc.grNo && <span className="text-slate-400 shrink-0">•</span>}
            <span className="text-xs font-bold text-slate-900 dark:text-white shrink-0">
              {classificationLabel}
            </span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono truncate max-w-[180px] sm:max-w-[320px]">
              ({displayName})
            </span>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Rotate button */}
            {!isPdf && onRotate && doc.id && (
              <button
                type="button"
                onClick={() => onRotate(doc.id!, 90)}
                disabled={isRotating}
                className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center gap-1 cursor-pointer border border-slate-200 dark:border-slate-700"
                title="Rotate document 90° clockwise"
              >
                <RotateCw className={`w-3.5 h-3.5 ${isRotating ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Rotate 90°</span>
              </button>
            )}

            {/* Zoom Controls */}
            {!isPdf && (
              <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5 border border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.max(0.5, Number((z - 0.25).toFixed(2))))}
                  className="p-1.5 rounded hover:bg-white dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
                  title="Zoom Out"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span className="text-[11px] font-mono px-2 text-slate-600 dark:text-slate-400 select-none">
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.min(3, Number((z + 0.25).toFixed(2))))}
                  className="p-1.5 rounded hover:bg-white dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
                  title="Zoom In"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
                {zoom !== 1 && (
                  <button
                    type="button"
                    onClick={() => setZoom(1)}
                    className="text-[10px] font-semibold px-1.5 py-0.5 ml-1 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-300 cursor-pointer"
                    title="Reset Zoom"
                  >
                    Reset
                  </button>
                )}
              </div>
            )}

            {/* Direct Download Button */}
            <button
              type="button"
              onClick={() => triggerFileDownload(doc.url, displayName)}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              title="Download file"
            >
              <Download className="w-4 h-4" />
            </button>

            {/* External Link Button */}
            <a
              href={doc.url}
              target="_blank"
              rel="noreferrer"
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              title="Open raw file in new tab"
            >
              <ExternalLink className="w-4 h-4" />
            </a>

            {/* Close */}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              aria-label="Close preview"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-auto bg-slate-950 rounded-xl p-3 flex items-center justify-center min-h-[420px] max-h-[75vh]">
          {isPdf ? (
            <iframe
              src={doc.url}
              className="w-full h-[68vh] rounded border-0"
              title={displayName}
            />
          ) : (
            <div className="overflow-auto max-w-full max-h-full flex items-center justify-center">
              <img
                src={doc.url}
                alt={displayName}
                style={{
                  transform: `scale(${zoom})`,
                  transformOrigin: 'center center',
                  transition: 'transform 0.15s ease-out',
                }}
                className="max-h-[70vh] w-auto object-contain rounded shadow-lg select-none"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

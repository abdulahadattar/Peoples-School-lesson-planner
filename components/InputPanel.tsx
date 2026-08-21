
import React, { useRef } from 'react';
import { FileIcon } from './icons/FileIcon';
import { UploadIcon } from './icons/UploadIcon';
import { FolderIcon, CloudDownloadIcon } from './icons/MiscIcons';

declare global {
  namespace React {
      interface InputHTMLAttributes<T> {
        webkitdirectory?: string;
        directory?: string;
      }
  }
}

interface ContextPdfForDisplay {
    name: string;
    grade: string;
    unit: string;
}

interface InputPanelProps {
  onDirectorySelected: (files: FileList) => void;
  directoryName: string | null;
  contextPdfs: ContextPdfForDisplay[];
}

const getGradeColorClasses = (grade: string): string => {
  const gradeNum = parseInt(grade.replace('Grade ', ''), 10);
  switch (gradeNum) {
    case 9:
      return 'text-blue-700 bg-blue-100 dark:text-blue-200 dark:bg-blue-900/50';
    case 10:
      return 'text-emerald-700 bg-emerald-100 dark:text-emerald-200 dark:bg-emerald-900/50';
    case 11:
      return 'text-amber-700 bg-amber-100 dark:text-amber-200 dark:bg-amber-900/50';
    case 12:
      return 'text-rose-700 bg-rose-100 dark:text-rose-200 dark:bg-rose-900/50';
    default:
      return 'text-slate-700 bg-slate-100 dark:text-slate-300 dark:bg-slate-700';
  }
};

const unitColors = [
    'text-teal-700 bg-teal-100 dark:text-teal-200 dark:bg-teal-900/50',
    'text-cyan-700 bg-cyan-100 dark:text-cyan-200 dark:bg-cyan-900/50',
    'text-sky-700 bg-sky-100 dark:text-sky-200 dark:bg-sky-900/50',
    'text-indigo-700 bg-indigo-100 dark:text-indigo-200 dark:bg-indigo-900/50',
    'text-violet-700 bg-violet-100 dark:text-violet-200 dark:bg-violet-900/50',
    'text-purple-700 bg-purple-100 dark:text-purple-200 dark:bg-purple-900/50',
    'text-fuchsia-700 bg-fuchsia-100 dark:text-fuchsia-200 dark:bg-fuchsia-900/50',
    'text-pink-700 bg-pink-100 dark:text-pink-200 dark:bg-pink-900/50',
];

const getUnitColorClasses = (unit: string): string => {
  const unitNum = parseInt(unit, 10);
  if (isNaN(unitNum)) {
    const hash = unit.split('').reduce((acc, char) => char.charCodeAt(0) + ((acc << 5) - acc), 0);
    return unitColors[Math.abs(hash) % unitColors.length];
  }
  return unitColors[unitNum % unitColors.length];
};


const InputPanel: React.FC<InputPanelProps> = ({ 
    onDirectorySelected,
    directoryName,
    contextPdfs
}) => {
  const directoryInputRef = useRef<HTMLInputElement>(null);

  const handleDirectoryChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      if (event.target.files) {
          onDirectorySelected(event.target.files);
      }
  };

  const handleConnectClick = () => {
      directoryInputRef.current?.click();
  };

  return (
    <div className="flex flex-col gap-6">
        <div className="bg-brand-bg rounded-xl border border-brand-border p-4">
            <p className="text-xs text-brand-text-secondary mb-3 leading-relaxed">
              {directoryName === 'Online Textbooks' 
                  ? 'Currently using online textbook resources. To use local files, upload a folder containing PDFs.' 
                  : 'Grounds generation with content from provided textbooks.'
              }
            </p>
            
            <input
                type="file"
                webkitdirectory="true"
                directory="true"
                multiple
                ref={directoryInputRef}
                onChange={handleDirectoryChange}
                style={{ display: 'none' }}
             />
             
              <button
                   onClick={handleConnectClick}
                   className="group w-full relative overflow-hidden bg-brand-surface border border-brand-border hover:border-brand-primary rounded-lg p-4 transition-all hover:bg-brand-bg flex flex-col items-center justify-center gap-2"
               >
                <div className="p-2 bg-brand-bg rounded-full transition-transform">
                    <FolderIcon className="w-5 h-5 text-brand-primary" />
                </div>
                <span className="text-sm font-bold text-brand-text-primary group-hover:text-brand-primary transition-colors">Upload Folder</span>
                <span className="text-[10px] text-brand-text-secondary text-center">Supports PDF curriculum files</span>
            </button>
        </div>

        {directoryName && (
            <div>
                <h4 className="text-xs font-bold text-brand-text-secondary uppercase tracking-wider mb-2 flex items-center justify-between">
                    <span>Active Context</span>
                    <span className="bg-brand-primary/10 text-brand-primary px-1.5 py-0.5 rounded text-[10px] font-mono">{contextPdfs.length}</span>
                </h4>
                
                <div className="bg-brand-bg rounded-xl border border-brand-border overflow-hidden max-h-[400px] overflow-y-auto custom-scrollbar">
                    {contextPdfs.length > 0 ? (
                        <div className="divide-y divide-brand-border">
                            {contextPdfs.sort((a,b) => a.name.localeCompare(b.name, undefined, {numeric: true})).map(pdf => (
                                <div key={pdf.name} className="flex items-center gap-3 p-3 hover:bg-brand-surface transition-colors group">
                                    <FileIcon className="w-4 h-4 text-brand-text-secondary group-hover:text-brand-primary transition-colors flex-shrink-0" />
                                    <div className="flex-grow min-w-0">
                                        <p className="text-xs text-brand-text-primary truncate font-medium" title={pdf.name}>{pdf.name}</p>
                                        <div className="flex items-center gap-1 mt-1">
                                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${getGradeColorClasses(pdf.grade)}`}>{pdf.grade}</span>
                                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${getUnitColorClasses(pdf.unit)}`}>Unit {pdf.unit}</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center p-6">
                            <p className="text-xs text-brand-text-secondary">No valid Grade/Unit PDFs found.</p>
                        </div>
                    )}
                </div>
            </div>
        )}
    </div>
  );
};

export default InputPanel;

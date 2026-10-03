import React, { useState } from 'react';
import { FileText } from 'lucide-react';

export interface DocThumbnailProps {
  url?: string;
  filename?: string;
  classification?: string;
  className?: string;
}

export const DocThumbnail: React.FC<DocThumbnailProps> = React.memo(({
  url,
  filename = '',
  classification = '',
  className = 'w-full h-full object-cover',
}) => {
  const [hasError, setHasError] = useState(false);
  const isPdf = filename.toLowerCase().endsWith('.pdf');

  if (!url || hasError || isPdf) {
    return (
      <div className="w-full h-full bg-slate-100 dark:bg-slate-800 flex flex-col items-center justify-center p-1 text-center select-none overflow-hidden">
        <FileText className="w-5 h-5 text-brand-primary/80 mb-0.5 flex-shrink-0" />
        <span className="text-[9px] font-mono font-bold text-slate-500 uppercase truncate max-w-full px-0.5">
          {isPdf ? 'PDF' : classification ? classification.slice(0, 6) : 'DOC'}
        </span>
      </div>
    );
  }

  return (
    <img
      src={url}
      alt={filename}
      className={className}
      onError={() => setHasError(true)}
      loading="lazy"
    />
  );
});

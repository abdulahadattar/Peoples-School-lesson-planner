/**
 * Triggers a file download in the browser from a Blob, string, or URL.
 */
export function triggerFileDownload(content: Blob | string, filename: string, mimeType?: string): void {
  if (typeof window === 'undefined') return;

  const blob = typeof content === 'string' 
    ? new Blob([content], { type: mimeType || 'text/plain;charset=utf-8' })
    : content;
    
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  // Free memory
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

export const downloadFile = triggerFileDownload;

export function downloadCsv(filename: string, csvContent: string): void {
  triggerFileDownload(csvContent, filename, 'text/csv;charset=utf-8;');
}

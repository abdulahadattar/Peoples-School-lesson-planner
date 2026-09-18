import {
  StudentDossier,
  BatchProcessingJob,
  StudentDocumentRecord,
  DocumentClassificationType,
  DocumentDiscrepancy,
} from '../types/documentArchive';

const CHUNK_SIZE_BYTES = 2.5 * 1024 * 1024; // 2.5MB per chunk to easily stay below all 413 reverse proxy limits

/**
 * Format raw error messages and strip HTML error pages (such as 413 Request Entity Too Large)
 */
export function formatApiErrorMessage(status: number, rawText: string): string {
  if (status === 413 || /413|Entity Too Large|Request Entity Too Large/i.test(rawText)) {
    return 'The file or batch exceeds the maximum single request size (413). It has been split or please upload files individually.';
  }

  // If server returned an HTML error document
  if (/<html/i.test(rawText)) {
    const titleMatch = rawText.match(/<title[^>]*>(.*?)<\/title>/i);
    const h1Match = rawText.match(/<h1[^>]*>(.*?)<\/h1>/i);
    const h2Match = rawText.match(/<h2[^>]*>(.*?)<\/h2>/i);
    const cleaned = (h1Match?.[1] || titleMatch?.[1] || h2Match?.[1] || 'Network request error')
      .replace(/<[^>]+>/g, '')
      .trim();
    return `Server Error (${status}): ${cleaned}`;
  }

  try {
    const parsed = JSON.parse(rawText);
    if (parsed.error) return parsed.error;
    if (parsed.message) return parsed.message;
  } catch {
    // raw plain text
  }

  return rawText.slice(0, 300) || `Request failed with status ${status}`;
}

/**
 * Upload a large file (or large PDF/ZIP) in safe 2.5MB chunks to prevent HTTP 413 errors
 */
async function uploadFileInChunks(
  file: File,
  grNo?: string,
  isZip?: boolean,
  onProgress?: (percent: number, msg?: string) => void
): Promise<BatchProcessingJob> {
  const uploadId = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE_BYTES);

  let completedJob: BatchProcessingJob | null = null;

  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
    const start = chunkIndex * CHUNK_SIZE_BYTES;
    const end = Math.min(file.size, start + CHUNK_SIZE_BYTES);
    const slice = file.slice(start, end);
    const chunkBase64 = await blobToBase64(slice);

    const progressPct = Math.round(((chunkIndex + 1) / totalChunks) * 100);
    if (onProgress) {
      onProgress(progressPct, `Uploading ${file.name} chunk ${chunkIndex + 1}/${totalChunks} (${progressPct}%)...`);
    }

    const res = await fetch('/api/documents/upload-chunk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uploadId,
        chunkIndex,
        totalChunks,
        chunkBase64,
        filename: file.name,
        grNo,
        isZip: isZip || file.name.toLowerCase().endsWith('.zip'),
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(formatApiErrorMessage(res.status, errText));
    }

    const data = await res.json();
    if (data.completed && data.job) {
      completedJob = data.job;
    }
  }

  if (completedJob) {
    return completedJob;
  }

  // Fallback check latest job
  const latest = await fetchLatestJob();
  if (latest) return latest;
  throw new Error('Upload completed but job initialization could not be verified.');
}

export async function uploadZipArchive(
  file: File,
  onProgress?: (percent: number, msg?: string) => void
): Promise<BatchProcessingJob> {
  // If ZIP is larger than 4MB, upload in safe chunks
  if (file.size > 4 * 1024 * 1024) {
    return uploadFileInChunks(file, undefined, true, onProgress);
  }

  if (onProgress) onProgress(10, `Preparing ${file.name}...`);
  const base64Data = await fileToBase64(file);
  if (onProgress) onProgress(50, `Uploading ${file.name}...`);

  const res = await fetch('/api/documents/upload-zip', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      base64Data,
      filename: file.name,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(formatApiErrorMessage(res.status, errText));
  }

  if (onProgress) onProgress(100, `Processing ${file.name}...`);
  const data = await res.json();
  return data.job;
}

/**
 * Upload individual or multiple files/PDFs using per-file streaming to prevent 413 Request Entity Too Large
 */
export async function uploadIndividualFiles(
  files: File[],
  grNo?: string,
  onProgress?: (percent: number, msg?: string) => void
): Promise<BatchProcessingJob> {
  if (files.length === 0) {
    throw new Error('No files selected for upload');
  }

  // 1. Initialize a batch job on the server
  if (onProgress) onProgress(5, `Initializing upload job for ${files.length} document(s)...`);
  const initRes = await fetch('/api/documents/create-job', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expectedCount: files.length }),
  });

  if (!initRes.ok) {
    const errText = await initRes.text();
    throw new Error(formatApiErrorMessage(initRes.status, errText));
  }

  const { job: initialJob } = await initRes.json();
  const jobId = initialJob.id;

  // 2. Stream files individually or in chunked mode
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const currentPercent = Math.round((i / files.length) * 90) + 5;
    if (onProgress) {
      onProgress(currentPercent, `Uploading (${i + 1}/${files.length}): ${file.name}...`);
    }

    if (file.size > 4 * 1024 * 1024) {
      // Large file / PDF: upload via chunks attached to the student
      await uploadFileInChunks(file, grNo, false, (chunkPct) => {
        if (onProgress) {
          onProgress(
            currentPercent,
            `Uploading ${file.name} (${i + 1}/${files.length}) [${chunkPct}%]...`
          );
        }
      });
    } else {
      // Normal size file (< 4MB): send directly as single file item to avoid bundling large payloads
      const base64Data = await fileToBase64(file);
      const uploadRes = await fetch('/api/documents/upload-single', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId,
          filename: file.name,
          base64Data,
          grNo,
        }),
      });

      if (!uploadRes.ok) {
        const errText = await uploadRes.text();
        throw new Error(formatApiErrorMessage(uploadRes.status, errText));
      }
    }
  }

  // 3. Finalize batch job and kick off background queue
  if (onProgress) onProgress(95, 'Finalizing batch queue & starting AI processing...');
  const finalizeRes = await fetch('/api/documents/finalize-job', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jobId }),
  });

  if (!finalizeRes.ok) {
    const errText = await finalizeRes.text();
    throw new Error(formatApiErrorMessage(finalizeRes.status, errText));
  }

  const finalizeData = await finalizeRes.json();
  if (onProgress) onProgress(100, 'All documents uploaded successfully!');
  return finalizeData.job;
}

export async function fetchJobStatus(jobId: string): Promise<BatchProcessingJob> {
  const res = await fetch(`/api/documents/jobs/${jobId}`);
  if (!res.ok) throw new Error('Job status check failed');
  const data = await res.json();
  return data.job;
}

export async function fetchLatestJob(): Promise<BatchProcessingJob | null> {
  try {
    const res = await fetch('/api/documents/jobs-latest');
    if (!res.ok) return null;
    const data = await res.json();
    return data.job || null;
  } catch {
    return null;
  }
}

export async function fetchAllDossiers(): Promise<StudentDossier[]> {
  const res = await fetch('/api/documents/dossiers');
  if (!res.ok) throw new Error('Failed to fetch dossiers');
  const data = await res.json();
  return data.dossiers || [];
}

export async function fetchAllDocuments(): Promise<StudentDocumentRecord[]> {
  const res = await fetch('/api/documents/all-docs');
  if (!res.ok) throw new Error('Failed to fetch documents');
  const data = await res.json();
  return data.documents || [];
}

export async function auditAllDossiers(records: any[]): Promise<{ discrepancies: Record<string, DocumentDiscrepancy[]>; dossiers: StudentDossier[] }> {
  const res = await fetch('/api/documents/audit-all', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ records }),
  });
  if (!res.ok) return { discrepancies: {}, dossiers: [] };
  return await res.json();
}

export async function fetchDossierByGr(grNo: string): Promise<StudentDossier | null> {
  const res = await fetch(`/api/documents/dossiers/${grNo}`);
  if (!res.ok) return null;
  const data = await res.json();
  return data.dossier || null;
}

export async function auditDossier(grNo: string, sheetRecord: any): Promise<DocumentDiscrepancy[]> {
  const res = await fetch(`/api/documents/audit/${grNo}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sheetRecord }),
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.discrepancies || [];
}

export async function updateDocumentTagOrRotation(
  docId: string,
  newTag?: DocumentClassificationType,
  rotateAngle?: 90 | 180 | 270
): Promise<StudentDocumentRecord> {
  const res = await fetch('/api/documents/update-doc', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ docId, newTag, rotateAngle }),
  });
  if (!res.ok) throw new Error('Failed to update document metadata');
  const data = await res.json();
  return data.document;
}

export async function retryFailedJob(jobId: string): Promise<BatchProcessingJob> {
  const res = await fetch(`/api/documents/jobs/${jobId}/retry`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(formatApiErrorMessage(res.status, errText));
  }
  const data = await res.json();
  return data.job;
}

export async function autoLinkDocuments(records: any[]): Promise<{
  ok: boolean;
  totalMatched: number;
  reassignedDocs: number;
  dossiers: StudentDossier[];
  documents: StudentDocumentRecord[];
  discrepancies: Record<string, DocumentDiscrepancy[]>;
}> {
  const res = await fetch('/api/documents/auto-link', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ records }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(formatApiErrorMessage(res.status, err));
  }
  return await res.json();
}

export async function assignDocumentToStudent(
  docId: string,
  targetGrNo: string,
  studentRecord?: any
): Promise<{ ok: boolean; document: StudentDocumentRecord; dossier?: StudentDossier }> {
  const res = await fetch('/api/documents/assign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ docId, targetGrNo, studentRecord }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(formatApiErrorMessage(res.status, err));
  }
  return await res.json();
}

export async function dismissDiscrepancyFlag(flagId: string): Promise<boolean> {
  const res = await fetch('/api/documents/discrepancies/dismiss', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ flagId }),
  });
  if (!res.ok) return false;
  const data = await res.json();
  return Boolean(data.success);
}

export async function undismissDiscrepancyFlag(flagId: string): Promise<boolean> {
  const res = await fetch('/api/documents/discrepancies/undismiss', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ flagId }),
  });
  if (!res.ok) return false;
  const data = await res.json();
  return Boolean(data.success);
}

export async function fetchDismissedFlags(): Promise<Record<string, boolean>> {
  try {
    const res = await fetch('/api/documents/dismissed-flags');
    if (!res.ok) return {};
    const data = await res.json();
    return data.flags || {};
  } catch {
    return {};
  }
}

export function getExportZipUrl(targetClass?: string): string {
  return `/api/documents/export-zip?class=${encodeURIComponent(targetClass || 'ALL')}`;
}

function fileToBase64(file: File): Promise<string> {
  return blobToBase64(file);
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(blob);
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1] || '';
      resolve(base64);
    };
    reader.onerror = (err) => reject(err);
  });
}


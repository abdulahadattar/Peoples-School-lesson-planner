import { BatchProcessingJob, StudentDocumentRecord } from '../../types/documentArchive';

const CHUNK_SIZE_BYTES = 2.5 * 1024 * 1024;

export function formatApiErrorMessage(status: number, rawText: string): string {
  if (status === 413 || /413|Entity Too Large|Request Entity Too Large/i.test(rawText)) {
    return 'The file or batch exceeds the maximum single request size (413). Please upload files individually.';
  }
  if (/<html/i.test(rawText)) {
    const titleMatch = rawText.match(/<title[^>]*>(.*?)<\/title>/i);
    const h1Match = rawText.match(/<h1[^>]*>(.*?)<\/h1>/i);
    const cleaned = (h1Match?.[1] || titleMatch?.[1] || 'Network request error').replace(/<[^>]+>/g, '').trim();
    return `Server Error (${status}): ${cleaned}`;
  }
  try {
    const parsed = JSON.parse(rawText);
    if (parsed.error) return parsed.error;
    if (parsed.message) return parsed.message;
  } catch {}
  return rawText.slice(0, 300) || `Request failed with status ${status}`;
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1] || result;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1] || result;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export async function uploadFileInChunks(
  file: File,
  jobId: string,
  grNo?: string,
  isZip?: boolean,
  onProgress?: (percent: number, msg?: string) => void
): Promise<boolean> {
  const uploadId = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE_BYTES);
  let completed = false;

  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
    const start = chunkIndex * CHUNK_SIZE_BYTES;
    const end = Math.min(file.size, start + CHUNK_SIZE_BYTES);
    const slice = file.slice(start, end);
    const chunkBase64 = await blobToBase64(slice);
    const progressPct = Math.round(((chunkIndex + 1) / totalChunks) * 100);
    if (onProgress) {
      onProgress(progressPct, `Uploading ${file.name} (${progressPct}%)...`);
    }
    const res = await fetch('/api/documents/upload-chunk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uploadId, chunkIndex, totalChunks, chunkBase64,
        filename: file.name, grNo, jobId, isZip: isZip || file.name.toLowerCase().endsWith('.zip'),
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(formatApiErrorMessage(res.status, errText));
    }
    const data = await res.json();
    if (data.completed) completed = true;
  }
  return completed;
}

export async function uploadZipArchive(
  file: File,
  onProgress?: (percent: number, msg?: string) => void
): Promise<BatchProcessingJob> {
  if (onProgress) onProgress(5, `Preparing ${file.name}...`);
  const initRes = await fetch('/api/documents/create-job', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expectedCount: 1 }),
  });
  if (!initRes.ok) throw new Error(formatApiErrorMessage(initRes.status, await initRes.text()));
  const { job: initialJob } = await initRes.json();
  const jobId = initialJob.jobId ?? initialJob.id;

  if (file.size > CHUNK_SIZE_BYTES) {
    await uploadFileInChunks(file, jobId, undefined, true, (pct, msg) => {
      if (onProgress) onProgress(10 + Math.round(pct / 100 * 85), msg);
    });
  } else {
    const base64Data = await fileToBase64(file);
    const res = await fetch('/api/documents/upload-single', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId, filename: file.name, base64Data }),
    });
    if (!res.ok) throw new Error(formatApiErrorMessage(res.status, await res.text()));
  }

  const finalizeRes = await fetch('/api/documents/finalize-job', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jobId }),
  });
  if (!finalizeRes.ok) throw new Error(formatApiErrorMessage(finalizeRes.status, await finalizeRes.text()));
  const data = await finalizeRes.json();
  return data.job;
}

export async function uploadIndividualFiles(
  files: Array<{ file: File; grNo?: string }>,
  onProgress?: (percent: number, msg?: string) => void
): Promise<BatchProcessingJob> {
  const initRes = await fetch('/api/documents/create-job', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expectedCount: files.length }),
  });
  if (!initRes.ok) throw new Error(formatApiErrorMessage(initRes.status, await initRes.text()));
  const { job: initialJob } = await initRes.json();
  const jobId = initialJob.jobId ?? initialJob.id;

  for (let i = 0; i < files.length; i++) {
    const { file, grNo } = files[i];
    if (file.size > CHUNK_SIZE_BYTES) {
      await uploadFileInChunks(file, jobId, grNo, false);
    } else {
      const base64Data = await fileToBase64(file);
      await fetch('/api/documents/upload-single', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId, filename: file.name, grNo, base64Data }),
      });
    }
    if (onProgress) onProgress(Math.round(((i + 1) / files.length) * 100));
  }

  const finalizeRes = await fetch('/api/documents/finalize-job', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jobId }),
  });
  const data = await finalizeRes.json();
  return data.job;
}

export async function uploadSingleDocumentForStudent(
  grNo: string,
  file: File,
  onProgress?: (percent: number, msg?: string) => void
): Promise<StudentDocumentRecord> {
  const job = await uploadIndividualFiles([{ file, grNo }], onProgress);
  return {
    id: job.id,
    jobId: job.id,
    grNo,
    originalFilename: file.name,
    filename: file.name,
    url: '',
    fileHash: '',
    fileSizeBytes: file.size,
    width: 0,
    height: 0,
    rotationApplied: 0,
    isBlackAndWhite: false,
    classification: 'OTHER_UNCLASSIFIED',
    classificationConfidence: 0.8,
    extractedData: { grNo },
    discrepancies: [],
    status: 'verified',
    processedAt: new Date().toISOString()
  };
}

export async function replaceDocumentScan(
  docId: string,
  newFile: File
): Promise<StudentDocumentRecord> {
  const base64Data = await fileToBase64(newFile);
  const res = await fetch('/api/documents/replace', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ docId, filename: newFile.name, base64Data }),
  });
  if (!res.ok) throw new Error(formatApiErrorMessage(res.status, await res.text()));
  const data = await res.json();
  return data.document;
}

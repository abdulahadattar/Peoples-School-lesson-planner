import { BatchProcessingJob, StudentDocumentRecord } from '../../types/documentArchive';
import { preClassifyAndOptimizeClientFile } from '../../utils/clientImagePreClassifier.js';

const CHUNK_SIZE_BYTES = 2.5 * 1024 * 1024;

export interface UploadPacketMeta {
  folderName?: string;
  packetId?: string;
  parsedFolderGrNo?: string;
  preClassifiedAs?: 'portrait' | 'document';
  aiSkipped?: boolean;
}

export function formatApiErrorMessage(status: number, rawText: string): string {
  if (status === 413 || /413|Entity Too Large|Request Entity Too Large/i.test(rawText)) {
    return 'File size is too large. Please upload files individually.';
  }
  if (/<html/i.test(rawText)) {
    return 'Request failed. Please check your connection and try again.';
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
  onProgress?: (percent: number, msg?: string) => void,
  meta?: UploadPacketMeta
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
        uploadId,
        chunkIndex,
        totalChunks,
        chunkBase64,
        filename: file.name,
        grNo,
        jobId,
        isZip: isZip || file.name.toLowerCase().endsWith('.zip'),
        folderName: meta?.folderName,
        packetId: meta?.packetId,
        parsedFolderGrNo: meta?.parsedFolderGrNo,
        preClassifiedAs: meta?.preClassifiedAs,
        aiSkipped: meta?.aiSkipped,
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
    body: JSON.stringify({ expectedCount: 1, sourceType: 'zip' }),
  });
  if (!initRes.ok) throw new Error(formatApiErrorMessage(initRes.status, await initRes.text()));
  const { job: initialJob } = await initRes.json();
  const jobId = initialJob.jobId ?? initialJob.id;

  if (file.size > CHUNK_SIZE_BYTES) {
    const chunked = await uploadFileInChunks(file, jobId, undefined, true, (pct, msg) => {
      if (onProgress) onProgress(10 + Math.round((pct / 100) * 85), msg);
    });
    if (!chunked) throw new Error(`Chunked upload of ${file.name} did not complete`);
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

/**
 * Prepares a single File with client-side Face/Portrait vs Text/Document detection
 * + selective greyscale conversion, then uploads it into an existing batch job.
 */
export async function uploadPreparedFileToJob(
  jobId: string,
  entry: {
    file: File;
    grNo?: string;
    folderName?: string;
    packetId?: string;
    parsedFolderGrNo?: string;
  }
): Promise<{
  preClassifiedAs?: 'portrait' | 'document';
  aiSkipped: boolean;
}> {
  const prepared = await preClassifyAndOptimizeClientFile(entry.file);
  const meta: UploadPacketMeta = {
    folderName: entry.folderName,
    packetId: entry.packetId,
    parsedFolderGrNo: entry.parsedFolderGrNo,
    preClassifiedAs: prepared.preClassifiedAs,
    aiSkipped: prepared.aiSkipped,
  };

  if (prepared.file.size > CHUNK_SIZE_BYTES) {
    const chunked = await uploadFileInChunks(
      prepared.file,
      jobId,
      entry.grNo,
      false,
      undefined,
      meta
    );
    if (!chunked) throw new Error(`${entry.file.name} (incomplete chunks)`);
  } else {
    const res = await fetch('/api/documents/upload-single', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jobId,
        filename: prepared.file.name,
        grNo: entry.grNo,
        base64Data: prepared.base64Data,
        folderName: meta.folderName,
        packetId: meta.packetId,
        parsedFolderGrNo: meta.parsedFolderGrNo,
        preClassifiedAs: meta.preClassifiedAs,
        aiSkipped: meta.aiSkipped,
      }),
    });
    if (!res.ok) {
      throw new Error(formatApiErrorMessage(res.status, await res.text()));
    }
  }

  return {
    preClassifiedAs: prepared.preClassifiedAs,
    aiSkipped: prepared.aiSkipped,
  };
}

export async function uploadIndividualFiles(
  files: Array<{
    file: File;
    grNo?: string;
    folderName?: string;
    packetId?: string;
    parsedFolderGrNo?: string;
  }>,
  onProgress?: (percent: number, msg?: string) => void,
  jobMeta?: { sourceType?: 'zip' | 'individual' | 'drive' | 'student_single'; driveFolderId?: string }
): Promise<BatchProcessingJob> {
  const initRes = await fetch('/api/documents/create-job', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      expectedCount: files.length,
      sourceType: jobMeta?.sourceType || 'individual',
      driveFolderId: jobMeta?.driveFolderId,
    }),
  });
  if (!initRes.ok) throw new Error(formatApiErrorMessage(initRes.status, await initRes.text()));
  const { job: initialJob } = await initRes.json();
  const jobId = initialJob.jobId ?? initialJob.id;

  const batchPacketId = `pkt_upload_${jobId}`;
  const failedFiles: string[] = [];

  for (let i = 0; i < files.length; i++) {
    const item = files[i];
    const packetId = item.packetId || (item.grNo ? `pkt_gr_${item.grNo}` : batchPacketId);
    try {
      const outcome = await uploadPreparedFileToJob(jobId, {
        ...item,
        packetId,
      });
      if (onProgress) {
        const tag =
          outcome.preClassifiedAs === 'portrait'
            ? 'Photo'
            : outcome.preClassifiedAs === 'document'
            ? 'Document'
            : 'Uploaded';
        onProgress(
          Math.round(((i + 1) / files.length) * 100),
          `${tag}: ${item.file.name}`
        );
      }
    } catch (err: any) {
      failedFiles.push(`${item.file.name} (${err?.message || 'network error'})`);
    }
  }

  if (failedFiles.length > 0) {
    throw new Error(
      `Upload failed for: ${failedFiles.slice(0, 3).join('; ')}${
        failedFiles.length > 3 ? ` (+${failedFiles.length - 3} more)` : ''
      }`
    );
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

export async function uploadSingleDocumentForStudent(
  grNo: string,
  file: File,
  onProgress?: (percent: number, msg?: string) => void
): Promise<StudentDocumentRecord> {
  const job = await uploadIndividualFiles(
    [{ file, grNo, parsedFolderGrNo: grNo, packetId: `pkt_gr_${grNo}` }],
    onProgress,
    { sourceType: 'student_single' }
  );
  const jobId = (job as any).jobId ?? job.id;

  for (let attempt = 0; attempt < 25; attempt++) {
    const docsRes = await fetch('/api/documents/all-docs');
    if (docsRes.ok) {
      const docsData = await docsRes.json();
      const matched = (docsData.documents || []).find(
        (d: StudentDocumentRecord) => d.jobId === jobId || (d.grNo === grNo && d.originalFilename === file.name)
      );
      if (matched) return matched;
    }
    const statusRes = await fetch(`/api/documents/jobs/${encodeURIComponent(jobId)}`);
    if (statusRes.ok) {
      const statusData = await statusRes.json();
      if (statusData?.job?.status === 'completed' || statusData?.job?.status === 'failed') break;
    }
    await new Promise((r) => setTimeout(r, 800));
  }

  throw new Error(`Uploaded "${file.name}" for GR #${grNo}, but it could not be saved.`);
}

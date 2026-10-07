import {
  StudentDossier,
  BatchProcessingJob,
  StudentDocumentRecord,
  DocumentClassificationType,
} from '../../types/documentArchive';
import { formatApiErrorMessage } from './clientUpload.js';

export async function fetchStudentDossier(grNo: string): Promise<StudentDossier | null> {
  const res = await fetch(`/api/documents/dossier/${encodeURIComponent(grNo)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(formatApiErrorMessage(res.status, await res.text()));
  const data = await res.json();
  return data.dossier;
}

export async function fetchAllDossiers(): Promise<StudentDossier[]> {
  const res = await fetch('/api/documents/dossiers');
  if (!res.ok) throw new Error(formatApiErrorMessage(res.status, await res.text()));
  const data = await res.json();
  return data.dossiers || [];
}

export async function fetchAllDocuments(): Promise<StudentDocumentRecord[]> {
  const res = await fetch('/api/documents/all');
  if (!res.ok) throw new Error(formatApiErrorMessage(res.status, await res.text()));
  const data = await res.json();
  return data.documents || [];
}

export async function fetchJobStatus(jobId: string): Promise<BatchProcessingJob | null> {
  const res = await fetch(`/api/documents/job/${encodeURIComponent(jobId)}`);
  if (!res.ok) return null;
  const data = await res.json();
  return data.job;
}

export async function fetchLatestJob(): Promise<BatchProcessingJob | null> {
  const res = await fetch('/api/documents/job-latest');
  if (!res.ok) return null;
  const data = await res.json();
  return data.job;
}

export async function stopJob(jobId: string): Promise<boolean> {
  const res = await fetch(`/api/documents/job/${encodeURIComponent(jobId)}/stop`, { method: 'POST' });
  return res.ok;
}

export async function retryFailedDocuments(jobId: string): Promise<BatchProcessingJob | null> {
  const res = await fetch(`/api/documents/job/${encodeURIComponent(jobId)}/retry`, { method: 'POST' });
  if (!res.ok) return null;
  const data = await res.json();
  return data.job;
}

export async function updateDocumentMetadata(
  docId: string,
  newTag?: DocumentClassificationType,
  rotateAngle?: 90 | 180 | 270
): Promise<StudentDocumentRecord> {
  const res = await fetch('/api/documents/update-meta', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ docId, newTag, rotateAngle }),
  });
  if (!res.ok) throw new Error(formatApiErrorMessage(res.status, await res.text()));
  const data = await res.json();
  return data.document;
}

export async function deleteDocumentScan(docId: string): Promise<boolean> {
  const res = await fetch(`/api/documents/delete/${encodeURIComponent(docId)}`, { method: 'DELETE' });
  return res.ok;
}

export async function deleteMultipleDocumentScans(docIds: string[]): Promise<number> {
  const res = await fetch('/api/documents/delete-batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ docIds }),
  });
  if (!res.ok) throw new Error(formatApiErrorMessage(res.status, await res.text()));
  const data = await res.json();
  return data.deletedCount || 0;
}

export async function rescanDocumentScan(docId: string): Promise<StudentDocumentRecord> {
  const res = await fetch(`/api/documents/rescan/${encodeURIComponent(docId)}`, { method: 'POST' });
  if (!res.ok) throw new Error(formatApiErrorMessage(res.status, await res.text()));
  const data = await res.json();
  return data.document;
}

export async function rescanAllDocuments(): Promise<{ total: number; rescanned: number; errors: number }> {
  const res = await fetch('/api/documents/rescan-all', { method: 'POST' });
  if (!res.ok) throw new Error(formatApiErrorMessage(res.status, await res.text()));
  return res.json();
}

export async function reprocessDocumentWithAi(docId: string): Promise<StudentDocumentRecord> {
  const res = await fetch(`/api/documents/reprocess/${encodeURIComponent(docId)}`, { method: 'POST' });
  if (!res.ok) throw new Error(formatApiErrorMessage(res.status, await res.text()));
  const data = await res.json();
  return data.document;
}

export async function reprocessDossierWithAi(grNo: string): Promise<StudentDossier> {
  const res = await fetch(`/api/documents/reprocess-dossier/${encodeURIComponent(grNo)}`, { method: 'POST' });
  if (!res.ok) throw new Error(formatApiErrorMessage(res.status, await res.text()));
  const data = await res.json();
  return data.dossier;
}

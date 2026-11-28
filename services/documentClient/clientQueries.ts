import {
  StudentDossier,
  BatchProcessingJob,
  StudentDocumentRecord,
  DocumentClassificationType,
} from '../../types/documentArchive';
import { formatApiErrorMessage } from './clientUpload.js';
import { getFirebaseIdToken } from '../googleAuth.js';

const DOC_CACHE_TTL_MS = 5 * 60 * 1000;

let cachedDossiers: { data: StudentDossier[]; fetchedAt: number } | null = null;
let inFlightDossiers: Promise<StudentDossier[]> | null = null;

let cachedDocsSnapshot: {
  data: { documents: StudentDocumentRecord[]; aiConfigured: boolean };
  fetchedAt: number;
} | null = null;
let inFlightDocsSnapshot: Promise<{
  documents: StudentDocumentRecord[];
  aiConfigured: boolean;
}> | null = null;

export function peekCachedDossiers(maxAgeMs: number = DOC_CACHE_TTL_MS): StudentDossier[] | null {
  if (!cachedDossiers) return null;
  if (Date.now() - cachedDossiers.fetchedAt >= maxAgeMs) return null;
  return cachedDossiers.data;
}

export function peekCachedDocumentsSnapshot(maxAgeMs: number = DOC_CACHE_TTL_MS): {
  documents: StudentDocumentRecord[];
  aiConfigured: boolean;
} | null {
  if (!cachedDocsSnapshot) return null;
  if (Date.now() - cachedDocsSnapshot.fetchedAt >= maxAgeMs) return null;
  return cachedDocsSnapshot.data;
}

export function invalidateDocumentClientCache(): void {
  cachedDossiers = null;
  cachedDocsSnapshot = null;
}

export async function fetchStudentDossier(grNo: string): Promise<StudentDossier | null> {
  const res = await fetch(`/api/documents/dossiers/${encodeURIComponent(grNo)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(formatApiErrorMessage(res.status, await res.text()));
  const data = await res.json();
  return data.dossier;
}

export async function fetchAllDossiers(forceRefresh: boolean = false): Promise<StudentDossier[]> {
  if (!forceRefresh) {
    const cached = peekCachedDossiers();
    if (cached) return cached;
  }
  if (!forceRefresh && inFlightDossiers) {
    return inFlightDossiers;
  }

  const requestPromise = (async () => {
    const res = await fetch('/api/documents/dossiers');
    if (!res.ok) throw new Error(formatApiErrorMessage(res.status, await res.text()));
    const data = await res.json();
    const dossiers: StudentDossier[] = data.dossiers || [];
    cachedDossiers = { data: dossiers, fetchedAt: Date.now() };
    return dossiers;
  })().finally(() => {
    if (inFlightDossiers === requestPromise) {
      inFlightDossiers = null;
    }
  });

  if (!forceRefresh) {
    inFlightDossiers = requestPromise;
  }
  return requestPromise;
}

export async function fetchDocumentsSnapshot(forceRefresh: boolean = false): Promise<{
  documents: StudentDocumentRecord[];
  aiConfigured: boolean;
}> {
  if (!forceRefresh) {
    const cached = peekCachedDocumentsSnapshot();
    if (cached) return cached;
  }
  if (!forceRefresh && inFlightDocsSnapshot) {
    return inFlightDocsSnapshot;
  }

  const requestPromise = (async () => {
    const res = await fetch('/api/documents/all-docs');
    if (!res.ok) throw new Error(formatApiErrorMessage(res.status, await res.text()));
    const data = await res.json();
    const snapshot = {
      documents: data.documents || [],
      aiConfigured: data.aiConfigured !== false,
    };
    cachedDocsSnapshot = { data: snapshot, fetchedAt: Date.now() };
    return snapshot;
  })().finally(() => {
    if (inFlightDocsSnapshot === requestPromise) {
      inFlightDocsSnapshot = null;
    }
  });

  if (!forceRefresh) {
    inFlightDocsSnapshot = requestPromise;
  }
  return requestPromise;
}

export async function fetchAllDocuments(forceRefresh: boolean = false): Promise<StudentDocumentRecord[]> {
  const snap = await fetchDocumentsSnapshot(forceRefresh);
  return snap.documents;
}

/**
 * Schema-parity guard (C5): stub-era responses exposed only `jobId`; the real
 * pipeline exposes `id`. The transparency modal reads id, the upload client
 * reads `jobId ?? id` — normalize whichever one is missing so no consumer of
 * a mixed-shape response ever polls `/api/documents/jobs/${undefined}`.
 */
function normalizeJobId(job: BatchProcessingJob | null): BatchProcessingJob | null {
  if (!job || typeof job !== 'object') return null;
  const paired = job as BatchProcessingJob & { jobId?: string };
  if (!job.id && paired.jobId) job.id = paired.jobId;
  if (!paired.jobId && job.id) paired.jobId = job.id;
  return job;
}

export async function fetchJobStatus(jobId: string): Promise<BatchProcessingJob | null> {
  // A falsy id cannot name a job — never hit /api/documents/jobs/undefined.
  if (!jobId) return null;
  const res = await fetch(`/api/documents/jobs/${encodeURIComponent(jobId)}`);
  if (!res.ok) return null;
  const data = await res.json();
  return normalizeJobId(data.job);
}

export async function fetchLatestJob(): Promise<BatchProcessingJob | null> {
  const res = await fetch('/api/documents/jobs-latest');
  if (!res.ok) return null;
  const data = await res.json();
  return normalizeJobId(data.job);
}

export async function stopJob(jobId: string): Promise<boolean> {
  const res = await fetch(`/api/documents/jobs/${encodeURIComponent(jobId)}/stop`, { method: 'POST' });
  return res.ok;
}

export async function retryFailedDocuments(jobId: string): Promise<BatchProcessingJob | null> {
  if (!jobId) return null;
  const res = await fetch(`/api/documents/jobs/${encodeURIComponent(jobId)}/retry`, { method: 'POST' });
  if (!res.ok) return null;
  const data = await res.json();
  invalidateDocumentClientCache();
  return normalizeJobId(data.job);
}

export async function updateDocumentMetadata(
  docId: string,
  newTag?: DocumentClassificationType,
  rotateAngle?: 90 | 180 | 270
): Promise<StudentDocumentRecord> {
  const res = await fetch('/api/documents/update-doc', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ docId, newTag, rotateAngle }),
  });
  if (!res.ok) throw new Error(formatApiErrorMessage(res.status, await res.text()));
  const data = await res.json();
  invalidateDocumentClientCache();
  return data.document;
}

export async function deleteDocumentScan(docId: string): Promise<boolean> {
  const res = await fetch('/api/documents/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ docId }),
  });
  if (res.ok) invalidateDocumentClientCache();
  return res.ok;
}

export async function deleteMultipleDocumentScans(docIds: string[]): Promise<number> {
  const res = await fetch('/api/documents/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ docIds }),
  });
  if (!res.ok) throw new Error(formatApiErrorMessage(res.status, await res.text()));
  const data = await res.json();
  invalidateDocumentClientCache();
  return data.deletedCount || 0;
}

export async function rescanDocumentScan(docId: string): Promise<StudentDocumentRecord> {
  const res = await fetch('/api/documents/rescan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ docId }),
  });
  if (!res.ok) throw new Error(formatApiErrorMessage(res.status, await res.text()));
  const data = await res.json();
  invalidateDocumentClientCache();
  return data.document;
}

export async function rescanAllDocuments(): Promise<{ total: number; rescanned: number; errors: number }> {
  const res = await fetch('/api/documents/rescan-all', { method: 'POST' });
  if (!res.ok) throw new Error(formatApiErrorMessage(res.status, await res.text()));
  invalidateDocumentClientCache();
  return res.json();
}

export async function reprocessDocumentWithAi(docId: string): Promise<StudentDocumentRecord> {
  const res = await fetch('/api/documents/reprocess-doc', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ docId }),
  });
  if (!res.ok) throw new Error(formatApiErrorMessage(res.status, await res.text()));
  const data = await res.json();
  invalidateDocumentClientCache();
  return data.document;
}

export async function reprocessDossierWithAi(grNo: string): Promise<StudentDossier> {
  const res = await fetch('/api/documents/reprocess-dossier', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ grNo }),
  });
  if (!res.ok) throw new Error(formatApiErrorMessage(res.status, await res.text()));
  const data = await res.json();
  invalidateDocumentClientCache();
  return data.dossier;
}

export async function resetDocumentArchiveForTesting(): Promise<{
  ok: boolean;
  resetBy?: string;
  summary: Record<string, number>;
}> {
  const token = await getFirebaseIdToken();
  if (!token) {
    throw new Error('Please sign in with an authorized Admin Google account first.');
  }
  const res = await fetch('/api/documents/admin-reset', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) throw new Error(formatApiErrorMessage(res.status, await res.text()));
  invalidateDocumentClientCache();
  return res.json();
}

import {
  StudentDossier,
  StudentDocumentRecord,
  DocumentDiscrepancy,
} from '../../types/documentArchive';
import { formatApiErrorMessage } from './clientUpload.js';
import { invalidateDocumentClientCache } from './clientQueries.js';

export async function fetchDiscrepancyFlags(records?: any[]): Promise<Record<string, DocumentDiscrepancy[]>> {
  const res = await fetch('/api/documents/audit-all', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ records: records || [] }),
  });
  if (!res.ok) throw new Error(formatApiErrorMessage(res.status, await res.text()));
  const data = await res.json();
  return data.discrepancies || {};
}

export async function dismissDiscrepancyFlag(flagId: string): Promise<boolean> {
  const res = await fetch('/api/documents/discrepancies/dismiss', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ flagId }),
  });
  if (res.ok) invalidateDocumentClientCache();
  return res.ok;
}

export async function undismissDiscrepancyFlag(flagId: string): Promise<boolean> {
  const res = await fetch('/api/documents/discrepancies/undismiss', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ flagId }),
  });
  if (res.ok) invalidateDocumentClientCache();
  return res.ok;
}

export async function fetchDismissedFlags(): Promise<Record<string, boolean>> {
  const res = await fetch('/api/documents/dismissed-flags');
  if (!res.ok) return {};
  const data = await res.json();
  return data.flags || {};
}

export async function applyCorrectionToRecord(
  grNo: string,
  flagId: string,
  correction: { field: string; newValue: string; reason?: string },
  accessToken?: string
): Promise<{ success: boolean; message: string; updatedRecord?: any; dossier?: StudentDossier }> {
  const res = await fetch('/api/documents/discrepancies/apply-correction', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ grNo, flagId, correction, accessToken }),
  });
  if (!res.ok) throw new Error(formatApiErrorMessage(res.status, await res.text()));
  invalidateDocumentClientCache();
  return res.json();
}

export async function batchApplyCorrections(
  corrections: Array<{ grNo: string; flagId: string; field: string; newValue: string; reason?: string }>,
  accessToken?: string
): Promise<{ success: boolean; appliedCount: number; errors: string[] }> {
  const res = await fetch('/api/documents/discrepancies/batch-apply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ corrections, accessToken }),
  });
  if (!res.ok) throw new Error(formatApiErrorMessage(res.status, await res.text()));
  invalidateDocumentClientCache();
  return res.json();
}

export async function autoLinkDocumentsWithSheet(records: any[]): Promise<{
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
  if (!res.ok) throw new Error(formatApiErrorMessage(res.status, await res.text()));
  invalidateDocumentClientCache();
  return res.json();
}

export async function downloadAuditCsvReport(targetClass: string = 'ALL'): Promise<void> {
  const link = document.createElement('a');
  link.href = `/api/documents/export-zip?class=${encodeURIComponent(targetClass)}`;
  link.download =
    targetClass === 'ALL'
      ? 'PHSSJ_All_Students_Documents.zip'
      : `PHSSJ_Class_${targetClass}_Documents.zip`;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export async function selectChildRecordForDoc(docId: string, entryNoOrIndex: number): Promise<StudentDocumentRecord> {
  const res = await fetch('/api/documents/select-child', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ docId, entryNoOrIndex }),
  });
  if (!res.ok) throw new Error(formatApiErrorMessage(res.status, await res.text()));
  const data = await res.json();
  invalidateDocumentClientCache();
  return data.document;
}

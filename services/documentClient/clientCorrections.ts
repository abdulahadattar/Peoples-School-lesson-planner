import {
  StudentDossier,
  StudentDocumentRecord,
  DocumentDiscrepancy,
} from '../../types/documentArchive';
import { formatApiErrorMessage } from './clientUpload.js';

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
  const res = await fetch(`/api/documents/flag/${encodeURIComponent(flagId)}/dismiss`, { method: 'POST' });
  return res.ok;
}

export async function undismissDiscrepancyFlag(flagId: string): Promise<boolean> {
  const res = await fetch(`/api/documents/flag/${encodeURIComponent(flagId)}/undismiss`, { method: 'POST' });
  return res.ok;
}

export async function fetchDismissedFlags(): Promise<Record<string, boolean>> {
  const res = await fetch('/api/documents/dismissed-flags');
  if (!res.ok) return {};
  const data = await res.json();
  return data.dismissedFlags || {};
}

export async function applyCorrectionToRecord(
  grNo: string,
  flagId: string,
  correction: { field: string; newValue: string; reason?: string },
  accessToken?: string
): Promise<{ success: boolean; message: string; updatedRecord?: any; dossier?: StudentDossier }> {
  const res = await fetch('/api/documents/apply-correction', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ grNo, flagId, correction, accessToken }),
  });
  if (!res.ok) throw new Error(formatApiErrorMessage(res.status, await res.text()));
  return res.json();
}

export async function batchApplyCorrections(
  corrections: Array<{ grNo: string; flagId: string; field: string; newValue: string; reason?: string }>,
  accessToken?: string
): Promise<{ success: boolean; appliedCount: number; errors: string[] }> {
  const res = await fetch('/api/documents/batch-apply-corrections', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ corrections, accessToken }),
  });
  if (!res.ok) throw new Error(formatApiErrorMessage(res.status, await res.text()));
  return res.json();
}

export async function autoLinkDocumentsWithSheet(records: any[]): Promise<{
  totalMatched: number;
  reassignedDocs: number;
  dossiers: StudentDossier[];
  documents: StudentDocumentRecord[];
  discrepancies: Record<string, DocumentDiscrepancy[]>;
}> {
  const res = await fetch('/api/documents/autolink', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ records }),
  });
  if (!res.ok) throw new Error(formatApiErrorMessage(res.status, await res.text()));
  return res.json();
}

export async function downloadAuditCsvReport(targetClass: string = 'ALL'): Promise<void> {
  window.open(`/api/documents/export/zip?class=${encodeURIComponent(targetClass)}`, '_blank');
}

export async function selectChildRecordForDoc(docId: string, entryNoOrIndex: number): Promise<StudentDocumentRecord> {
  const res = await fetch('/api/documents/select-child', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ docId, entryNoOrIndex }),
  });
  if (!res.ok) throw new Error(formatApiErrorMessage(res.status, await res.text()));
  const data = await res.json();
  return data.document;
}

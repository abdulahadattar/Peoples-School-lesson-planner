/**
 * Client Document Archive Service Facade
 */
export * from './documentClient/clientUpload.js';
export * from './documentClient/clientQueries.js';
export * from './documentClient/clientCorrections.js';

import {
  fetchDiscrepancyFlags,
  autoLinkDocumentsWithSheet,
  applyCorrectionToRecord,
  batchApplyCorrections,
  selectChildRecordForDoc,
} from './documentClient/clientCorrections.js';
import {
  fetchStudentDossier,
  updateDocumentMetadata,
  deleteDocumentScan,
  deleteMultipleDocumentScans,
  rescanDocumentScan,
  reprocessDocumentWithAi,
  reprocessDossierWithAi,
} from './documentClient/clientQueries.js';

// Backward compatibility aliases
export const fetchDossierByGr = fetchStudentDossier;
export const auditAllDossiers = fetchDiscrepancyFlags;
export const auditDossier = async (grNo: string, sheetRecord?: any) => {
  const flags = await fetchDiscrepancyFlags(sheetRecord ? [sheetRecord] : []);
  return flags[grNo] || [];
};
export const updateDocumentTagOrRotation = updateDocumentMetadata;
export const selectTargetChildClient = selectChildRecordForDoc;
export const reprocessDocClient = reprocessDocumentWithAi;
export const reprocessDossierClient = reprocessDossierWithAi;
export const autoLinkDocuments = autoLinkDocumentsWithSheet;
export const deleteDocument = deleteDocumentScan;
export const deleteDocumentsBatch = deleteMultipleDocumentScans;
export const rescanDocument = rescanDocumentScan;
export const applyDiscrepancyCorrectionClient = applyCorrectionToRecord;
export const batchApplyDiscrepancyCorrectionsClient = batchApplyCorrections;
export const getExportZipUrl = (targetClass?: string) => `/api/documents/export/zip?class=${encodeURIComponent(targetClass || 'ALL')}`;
export const retryFailedJob = async (jobId: string) => {
  const res = await fetch(`/api/documents/job/${encodeURIComponent(jobId)}/retry`, { method: 'POST' });
  if (!res.ok) return null;
  const data = await res.json();
  return data.job;
};
export const assignDocumentToStudent = async (docId: string, grNo: string, studentRecord?: any) => {
  const res = await fetch('/api/documents/assign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ docId, targetGrNo: grNo, studentRecord }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.document;
};
export const queryCandidateMatches = async (_profile: any) => {
  return [];
};

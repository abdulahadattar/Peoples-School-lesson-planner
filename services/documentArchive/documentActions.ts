import fs from 'fs';
import path from 'path';
import { Archiver, ZipArchive } from 'archiver';
import {
  StudentDocumentRecord,
  StudentDossier,
  BatchProcessingJob,
  DocumentClassificationType,
} from '../../types/documentArchive';
import { DATA_DIR } from './constants.js';
import {
  dossiersStore,
  documentsStore,
  jobsStore,
  saveStores,
  saveAppliedCorrection,
  getCachedSheetRecords,
} from './store.js';
import {
  computeMissingTypes,
  updateStudentDossier,
  auditDossierAgainstSheet,
  dismissDiscrepancy,
} from './discrepancies.js';
import { optimizeAndPrepareImage } from './imageProcessing.js';
import { autoLinkDocumentsAgainstSheet } from './studentMatching.js';
import { processSingleDocument } from './jobProcessor.js';

export function getAllDossiers(): StudentDossier[] {
  return Object.values(dossiersStore);
}

export function getDossierByGr(grNo: string): StudentDossier | null {
  return dossiersStore[grNo] || null;
}

export function getJobStatus(jobId: string): BatchProcessingJob | null {
  return jobsStore[jobId] || null;
}

export function getLatestJob(): BatchProcessingJob | null {
  const jobs = Object.values(jobsStore).sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
  );
  return jobs[0] || null;
}

export function getAllDocuments(): StudentDocumentRecord[] {
  const unassigned = Object.values(documentsStore).filter((d) => d.grNo === 'UNASSIGNED');
  if (unassigned.length > 0 && getCachedSheetRecords().length > 0) {
    try {
      autoLinkDocumentsAgainstSheet(getCachedSheetRecords());
    } catch {}
  }
  return Object.values(documentsStore);
}

export async function updateDocumentMetadata(
  docId: string,
  newTag?: DocumentClassificationType,
  rotateAngle?: 90 | 180 | 270
): Promise<StudentDocumentRecord | null> {
  const doc = documentsStore[docId];
  if (!doc) return null;
  if (newTag) doc.classification = newTag;
  if (rotateAngle) {
    const filePath = path.join(DATA_DIR, `GR_${doc.grNo}`, doc.filename);
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath);
      const reoptimized = await optimizeAndPrepareImage(raw, doc.classification === 'STUDENT_PHOTO', rotateAngle);
      fs.writeFileSync(filePath, reoptimized.buffer);
      doc.rotationApplied = ((doc.rotationApplied + rotateAngle) % 360) as any;
      doc.width = reoptimized.width;
      doc.height = reoptimized.height;
    }
  }
  doc.status = 'verified';
  updateStudentDossier(doc.grNo, doc);
  saveStores();
  return doc;
}

export function createArchiveZipStream(targetClass?: string): Archiver {
  const archive = new ZipArchive({ zlib: { level: 8 } });
  let csvContent = 'GR_NO,STUDENT_NAME,FATHER_NAME,CLASS,B_FORM,PARENT_CNIC,PHOTO,B_FORM_DOC,CNIC_DOC,STATUS,FLAGS\n';

  for (const dossier of Object.values(dossiersStore)) {
    if (targetClass && targetClass !== 'ALL' && dossier.currentClass !== targetClass) continue;
    const safeClassName = (dossier.currentClass || 'General').replace(/[^a-zA-Z0-9_-]/g, '_');
    const safeStudentName = (dossier.studentName || 'Student').replace(/[^a-zA-Z0-9_-]/g, '_');
    const folderName = `${safeClassName}/GR_${dossier.grNo}_${safeStudentName}`;

    for (const doc of dossier.documents) {
      const filePath = path.join(DATA_DIR, `GR_${dossier.grNo}`, doc.filename);
      if (fs.existsSync(filePath)) {
        archive.file(filePath, { name: `${folderName}/${doc.filename}` });
      }
    }
    const hasPhoto = dossier.documents.some((d) => d.classification === 'STUDENT_PHOTO') ? 'YES' : 'NO';
    const hasBForm = dossier.documents.some((d) => d.classification === 'B_FORM') ? 'YES' : 'NO';
    const hasCnic = dossier.documents.some((d) => d.classification.includes('CNIC')) ? 'YES' : 'NO';
    const flagMessages = dossier.allFlags.map((f) => f.message).join('; ');
    csvContent += `"${dossier.grNo}","${dossier.studentName}","${dossier.fatherName}","${dossier.currentClass}","${dossier.bFormNo}","${dossier.parentCnic}","${hasPhoto}","${hasBForm}","${hasCnic}","${dossier.allFlags.length > 0 ? 'FLAGGED' : 'CLEAN'}","${flagMessages.replace(/"/g, '""')}"\n`;
  }
  archive.append(csvContent, { name: 'Audit_And_Verification_Report.csv' });
  return archive;
}

export function deleteDocumentRecord(docId: string): boolean {
  const doc = documentsStore[docId];
  if (!doc) return false;
  const grNo = doc.grNo;
  const filePath = path.join(DATA_DIR, `GR_${grNo}`, doc.filename);
  if (fs.existsSync(filePath)) {
    try { fs.unlinkSync(filePath); } catch {}
  }
  delete documentsStore[docId];
  if (dossiersStore[grNo]) {
    dossiersStore[grNo].documents = dossiersStore[grNo].documents.filter((d) => d.id !== docId);
    if (dossiersStore[grNo].documents.length === 0 && grNo !== 'UNASSIGNED') {
      delete dossiersStore[grNo];
    } else if (dossiersStore[grNo]) {
      dossiersStore[grNo].missingTypes = computeMissingTypes(dossiersStore[grNo]);
      dossiersStore[grNo].hasMissingDocuments = dossiersStore[grNo].missingTypes.length > 0;
    }
  }
  saveStores();
  return true;
}

export function deleteMultipleDocumentRecords(docIds: string[]): { deletedCount: number } {
  let deletedCount = 0;
  for (const docId of docIds) {
    if (deleteDocumentRecord(docId)) deletedCount++;
  }
  return { deletedCount };
}

export async function rescanDocumentRecord(docId: string, serverKeys: string[]): Promise<StudentDocumentRecord | null> {
  const doc = documentsStore[docId];
  if (!doc) return null;
  const filePath = path.join(DATA_DIR, `GR_${doc.grNo}`, doc.filename);
  if (!fs.existsSync(filePath)) return null;
  const fileBuffer = fs.readFileSync(filePath);
  const queueItem = {
    id: `rescan-${Date.now()}`, jobId: doc.jobId || 'rescan', grNo: doc.grNo,
    originalFilename: doc.originalFilename || doc.filename, sourceBuffer: fileBuffer, mimeType: 'image/jpeg',
  };
  return processSingleDocument(queueItem, serverKeys);
}

export async function rescanAllDocumentsRecord(serverKeys: string[]): Promise<{ total: number; rescanned: number; errors: number; dossiers: StudentDossier[]; documents: StudentDocumentRecord[] }> {
  const docIds = Object.keys(documentsStore);
  let rescanned = 0;
  let errors = 0;
  for (const id of docIds) {
    const res = await rescanDocumentRecord(id, serverKeys);
    if (res) rescanned++; else errors++;
  }
  return { total: docIds.length, rescanned, errors, dossiers: getAllDossiers(), documents: getAllDocuments() };
}

export async function replaceDocumentRecord(docId: string, newBuffer: Buffer, newOriginalFilename: string, serverKeys: string[]): Promise<StudentDocumentRecord | null> {
  const oldDoc = documentsStore[docId];
  if (!oldDoc) return null;
  const grNo = oldDoc.grNo;
  deleteDocumentRecord(docId);
  const item = {
    id: `rep-${Date.now()}`, jobId: `replace_${Date.now()}`, grNo,
    originalFilename: newOriginalFilename, sourceBuffer: newBuffer, mimeType: 'image/jpeg',
  };
  return processSingleDocument(item, serverKeys);
}

export function selectTargetChildForDocument(docId: string, entryNoOrIndex: number): StudentDocumentRecord | null {
  const doc = documentsStore[docId];
  if (!doc || !doc.extractedData?.children) return null;
  const target = doc.extractedData.children.find((c, idx) => c.entryNo === entryNoOrIndex || idx === entryNoOrIndex);
  if (!target) return null;
  for (const c of doc.extractedData.children) c.isTargetStudent = (c === target);
  if (target.childNameEnglish) doc.extractedData.studentName = target.childNameEnglish;
  if (target.bFormNo) doc.extractedData.bFormNo = target.bFormNo;
  if (target.dob) doc.extractedData.dob = target.dob;
  if (doc.grNo && doc.grNo !== 'UNASSIGNED') updateStudentDossier(doc.grNo, doc);
  saveStores();
  return doc;
}

export async function reprocessDocumentWithAi(docId: string, serverKeys: string[]): Promise<StudentDocumentRecord | null> {
  return rescanDocumentRecord(docId, serverKeys);
}

export async function reprocessDossierDocumentsWithAi(grNo: string, serverKeys: string[]): Promise<StudentDossier | null> {
  const dossier = dossiersStore[grNo];
  if (!dossier) return null;
  for (const doc of [...dossier.documents]) {
    await rescanDocumentRecord(doc.id, serverKeys);
  }
  return dossiersStore[grNo] || null;
}

export async function applyDiscrepancyCorrection(
  grNo: string,
  flagId: string,
  correction: { field: string; newValue: string; reason?: string },
  accessToken?: string
): Promise<{ success: boolean; message: string; updatedRecord?: any; dossier?: StudentDossier }> {
  const normGr = String(grNo).trim();
  const cachedRecord = getCachedSheetRecords().find((r) => String(r.grNo || r['G.R.NO'] || '').trim() === normGr);
  if (cachedRecord) (cachedRecord as any)[correction.field] = correction.newValue;
  const dossier = dossiersStore[normGr];
  if (dossier) (dossier as any)[correction.field] = correction.newValue;
  saveAppliedCorrection(normGr, correction.field, correction.newValue);
  if (flagId) dismissDiscrepancy(flagId);
  if (dossier) auditDossierAgainstSheet(normGr, cachedRecord);
  saveStores();
  return { success: true, message: `Correction applied (${correction.field} → "${correction.newValue}")`, updatedRecord: cachedRecord, dossier };
}

export async function batchApplyDiscrepancyCorrections(
  corrections: Array<{ grNo: string; flagId: string; field: string; newValue: string; reason?: string }>,
  accessToken?: string
): Promise<{ success: boolean; appliedCount: number; errors: string[] }> {
  let appliedCount = 0;
  const errors: string[] = [];
  for (const c of corrections) {
    try {
      const res = await applyDiscrepancyCorrection(c.grNo, c.flagId, c, accessToken);
      if (res.success) appliedCount++;
    } catch (err: any) {
      errors.push(`Error on GR #${c.grNo}: ${err.message}`);
    }
  }
  return { success: appliedCount > 0, appliedCount, errors };
}

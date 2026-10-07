import fs from 'fs';
import path from 'path';
import {
  ExtractedStudentInfo,
  StudentDocumentRecord,
  StudentDossier,
  DocumentDiscrepancy,
  CandidateStudentMatch,
} from '../../types/documentArchive';
import {
  dossiersStore,
  documentsStore,
  saveStores,
  setCachedSheetRecords,
} from './store.js';
import { DATA_DIR } from './constants.js';
import {
  calculateNameSimilarity,
  compareNadraNumberWithOcrTolerance,
  compareDobWithTolerance,
  isInvalidPersonName,
} from './nameMatching.js';
import { updateStudentDossier, auditDossierAgainstSheet, auditAllDossiersAgainstSheet } from './discrepancies.js';

export function scoreStudentAgainstExtracted(ext: ExtractedStudentInfo, r: any): { points: number; evidence: string[] } {
  const sheetGr = String(r.grNo || r['G.R.NO'] || '').trim();
  const sheetStudentName = r.studentName || r['STUDENTNAME'] || '';
  const sheetFatherName = r.fatherName || r['FATHERNAME'] || '';
  const sheetBForm = r.bFormNo || r['B.FORMNO'] || '';
  const sheetCnic = r.parentCnic || r['PARENT/GUARDIANCNICNO'] || '';
  const sheetDob = (r.dobDay && r.dobMonth && r.dobYear)
    ? `${r.dobDay}/${r.dobMonth}/${r.dobYear}`
    : (r.dob || r['DATEOFBIRTH'] || '');
  const sheetClass = r.currentClass || r['CURRENTCLASS'] || '';

  const extStudentName = (!isInvalidPersonName(ext.studentName) ? ext.studentName : '') || '';
  const extFatherName = (!isInvalidPersonName(ext.fatherName) ? ext.fatherName : '') || '';
  const extBForm = ext.bFormNo || '';
  const extCnic = ext.fatherCnic || '';
  const extDob = ext.dob || '';
  const extGr = (ext.grNo || '').trim();

  let points = 0;
  const evidence: string[] = [];

  if (extGr && extGr !== 'UNASSIGNED' && extGr === sheetGr) {
    points += 45;
    evidence.push(`Direct GR #${sheetGr} Match`);
  }
  if (extBForm && sheetBForm) {
    const bComp = compareNadraNumberWithOcrTolerance(extBForm, sheetBForm);
    if (bComp.score > 0) {
      points += Math.round(bComp.score * 45);
      evidence.push(`B-Form ${Math.round(bComp.score * 100)}%`);
    }
  }
  if (extCnic && sheetCnic) {
    const cComp = compareNadraNumberWithOcrTolerance(extCnic, sheetCnic);
    if (cComp.score > 0) {
      points += Math.round(cComp.score * 35);
      evidence.push(`Parent CNIC ${Math.round(cComp.score * 100)}%`);
    }
  }
  if (extStudentName && sheetStudentName) {
    const nameComp = calculateNameSimilarity(extStudentName, sheetStudentName);
    if (nameComp.similarity >= 0.35) {
      points += Math.round(nameComp.similarity * 35);
      evidence.push(`Name ${Math.round(nameComp.similarity * 100)}%`);
    }
  }
  if (extFatherName && sheetFatherName) {
    const fComp = calculateNameSimilarity(extFatherName, sheetFatherName);
    if (fComp.similarity >= 0.35) {
      points += Math.round(fComp.similarity * 25);
      evidence.push(`Father ${Math.round(fComp.similarity * 100)}%`);
    }
  }
  if (extDob && sheetDob) {
    const dobComp = compareDobWithTolerance(extDob, sheetDob);
    if (dobComp.matched && dobComp.score > 0) {
      points += Math.round(dobComp.score * 20);
      evidence.push(`DOB ${Math.round(dobComp.score * 100)}%`);
    }
  }
  if (ext.classAdmitted && sheetClass) {
    const c1 = ext.classAdmitted.toLowerCase().replace(/[^a-z0-9]/g, '');
    const c2 = sheetClass.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (c1 === c2 || c1.includes(c2) || c2.includes(c1)) {
      points += 10;
      evidence.push(`Class Match (${sheetClass})`);
    }
  }

  return { points, evidence };
}

export function matchAggregatedProfileToStudentRecords(
  ext: ExtractedStudentInfo,
  records: any[]
): {
  student: any;
  matchScore: number;
  matchReason: string;
  evidence: string[];
} | null {
  if (!records || records.length === 0 || !ext) return null;

  let bestCandidate: any = null;
  let highestScore = 0;
  let bestEvidence: string[] = [];

  for (const r of records) {
    const { points, evidence } = scoreStudentAgainstExtracted(ext, r);
    if (points > highestScore) {
      highestScore = points;
      bestCandidate = r;
      bestEvidence = evidence;
    }
  }

  if (bestCandidate && highestScore >= 40) {
    return {
      student: bestCandidate,
      matchScore: Math.min(1.0, Number((highestScore / 100).toFixed(2))),
      matchReason: `Matched GR #${bestCandidate.grNo || bestCandidate['G.R.NO']}: ${bestEvidence.join(' + ')}`,
      evidence: bestEvidence,
    };
  }
  return null;
}

export function getRankedCandidateMatches(
  ext: ExtractedStudentInfo,
  records: any[],
  topN: number = 5
): CandidateStudentMatch[] {
  if (!records || records.length === 0 || !ext) return [];
  const candidates: CandidateStudentMatch[] = [];

  for (const r of records) {
    const { points, evidence } = scoreStudentAgainstExtracted(ext, r);
    if (points > 0) {
      candidates.push({
        grNo: String(r.grNo || r['G.R.NO'] || '').trim(),
        studentName: r.studentName || r['STUDENTNAME'] || '',
        fatherName: r.fatherName || r['FATHERNAME'] || '',
        currentClass: r.currentClass || r['CURRENTCLASS'] || '',
        section: r.section || r['SECTION'] || '',
        bFormNo: r.bFormNo || r['B.FORMNO'] || '',
        parentCnic: r.parentCnic || r['PARENT/GUARDIANCNICNO'] || '',
        score: Math.min(100, points),
        evidence,
        reasons: evidence.join(', '),
      });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, topN);
}

export function matchDocumentToStudentRecords(
  doc: StudentDocumentRecord,
  records: any[]
): { student: any; matchScore: number; matchReason: string } | null {
  return matchAggregatedProfileToStudentRecords(doc.extractedData, records);
}

export function autoLinkDocumentsAgainstSheet(records: any[]): {
  totalMatched: number;
  reassignedDocs: number;
  dossiers: StudentDossier[];
  documents: StudentDocumentRecord[];
  discrepancies: Record<string, DocumentDiscrepancy[]>;
} {
  if (!Array.isArray(records) || records.length === 0) {
    return { totalMatched: 0, reassignedDocs: 0, dossiers: Object.values(dossiersStore), documents: Object.values(documentsStore), discrepancies: {} };
  }
  setCachedSheetRecords(records);
  let totalMatched = 0;
  let reassignedDocs = 0;

  const unassignedDocs = Object.values(documentsStore).filter((d) => d.grNo === 'UNASSIGNED');
  for (const doc of unassignedDocs) {
    const match = matchAggregatedProfileToStudentRecords(doc.extractedData, records);
    if (match && match.student) {
      const targetGr = String(match.student.grNo || match.student['G.R.NO'] || '').trim();
      if (targetGr && targetGr !== 'UNASSIGNED') {
        const targetFolder = path.join(DATA_DIR, `GR_${targetGr}`);
        if (!fs.existsSync(targetFolder)) fs.mkdirSync(targetFolder, { recursive: true });
        const oldPath = path.join(DATA_DIR, 'GR_UNASSIGNED', doc.filename);
        const newPath = path.join(targetFolder, doc.filename);
        if (fs.existsSync(oldPath)) {
          try { fs.renameSync(oldPath, newPath); } catch {}
        }
        doc.grNo = targetGr;
        doc.url = `/api/documents/file/${targetGr}/${encodeURIComponent(doc.filename)}`;
        updateStudentDossier(targetGr, doc);
        reassignedDocs++;
        totalMatched++;
      }
    }
  }

  const discrepancies = auditAllDossiersAgainstSheet(records);
  saveStores();
  return { totalMatched, reassignedDocs, dossiers: Object.values(dossiersStore), documents: Object.values(documentsStore), discrepancies };
}

export function assignDocumentToGr(docId: string, targetGrNo: string, studentRecord?: any): StudentDocumentRecord | null {
  const doc = documentsStore[docId];
  if (!doc) return null;
  const currentGr = doc.grNo;
  const cleanTargetGr = targetGrNo.trim();
  if (currentGr !== cleanTargetGr) {
    const oldFolder = path.join(DATA_DIR, `GR_${currentGr}`);
    const newFolder = path.join(DATA_DIR, `GR_${cleanTargetGr}`);
    if (!fs.existsSync(newFolder)) fs.mkdirSync(newFolder, { recursive: true });
    const oldPath = path.join(oldFolder, doc.filename);
    const newPath = path.join(newFolder, doc.filename);
    if (fs.existsSync(oldPath)) {
      try { fs.renameSync(oldPath, newPath); } catch {}
    }
    if (currentGr !== 'UNASSIGNED' && dossiersStore[currentGr]) {
      dossiersStore[currentGr].documents = dossiersStore[currentGr].documents.filter((d) => d.id !== doc.id);
      if (dossiersStore[currentGr].documents.length === 0) delete dossiersStore[currentGr];
    }
    doc.grNo = cleanTargetGr;
    doc.url = `/api/documents/file/${cleanTargetGr}/${encodeURIComponent(doc.filename)}`;
    updateStudentDossier(cleanTargetGr, doc);
    if (studentRecord && dossiersStore[cleanTargetGr]) {
      const d = dossiersStore[cleanTargetGr];
      d.studentName = studentRecord.studentName || studentRecord['STUDENTNAME'] || d.studentName;
      d.fatherName = studentRecord.fatherName || studentRecord['FATHERNAME'] || d.fatherName;
      d.currentClass = studentRecord.currentClass || studentRecord['CURRENTCLASS'] || d.currentClass;
      d.section = studentRecord.section || studentRecord['SECTION'] || d.section;
    }
    auditDossierAgainstSheet(cleanTargetGr, studentRecord);
    saveStores();
  }
  return doc;
}

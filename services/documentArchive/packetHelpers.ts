/**
 * Pure helper utilities for Student Packet resolution and sibling disambiguation.
 */
import type {
  CandidateStudentMatch,
  DocumentDiscrepancy,
  ExtractedChildRecord,
  ExtractedStudentInfo,
  StudentDocumentRecord,
} from '../../types/documentArchive';
import {
  calculateNameSimilarity,
  compareDobWithTolerance,
  compareNadraNumberWithOcrTolerance,
  isInvalidPersonName,
} from './nameMatching.js';
import { scoreStudentAgainstExtracted } from './studentMatching.js';

export function lookupRecordByGr(records: any[], grNo?: string): any | undefined {
  const clean = String(grNo ?? '').trim();
  if (!clean || clean === 'UNASSIGNED') return undefined;
  const exact = records.find((r) => String(r.grNo || r.g || r['G.R.NO'] || '').trim() === clean);
  if (exact) return exact;
  if (/^\d+$/.test(clean)) {
    const numClean = String(parseInt(clean, 10));
    return records.find((r) => {
      const rGr = String(r.grNo || r.g || r['G.R.NO'] || '').trim();
      return /^\d+$/.test(rGr) && String(parseInt(rGr, 10)) === numClean;
    });
  }
  return undefined;
}

function getFieldStr(r: any, keys: string[]): string {
  for (const k of keys) {
    if (r?.[k] !== undefined && r?.[k] !== null && String(r[k]).trim() !== '') {
      return String(r[k]).trim();
    }
  }
  return '';
}

export function getSheetStudentFields(r: any) {
  const dob =
    r?.dobDay && r?.dobMonth && r?.dobYear
      ? `${r.dobDay}/${r.dobMonth}/${r.dobYear}`
      : getFieldStr(r, ['dob', 'DATEOFBIRTH', 'd']);
  return {
    grNo: getFieldStr(r, ['grNo', 'g', 'G.R.NO', 'GRNO']),
    studentName: getFieldStr(r, ['studentName', 'n', 'STUDENTNAME', 'STUDENT NAME']),
    fatherName: getFieldStr(r, ['fatherName', 'f', 'FATHERNAME', 'FATHER NAME']),
    bFormNo: getFieldStr(r, ['bFormNo', 'b', 'B.FORMNO', 'B.FORM NO.']),
    parentCnic: getFieldStr(r, ['parentCnic', 'p', 'PARENT/GUARDIANCNICNO']),
    dob,
    currentClass: getFieldStr(r, ['currentClass', 'c', 'CURRENTCLASS']),
    section: getFieldStr(r, ['section', 'sec', 'SECTION']),
  };
}

export function matchFatherIdentity(
  extFatherName: string | undefined,
  extFatherCnic: string | undefined,
  sheetRec: any
): { matched: boolean; strongMismatch: boolean; reason: string } {
  const sf = getSheetStudentFields(sheetRec);
  const cnicComp = extFatherCnic && sf.parentCnic
    ? compareNadraNumberWithOcrTolerance(extFatherCnic, sf.parentCnic)
    : null;
  const nameComp =
    extFatherName && !isInvalidPersonName(extFatherName) && sf.fatherName
      ? calculateNameSimilarity(extFatherName, sf.fatherName)
      : null;

  if (cnicComp && cnicComp.score >= 0.85) {
    return { matched: true, strongMismatch: false, reason: `Father CNIC ${cnicComp.reason}` };
  }
  if (nameComp && nameComp.similarity >= 0.72) {
    if (cnicComp && cnicComp.score === 0) {
      return { matched: false, strongMismatch: false, reason: 'Father name matches but CNIC digits differ' };
    }
    return { matched: true, strongMismatch: false, reason: `Father name ${Math.round(nameComp.similarity * 100)}%` };
  }
  if ((cnicComp && cnicComp.score === 0) || (nameComp && nameComp.similarity < 0.38)) {
    return { matched: false, strongMismatch: true, reason: 'Father identity does not match primary student' };
  }
  return { matched: false, strongMismatch: false, reason: 'Insufficient father fields' };
}

export function matchChildRowToRecords(
  child: ExtractedChildRecord,
  packetFatherName: string | undefined,
  packetFatherCnic: string | undefined,
  records: any[]
): { record: any; score: number; evidence: string[] } | null {
  const probe: ExtractedStudentInfo = {
    studentName: child.childNameEnglish,
    fatherName: child.fatherNameEnglish || packetFatherName,
    bFormNo: child.bFormNo,
    fatherCnic: child.fatherCnic || packetFatherCnic,
    dob: child.dob,
  };
  let best: { record: any; score: number; evidence: string[] } | null = null;
  for (const r of records) {
    const sf = getSheetStudentFields(r);
    const { points, evidence } = scoreStudentAgainstExtracted(probe, r);
    const bFormScore =
      probe.bFormNo && sf.bFormNo
        ? compareNadraNumberWithOcrTolerance(probe.bFormNo, sf.bFormNo).score
        : 0;
    const childNameSim =
      probe.studentName && sf.studentName
        ? calculateNameSimilarity(probe.studentName, sf.studentName).similarity
        : 0;
    const dobScore =
      probe.dob && sf.dob ? compareDobWithTolerance(probe.dob, sf.dob).score : 0;

    const childConfirmed =
      bFormScore >= 0.85 ||
      (childNameSim >= 0.65 && (points >= 45 || dobScore >= 0.75)) ||
      (childNameSim >= 0.55 && (probe.fatherName || probe.fatherCnic) && points >= 50);

    if (childConfirmed && (!best || points > best.score)) {
      best = { record: r, score: points, evidence };
    }
  }
  return best;
}

export function buildMisfiledDiscrepancy(
  doc: StudentDocumentRecord,
  folderGr: string,
  primaryStudent: any | undefined,
  candidates: CandidateStudentMatch[],
  summaryMessage: string
): DocumentDiscrepancy {
  const pf = primaryStudent ? getSheetStudentFields(primaryStudent) : undefined;
  const top = candidates[0];
  return {
    id: `flag_misfiled_${doc.id}`,
    grNo: folderGr,
    studentName: pf?.studentName || `Folder GR #${folderGr}`,
    fatherName: pf?.fatherName || '',
    currentClass: pf?.currentClass || '',
    field: 'misfiled',
    fieldName: 'Possible Misfiled Document',
    sheetValue: pf ? `GR #${pf.grNo} · ${pf.studentName} (${pf.fatherName})` : `Folder GR #${folderGr}`,
    extractedValue: top
      ? `Matches GR #${top.grNo} · ${top.studentName} (${top.currentClass || 'Student'})`
      : doc.extractedData?.studentName || doc.extractedData?.cardholderName || doc.extractedData?.fatherName || 'Unknown',
    severity: 'high',
    message: summaryMessage,
    suggestedAction: 'move_to_sibling_or_match',
    documentId: doc.id,
    documentUrl: doc.url,
    documentFilename: doc.originalFilename || doc.filename,
    documentClassification: doc.classification,
    rankedMatches: candidates,
  };
}

export function setOrClearMisfiledDiscrepancy(
  doc: StudentDocumentRecord,
  flag: DocumentDiscrepancy | null
): void {
  const rest = (doc.discrepancies || []).filter((d) => d.field !== 'misfiled');
  if (flag) {
    doc.discrepancies = [...rest, flag];
    doc.misfiledWarning = flag.message;
    doc.status = 'flagged';
  } else {
    doc.discrepancies = rest;
    delete doc.misfiledWarning;
    if (doc.status === 'flagged' && rest.length === 0) {
      doc.status = 'verified';
    }
  }
}

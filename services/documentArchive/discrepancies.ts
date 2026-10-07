import {
  StudentDocumentRecord,
  StudentDossier,
  DocumentDiscrepancy,
  DocumentClassificationType,
} from '../../types/documentArchive';
import {
  dossiersStore,
  dismissedFlagsStore,
  saveStores,
  getCachedSheetRecords,
} from './store.js';
import {
  normalizeNadraNumber,
  calculateNameSimilarity,
  compareNadraNumberWithOcrTolerance,
  compareDobWithTolerance,
  analyzeNameCasteOrFullNameVariance,
} from './nameMatching.js';
import { getRankedCandidateMatches } from './studentMatching.js';

export function computeMissingTypes(dossier: StudentDossier): DocumentClassificationType[] {
  const present = new Set(dossier.documents.map((d) => d.classification));
  const hasPhoto = present.has('STUDENT_PHOTO');
  const hasChildIdentity =
    present.has('B_FORM') ||
    present.has('BIRTH_CERTIFICATE') ||
    Boolean(dossier.bFormNo && dossier.bFormNo.trim().length > 3);
  const hasFatherCnic =
    present.has('FATHER_CNIC_FRONT') ||
    present.has('FATHER_CNIC_BACK') ||
    Boolean(dossier.parentCnic && dossier.parentCnic.trim().length > 3);

  const missing: DocumentClassificationType[] = [];
  if (!hasPhoto) missing.push('STUDENT_PHOTO');
  if (!hasChildIdentity) missing.push('B_FORM');
  if (!hasFatherCnic) missing.push('FATHER_CNIC_FRONT');
  return missing;
}

export function updateStudentDossier(grNo: string, doc: StudentDocumentRecord) {
  if (!grNo || grNo === 'UNASSIGNED') return;

  let dossier = dossiersStore[grNo];
  if (!dossier) {
    dossier = {
      grNo,
      studentName: '',
      fatherName: '',
      currentClass: '',
      section: '',
      bFormNo: '',
      parentCnic: '',
      dob: '',
      avatarUrl: undefined,
      documents: [],
      allFlags: [],
      hasMissingDocuments: true,
      missingTypes: ['STUDENT_PHOTO', 'B_FORM', 'FATHER_CNIC_FRONT'],
      lastUpdated: new Date().toISOString(),
    };
    dossiersStore[grNo] = dossier;
  }

  dossier.documents = dossier.documents.filter((d) => d.id !== doc.id && d.filename !== doc.filename);
  dossier.documents.push(doc);

  const ext = doc.extractedData;
  if (doc.classification === 'STUDENT_PHOTO') {
    dossier.avatarUrl = doc.url;
  }
  if (ext) {
    if (ext.studentName && (!dossier.studentName || doc.classification === 'B_FORM')) dossier.studentName = ext.studentName;
    if (ext.fatherName && (!dossier.fatherName || doc.classification === 'B_FORM' || doc.classification === 'FATHER_CNIC_FRONT')) {
      dossier.fatherName = ext.fatherName;
    }
    if (ext.bFormNo && !dossier.bFormNo) dossier.bFormNo = ext.bFormNo;
    if (ext.fatherCnic && !dossier.parentCnic) dossier.parentCnic = ext.fatherCnic;
    if (ext.dob && !dossier.dob) dossier.dob = ext.dob;
    if (ext.paternalGrandfatherName && !dossier.paternalGrandfatherName) dossier.paternalGrandfatherName = ext.paternalGrandfatherName;
  }

  dossier.missingTypes = computeMissingTypes(dossier);
  dossier.hasMissingDocuments = dossier.missingTypes.length > 0;
  dossier.lastUpdated = new Date().toISOString();
  saveStores();
}

export function auditDossierAgainstSheet(grNo: string, sheetRecord?: any): DocumentDiscrepancy[] {
  const dossier = dossiersStore[grNo];
  if (!dossier) return [];

  dossier.missingTypes = computeMissingTypes(dossier);
  dossier.hasMissingDocuments = dossier.missingTypes.length > 0;

  const discrepancies: DocumentDiscrepancy[] = [];
  const studentName = dossier.studentName || (sheetRecord && (sheetRecord.studentName || sheetRecord['STUDENTNAME'])) || 'Student';
  const fatherName = dossier.fatherName || (sheetRecord && (sheetRecord.fatherName || sheetRecord['FATHERNAME'])) || '';
  const currentClass = dossier.currentClass || (sheetRecord && (sheetRecord.currentClass || sheetRecord['CURRENTCLASS'])) || '';

  const bFormDoc = dossier.documents.find((d) => d.classification === 'B_FORM');
  const cnicFrontDoc = dossier.documents.find((d) => d.classification === 'FATHER_CNIC_FRONT');
  const cnicBackDoc = dossier.documents.find((d) => d.classification === 'FATHER_CNIC_BACK');
  const cnicDoc = cnicFrontDoc || cnicBackDoc;
  const photoDoc = dossier.documents.find((d) => d.classification === 'STUDENT_PHOTO');
  const primaryDoc = bFormDoc || cnicFrontDoc || photoDoc || cnicBackDoc || dossier.documents[0];

  if (sheetRecord) {
    const sheetBForm = normalizeNadraNumber(sheetRecord.bFormNo || sheetRecord['B.FORMNO']);
    const sheetCnic = normalizeNadraNumber(sheetRecord.parentCnic || sheetRecord['PARENT/GUARDIANCNICNO']);
    const sheetStudentName = (sheetRecord.studentName || sheetRecord['STUDENTNAME'] || '').trim();
    const sheetFatherName = (sheetRecord.fatherName || sheetRecord['FATHERNAME'] || '').trim();
    const sheetDob = (sheetRecord.dobDay && sheetRecord.dobMonth && sheetRecord.dobYear)
      ? `${sheetRecord.dobDay}/${sheetRecord.dobMonth}/${sheetRecord.dobYear}`
      : (sheetRecord.dob || sheetRecord['DATEOFBIRTH'] || '');

    if (dossier.bFormNo && sheetBForm && dossier.bFormNo !== sheetBForm) {
      const bComp = compareNadraNumberWithOcrTolerance(dossier.bFormNo, sheetBForm);
      if (!bComp.exact && !bComp.incompleteOcr) {
        const id = `flag_bform_${grNo}`;
        discrepancies.push({
          id, grNo, studentName, fatherName, currentClass, field: 'bFormNo', fieldName: 'NADRA B-Form / CRC Number',
          sheetValue: sheetBForm, extractedValue: dossier.bFormNo, severity: bComp.score >= 0.85 ? 'low' : 'high',
          message: `B-Form Mismatch: Document has ${dossier.bFormNo} but Sheet has ${sheetBForm} (${bComp.reason})`,
          suggestedAction: 'reformat_bform',
          suggestedCorrection: { field: 'bFormNo', newValue: dossier.bFormNo, reason: `Synchronize verified B-Form (${dossier.bFormNo})`, previousValue: sheetBForm },
          documentId: bFormDoc?.id || primaryDoc?.id, documentUrl: bFormDoc?.url || primaryDoc?.url,
          documentFilename: bFormDoc?.originalFilename || primaryDoc?.originalFilename,
          documentClassification: bFormDoc?.classification || primaryDoc?.classification,
          isDismissed: Boolean(dismissedFlagsStore[id]),
        });
      }
    }

    if (dossier.parentCnic && sheetCnic && dossier.parentCnic !== sheetCnic) {
      const cComp = compareNadraNumberWithOcrTolerance(dossier.parentCnic, sheetCnic);
      if (!cComp.exact && !cComp.incompleteOcr) {
        const id = `flag_cnic_${grNo}`;
        discrepancies.push({
          id, grNo, studentName, fatherName, currentClass, field: 'parentCnic', fieldName: 'Father / Guardian CNIC',
          sheetValue: sheetCnic, extractedValue: dossier.parentCnic, severity: cComp.score >= 0.85 ? 'low' : 'high',
          message: `CNIC Mismatch: Document has ${dossier.parentCnic} but Sheet has ${sheetCnic} (${cComp.reason})`,
          suggestedAction: 'reformat_bform',
          suggestedCorrection: { field: 'parentCnic', newValue: dossier.parentCnic, reason: `Synchronize verified CNIC (${dossier.parentCnic})`, previousValue: sheetCnic },
          documentId: cnicDoc?.id || primaryDoc?.id, documentUrl: cnicDoc?.url || primaryDoc?.url,
          documentFilename: cnicDoc?.originalFilename || primaryDoc?.originalFilename,
          documentClassification: cnicDoc?.classification || primaryDoc?.classification,
          isDismissed: Boolean(dismissedFlagsStore[id]),
        });
      }
    }

    if (dossier.studentName && sheetStudentName) {
      const vStudent = analyzeNameCasteOrFullNameVariance(dossier.studentName, sheetStudentName);
      if (vStudent.isMatch && vStudent.hasEnrichment && vStudent.recommendedFullName) {
        const id = `flag_student_fullname_${grNo}`;
        discrepancies.push({
          id, grNo, studentName, fatherName, currentClass, field: 'studentName', fieldName: 'Student Full Name',
          sheetValue: sheetStudentName, extractedValue: vStudent.recommendedFullName, severity: 'medium',
          suggestedAction: 'enrich_full_name',
          suggestedCorrection: { field: 'studentName', newValue: vStudent.recommendedFullName, reason: `Complete full name with caste '${vStudent.detectedCaste}'`, previousValue: sheetStudentName },
          message: `Full Name Verification: Official document confirms full name '${vStudent.recommendedFullName}'. Sheet has '${sheetStudentName}'.`,
          documentId: bFormDoc?.id || primaryDoc?.id, documentUrl: bFormDoc?.url || primaryDoc?.url,
          documentFilename: bFormDoc?.originalFilename || primaryDoc?.originalFilename,
          documentClassification: bFormDoc?.classification || primaryDoc?.classification,
          isDismissed: Boolean(dismissedFlagsStore[id]),
        });
      }
    }

    if (dossier.dob && sheetDob) {
      const dobComp = compareDobWithTolerance(dossier.dob, sheetDob);
      if (!dobComp.matched || dobComp.score < 0.95) {
        const id = `flag_dob_${grNo}`;
        discrepancies.push({
          id, grNo, studentName, fatherName, currentClass, field: 'dob', fieldName: 'Date of Birth (DOB)',
          sheetValue: sheetDob, extractedValue: dossier.dob, severity: 'medium',
          message: `DOB Comparison: Document has "${dossier.dob}" while Sheet has "${sheetDob}" (${dobComp.matchType})`,
          suggestedCorrection: { field: 'dob', newValue: dossier.dob, reason: `Synchronize DOB from official civil document (${dossier.dob})`, previousValue: sheetDob },
          documentId: bFormDoc?.id || primaryDoc?.id, documentUrl: bFormDoc?.url || primaryDoc?.url,
          documentFilename: bFormDoc?.originalFilename || primaryDoc?.originalFilename,
          documentClassification: bFormDoc?.classification || primaryDoc?.classification,
          isDismissed: Boolean(dismissedFlagsStore[id]),
        });
      }
    }
  }

  const cachedRecords = getCachedSheetRecords();
  if (cachedRecords.length > 0) {
    const candidates = getRankedCandidateMatches(
      { grNo, studentName: dossier.studentName, fatherName: dossier.fatherName, bFormNo: dossier.bFormNo, fatherCnic: dossier.parentCnic, dob: dossier.dob },
      cachedRecords,
      5
    );
    for (const flag of discrepancies) {
      flag.rankedMatches = candidates;
    }
  }

  dossier.allFlags = discrepancies;
  saveStores();
  return discrepancies;
}

export function auditAllDossiersAgainstSheet(records: any[]): Record<string, DocumentDiscrepancy[]> {
  const result: Record<string, DocumentDiscrepancy[]> = {};
  if (!Array.isArray(records) || records.length === 0) return result;
  const recordMap = new Map<string, any>();
  for (const r of records) {
    if (r.grNo) recordMap.set(String(r.grNo).trim(), r);
  }
  for (const [grNo] of Object.entries(dossiersStore)) {
    const sheetRecord = recordMap.get(String(grNo).trim());
    result[grNo] = auditDossierAgainstSheet(grNo, sheetRecord);
  }
  saveStores();
  return result;
}

export function dismissDiscrepancy(flagId: string): boolean {
  if (!flagId) return false;
  dismissedFlagsStore[flagId] = true;
  saveStores();
  for (const dossier of Object.values(dossiersStore)) {
    const flag = dossier.allFlags.find((f) => f.id === flagId);
    if (flag) flag.isDismissed = true;
  }
  return true;
}

export function undismissDiscrepancy(flagId: string): boolean {
  if (!flagId) return false;
  delete dismissedFlagsStore[flagId];
  saveStores();
  for (const dossier of Object.values(dossiersStore)) {
    const flag = dossier.allFlags.find((f) => f.id === flagId);
    if (flag) flag.isDismissed = false;
  }
  return true;
}

export function getDismissedFlags(): Record<string, boolean> {
  return { ...dismissedFlagsStore };
}

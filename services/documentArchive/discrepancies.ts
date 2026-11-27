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

export function resolveChildFieldsForDossier(
  doc: StudentDocumentRecord,
  dossierStudentName?: string,
  dossierBFormNo?: string
): { studentName?: string; bFormNo?: string; dob?: string; fatherName?: string; fatherCnic?: string } {
  const ext = doc.extractedData || {};
  const children = ext.children;
  if (!Array.isArray(children) || children.length === 0) {
    return {
      studentName: ext.studentName,
      bFormNo: ext.bFormNo,
      dob: ext.dob,
      fatherName: ext.fatherName || ext.applicantName || ext.cardholderName,
      fatherCnic: ext.fatherCnic || ext.applicantCnic,
    };
  }

  let matchedChild = undefined;
  let bestScore = 0;

  for (const ch of children) {
    let score = 0;
    if (dossierBFormNo && ch.bFormNo) {
      const bc = compareNadraNumberWithOcrTolerance(ch.bFormNo, dossierBFormNo);
      if (bc.score >= 0.85) score += 60;
    }
    if (dossierStudentName && ch.childNameEnglish) {
      const nc = calculateNameSimilarity(ch.childNameEnglish, dossierStudentName);
      if (nc.similarity >= 0.65) score += Math.round(nc.similarity * 50);
    }
    if (score > bestScore) {
      bestScore = score;
      matchedChild = ch;
    }
  }

  if (!matchedChild && (!doc.linkedGrNos || doc.linkedGrNos.length <= 1)) {
    matchedChild = children.find((c) => c.isTargetStudent) || (children.length === 1 ? children[0] : undefined);
  }

  return {
    studentName: matchedChild?.childNameEnglish || (children.length === 1 ? ext.studentName : undefined),
    bFormNo: matchedChild?.bFormNo || (children.length === 1 ? ext.bFormNo : undefined),
    dob: matchedChild?.dob || (children.length === 1 ? ext.dob : undefined),
    fatherName: matchedChild?.fatherNameEnglish || ext.fatherName || ext.applicantName || ext.cardholderName,
    fatherCnic: matchedChild?.fatherCnic || ext.fatherCnic || ext.applicantCnic,
  };
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
  if (doc.classification === 'STUDENT_PHOTO' && doc.grNo === grNo) {
    dossier.avatarUrl = doc.url;
  }
  if (ext) {
    const resolved = doc.classification === 'B_FORM'
      ? resolveChildFieldsForDossier(doc, dossier.studentName, dossier.bFormNo)
      : {
          studentName: ext.studentName,
          bFormNo: ext.bFormNo,
          dob: ext.dob,
          fatherName: ext.fatherName || ext.cardholderName || ext.applicantName,
          fatherCnic: ext.fatherCnic || ext.applicantCnic,
        };
    if (resolved.studentName && (!dossier.studentName || (doc.classification === 'B_FORM' && !dossier.studentName))) {
      dossier.studentName = resolved.studentName;
    }
    if (resolved.fatherName && (!dossier.fatherName || doc.classification === 'B_FORM' || doc.classification === 'FATHER_CNIC_FRONT')) {
      dossier.fatherName = resolved.fatherName;
    }
    if (resolved.bFormNo && !dossier.bFormNo) dossier.bFormNo = resolved.bFormNo;
    if (resolved.fatherCnic && !dossier.parentCnic) dossier.parentCnic = resolved.fatherCnic;
    if (resolved.dob && !dossier.dob) dossier.dob = resolved.dob;
    if (ext.paternalGrandfatherName && !dossier.paternalGrandfatherName) dossier.paternalGrandfatherName = ext.paternalGrandfatherName;
  }

  dossier.missingTypes = computeMissingTypes(dossier);
  dossier.hasMissingDocuments = dossier.missingTypes.length > 0;
  dossier.lastUpdated = new Date().toISOString();
  saveStores();
}

export function syncDocumentToLinkedDossiers(doc: StudentDocumentRecord) {
  const targets = new Set<string>();
  if (doc.grNo && doc.grNo !== 'UNASSIGNED') targets.add(doc.grNo);
  if (Array.isArray(doc.linkedGrNos) && doc.classification !== 'STUDENT_PHOTO') {
    for (const linkedGr of doc.linkedGrNos) {
      if (linkedGr && linkedGr !== 'UNASSIGNED') targets.add(linkedGr);
    }
  }
  for (const targetGr of targets) {
    updateStudentDossier(targetGr, doc);
  }
}

export function auditDossierAgainstSheet(grNo: string, sheetRecord?: any): DocumentDiscrepancy[] {
  const dossier = dossiersStore[grNo];
  if (!dossier) return [];

  if (sheetRecord) {
    if (!dossier.studentName && (sheetRecord.studentName || sheetRecord['STUDENTNAME'])) {
      dossier.studentName = sheetRecord.studentName || sheetRecord['STUDENTNAME'];
    }
    if (!dossier.fatherName && (sheetRecord.fatherName || sheetRecord['FATHERNAME'])) {
      dossier.fatherName = sheetRecord.fatherName || sheetRecord['FATHERNAME'];
    }
    if (!dossier.currentClass && (sheetRecord.currentClass || sheetRecord['CURRENTCLASS'])) {
      dossier.currentClass = sheetRecord.currentClass || sheetRecord['CURRENTCLASS'];
    }
    const sheetBFormHint = normalizeNadraNumber(sheetRecord.bFormNo || sheetRecord['B.FORMNO']);
    const bFormShared = dossier.documents.find((d) => d.classification === 'B_FORM');
    if (bFormShared && Array.isArray(bFormShared.extractedData?.children) && bFormShared.extractedData.children.length > 1) {
      const childSpec = resolveChildFieldsForDossier(bFormShared, dossier.studentName, sheetBFormHint || dossier.bFormNo);
      if (childSpec.bFormNo) dossier.bFormNo = childSpec.bFormNo;
      if (childSpec.dob) dossier.dob = childSpec.dob;
    }
  }

  dossier.missingTypes = computeMissingTypes(dossier);
  dossier.hasMissingDocuments = dossier.missingTypes.length > 0;

  const discrepancies: DocumentDiscrepancy[] = [];
  for (const d of dossier.documents) {
    for (const docFlag of d.discrepancies || []) {
      if (docFlag.field === 'misfiled') {
        discrepancies.push({
          ...docFlag,
          isDismissed: Boolean(dismissedFlagsStore[docFlag.id]),
        });
      }
    }
  }

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
          message: `B-Form Mismatch: Document has ${dossier.bFormNo} but Sheet has ${sheetBForm}`,
          suggestedAction: 'reformat_bform',
          suggestedCorrection: { field: 'bFormNo', newValue: dossier.bFormNo, reason: `Update B-Form (${dossier.bFormNo})`, previousValue: sheetBForm },
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
          message: `CNIC Mismatch: Document has ${dossier.parentCnic} but Sheet has ${sheetCnic}`,
          suggestedAction: 'reformat_bform',
          suggestedCorrection: { field: 'parentCnic', newValue: dossier.parentCnic, reason: `Update CNIC (${dossier.parentCnic})`, previousValue: sheetCnic },
          documentId: cnicDoc?.id || primaryDoc?.id, documentUrl: cnicDoc?.url || primaryDoc?.url,
          documentFilename: cnicDoc?.originalFilename || primaryDoc?.originalFilename,
          documentClassification: cnicDoc?.classification || primaryDoc?.classification,
          isDismissed: Boolean(dismissedFlagsStore[id]),
        });
      }
    }

    if (!dossier.bFormNo && sheetBForm) {
      const doc = primaryDoc;
      const id = `flag_bform_missing_${grNo}`;
      discrepancies.push({
        id, grNo, studentName, fatherName, currentClass, field: 'missing', fieldName: 'NADRA B-Form / CRC Number',
        sheetValue: sheetBForm, extractedValue: '', severity: 'medium',
        message: `Missing Document: No B-Form on file. Sheet has B-Form ${sheetBForm}. Upload or re-check the student's B-Form.`,
        suggestedAction: 'reformat_bform',
        documentId: doc?.id, documentUrl: doc?.url, documentFilename: doc?.originalFilename,
        documentClassification: doc?.classification,
        isDismissed: Boolean(dismissedFlagsStore[id]),
      });
    }

    if (!dossier.parentCnic && sheetCnic) {
      const doc = cnicDoc || primaryDoc;
      const id = `flag_cnic_missing_${grNo}`;
      discrepancies.push({
        id, grNo, studentName, fatherName, currentClass, field: 'missing', fieldName: 'Father / Guardian CNIC',
        sheetValue: sheetCnic, extractedValue: '', severity: 'medium',
        message: `Missing Document: No father CNIC on file. Sheet has CNIC ${sheetCnic}. Upload or re-check the father's CNIC.`,
        suggestedAction: 'reformat_bform',
        documentId: doc?.id, documentUrl: doc?.url, documentFilename: doc?.originalFilename,
        documentClassification: doc?.classification,
        isDismissed: Boolean(dismissedFlagsStore[id]),
      });
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
          message: `DOB Mismatch: Document has "${dossier.dob}" while Sheet has "${sheetDob}"`,
          suggestedCorrection: { field: 'dob', newValue: dossier.dob, reason: `Update DOB from document (${dossier.dob})`, previousValue: sheetDob },
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
      if (flag.field === 'misfiled' && Array.isArray(flag.rankedMatches) && flag.rankedMatches.length > 0) {
        continue;
      }
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

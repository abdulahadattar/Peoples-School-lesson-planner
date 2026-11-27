import { StudentDossier, StudentDocumentRecord } from '../../../types/documentArchive';
import { StudentRecord } from '../../../services/googleSheetsService';

export function filterArchiveDossiers(
  dossiers: StudentDossier[],
  selectedClass: string,
  statusFilter: 'all' | 'flagged' | 'clean' | 'missing',
  searchQuery: string
): StudentDossier[] {
  const q = searchQuery.trim().toLowerCase();
  return dossiers.filter((d) => {
    if (selectedClass !== 'ALL' && d.currentClass !== selectedClass) return false;
    if (statusFilter === 'flagged' && d.allFlags.length === 0) return false;
    if (statusFilter === 'clean' && (d.allFlags.length > 0 || d.hasMissingDocuments)) return false;
    if (statusFilter === 'missing' && !d.hasMissingDocuments) return false;
    if (q) {
      return (
        d.grNo.toLowerCase().includes(q) ||
        d.studentName.toLowerCase().includes(q) ||
        d.fatherName.toLowerCase().includes(q) ||
        (Boolean(d.bFormNo) && d.bFormNo.includes(q))
      );
    }
    return true;
  });
}

export function filterArchiveDocuments(
  documents: StudentDocumentRecord[],
  dossierByGr: Map<string, StudentDossier>,
  selectedClass: string,
  statusFilter: 'all' | 'flagged' | 'clean' | 'missing',
  searchQuery: string
): StudentDocumentRecord[] {
  const q = searchQuery.trim().toLowerCase();
  return documents.filter((doc) => {
    const dossier = doc.grNo !== 'UNASSIGNED' ? dossierByGr.get(doc.grNo) : undefined;
    if (selectedClass !== 'ALL' && dossier?.currentClass !== selectedClass) return false;
    if (statusFilter === 'flagged') {
      const hasFlag =
        doc.status === 'manual_review' ||
        doc.status === 'flagged' ||
        Boolean(doc.misfiledWarning) ||
        Boolean(dossier && dossier.allFlags.length > 0);
      if (!hasFlag) return false;
    } else if (statusFilter === 'clean') {
      if (doc.status !== 'verified' || (dossier && (dossier.allFlags.length > 0 || dossier.hasMissingDocuments))) {
        return false;
      }
    } else if (statusFilter === 'missing') {
      if (doc.grNo !== 'UNASSIGNED' && !(dossier && dossier.hasMissingDocuments)) return false;
    }
    if (q) {
      const hay = [
        doc.grNo,
        ...(doc.linkedGrNos || []),
        doc.folderName,
        doc.filename,
        doc.originalFilename,
        doc.classification,
        doc.extractedData?.studentName,
        doc.extractedData?.fatherName,
        doc.extractedData?.bFormNo,
        doc.extractedData?.fatherCnic,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function buildStudentModalFallback(
  grNo: string,
  sheetRecords: StudentRecord[],
  dossiers: StudentDossier[]
): StudentRecord | null {
  const trimmed = grNo.trim();
  const sheetMatch = sheetRecords.find(
    (r) => String(r.grNo || r['G.R.NO'] || '').trim() === trimmed
  );
  if (sheetMatch) return sheetMatch;

  const dossier = dossiers.find((d) => d.grNo === trimmed);
  if (!dossier) return null;

  return {
    rowNumber: 0,
    grNo: dossier.grNo,
    studentName: dossier.studentName,
    bFormNo: dossier.bFormNo,
    fatherName: dossier.fatherName,
    gender: '',
    dobDay: '',
    dobMonth: '',
    dobYear: '',
    classAdmitted: '',
    currentClass: dossier.currentClass,
    parentCnic: dossier.parentCnic,
    religion: '',
    address: '',
    parentContact: '',
    emergencyContact: '',
    admissionDay: '',
    admissionMonth: '',
    admissionYear: '',
    section: dossier.section,
    partnerContact: '',
    shift: '',
    medium: '',
    picture: dossier.avatarUrl,
    status: '',
  };
}

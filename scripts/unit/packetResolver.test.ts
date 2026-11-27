import type { StudentDocumentRecord } from '../../types/documentArchive';
import { parseFolderGrInfo } from '../../services/documentArchive/nameMatching';
import { resolveStudentPackets } from '../../services/documentArchive/packetResolver';
import { resolveChildFieldsForDossier } from '../../services/documentArchive/discrepancies';
import {
  autoLinkDocumentsAgainstSheet,
  assignDocumentToGr,
} from '../../services/documentArchive/studentMatching';
import { documentsStore, dossiersStore } from '../../services/documentArchive/store';

type Harness = {
  describe: (name: string) => void;
  it: (name: string, fn: () => void) => void;
  eq: (actual: unknown, expected: unknown, msg?: string) => void;
};

function makeDoc(partial: Partial<StudentDocumentRecord>): StudentDocumentRecord {
  return {
    id: partial.id || `doc_${Math.random().toString(36).slice(2, 7)}`,
    jobId: partial.jobId || 'job_test',
    grNo: partial.grNo || 'UNASSIGNED',
    classification: partial.classification || 'OTHER_UNCLASSIFIED',
    originalFilename: partial.originalFilename || 'scan.jpg',
    filename: partial.filename || 'scan.jpg',
    url: partial.url || '/api/documents/file/UNASSIGNED/scan.jpg',
    processedAt: partial.processedAt || new Date().toISOString(),
    fileHash: partial.fileHash || `hash_${Math.random().toString(36).slice(2, 9)}`,
    fileSizeBytes: partial.fileSizeBytes ?? 1024,
    rotationApplied: partial.rotationApplied ?? 0,
    isBlackAndWhite: partial.isBlackAndWhite ?? true,
    classificationConfidence: partial.classificationConfidence ?? 0.9,
    extractedData: partial.extractedData || {},
    discrepancies: partial.discrepancies || [],
    status: partial.status || 'verified',
    ...partial,
  };
}

const SHEET_ROSTER = [
  {
    grNo: '1299',
    studentName: 'Ali Hassan Brohi',
    fatherName: 'Muhammad Ibrahim Brohi',
    bFormNo: '41504-1111111-1',
    parentCnic: '41504-9999999-9',
    currentClass: 'IX',
    section: 'A',
    dob: '12/03/2010',
  },
  {
    grNo: '1410',
    studentName: 'Zainab Brohi',
    fatherName: 'Muhammad Ibrahim Brohi',
    bFormNo: '41504-2222222-2',
    parentCnic: '41504-9999999-9',
    currentClass: 'VII',
    section: 'B',
    dob: '05/08/2012',
  },
  {
    grNo: '1305',
    studentName: 'Bilal Ahmed Solangi',
    fatherName: 'Abdul Karim Solangi',
    bFormNo: '41504-3333333-3',
    parentCnic: '41504-8888888-7',
    currentClass: 'X',
    section: 'A',
    dob: '19/01/2009',
  },
];

export function runPacketResolverTests(h: Harness) {
  const { describe, it, eq } = h;

  describe('nameMatching.parseFolderGrInfo & packetResolver');

  it('parses GR numbers from folder names while ignoring years and generic labels', () => {
    eq(parseFolderGrInfo('1299_images/bform.jpg').grNo, '1299');
    eq(parseFolderGrInfo('13 Mansoor Lashari/photo.jpg').grNo, '13');
    eq(parseFolderGrInfo('GR_045/cnic.jpg').grNo, '045');
    eq(parseFolderGrInfo('Drive_2025/images/scan.jpg').grNo, 'UNASSIGNED');
  });

  it('links multi-child B-Form across enrolled siblings while keeping portrait scoped to target student', () => {
    const bFormDoc = makeDoc({
      id: 'bform_1299',
      grNo: '1299',
      parsedFolderGrNo: '1299',
      folderName: '1299_images',
      packetId: 'pkt_1299',
      classification: 'B_FORM',
      extractedData: {
        applicantName: 'Muhammad Ibrahim Brohi',
        applicantCnic: '41504-9999999-9',
        children: [
          { childNameEnglish: 'Ali Hassan Brohi', bFormNo: '41504-1111111-1', dob: '12/03/2010' },
          { childNameEnglish: 'Zainab Brohi', bFormNo: '41504-2222222-2', dob: '05/08/2012' },
        ],
      },
    });

    const fatherCnicDoc = makeDoc({
      id: 'cnic_1299',
      grNo: '1299',
      parsedFolderGrNo: '1299',
      folderName: '1299_images',
      packetId: 'pkt_1299',
      classification: 'FATHER_CNIC_FRONT',
      extractedData: {
        cardholderName: 'Muhammad Ibrahim Brohi',
        fatherCnic: '41504-9999999-9',
      },
    });

    const portraitDoc = makeDoc({
      id: 'photo_1299',
      grNo: '1299',
      parsedFolderGrNo: '1299',
      folderName: '1299_images',
      packetId: 'pkt_1299',
      classification: 'STUDENT_PHOTO',
      isBlackAndWhite: false,
      preClassifiedAs: 'portrait',
      aiSkipped: true,
      extractedData: { grNo: '1299' },
    });

    const summary = resolveStudentPackets([bFormDoc, fatherCnicDoc, portraitDoc], SHEET_ROSTER);
    eq(summary.multiSiblingLinks, 1);
    eq(bFormDoc.linkedGrNos, ['1299', '1410']);
    eq(fatherCnicDoc.linkedGrNos, ['1299', '1410']);
    eq(portraitDoc.linkedGrNos, ['1299']);

    const aliFields = resolveChildFieldsForDossier(bFormDoc, 'Ali Hassan Brohi', '41504-1111111-1');
    const zainabFields = resolveChildFieldsForDossier(bFormDoc, 'Zainab Brohi', '41504-2222222-2');
    eq(aliFields.bFormNo, '41504-1111111-1');
    eq(zainabFields.bFormNo, '41504-2222222-2');
  });

  it('flags misfiled documents inside the wrong student folder and cleans up on manual reassign', () => {
    for (const k of Object.keys(documentsStore)) delete documentsStore[k];
    for (const k of Object.keys(dossiersStore)) delete dossiersStore[k];

    const wrongMarksheet = makeDoc({
      id: 'ms_wrong_1',
      grNo: '1299',
      parsedFolderGrNo: '1299',
      folderName: '1299_images',
      packetId: 'pkt_misfile_test',
      classification: 'MARKS_CERTIFICATE',
      filename: 'ms.jpg',
      extractedData: {
        studentName: 'Bilal Ahmed Solangi',
        fatherName: 'Abdul Karim Solangi',
      },
    });
    const aliBForm = makeDoc({
      id: 'bf_ali_1',
      grNo: '1299',
      parsedFolderGrNo: '1299',
      folderName: '1299_images',
      packetId: 'pkt_misfile_test',
      classification: 'B_FORM',
      filename: 'bf.jpg',
      extractedData: {
        applicantName: 'Muhammad Ibrahim Brohi',
        applicantCnic: '41504-9999999-9',
        children: [{ childNameEnglish: 'Ali Hassan Brohi', bFormNo: '41504-1111111-1', dob: '12/03/2010' }],
      },
    });

    documentsStore[wrongMarksheet.id] = wrongMarksheet;
    documentsStore[aliBForm.id] = aliBForm;

    const linked = autoLinkDocumentsAgainstSheet(SHEET_ROSTER);
    eq(Boolean(wrongMarksheet.misfiledWarning), true, 'Expected misfiled warning on wrong marksheet');
    const misfiledFlag = (linked.discrepancies['1299'] || []).find((f) => f.field === 'misfiled');
    eq(Boolean(misfiledFlag), true, 'Expected misfiled flag in GR 1299 audit list');
    eq(misfiledFlag?.rankedMatches?.[0]?.grNo, '1305');

    assignDocumentToGr(wrongMarksheet.id, '1305', SHEET_ROSTER[2]);
    eq(wrongMarksheet.grNo, '1305');
    eq(Boolean(wrongMarksheet.misfiledWarning), false);
    eq(dossiersStore['1299'].documents.some((d) => d.id === wrongMarksheet.id), false);
    eq(dossiersStore['1305'].documents.some((d) => d.id === wrongMarksheet.id), true);

    for (const k of Object.keys(documentsStore)) delete documentsStore[k];
    for (const k of Object.keys(dossiersStore)) delete dossiersStore[k];
  });
}

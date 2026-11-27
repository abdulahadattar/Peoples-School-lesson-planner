/**
 * Multi-Document Batch Context & Sibling Disambiguation (Pure Resolver).
 *
 * Groups documents sharing a `packetId` / subfolder (`1299_images`) into a
 * Student Packet and resolves identity across the school roster:
 * - Multi-child B-Forms link to EVERY enrolled sibling (`linkedGrNos`).
 * - Father CNICs combine packet clues (folder GR, B-Form, siblings) to link properly.
 * - Individual marksheets and student portraits link strictly to the target child.
 * - Misfiled one-offs emit clear `'misfiled'` discrepancies with candidate matches.
 */
import type {
  CandidateStudentMatch,
  ExtractedChildRecord,
  ExtractedStudentInfo,
  StudentDocumentRecord,
} from '../../types/documentArchive';
import { calculateNameSimilarity, isInvalidPersonName } from './nameMatching.js';
import { getRankedCandidateMatches, scoreStudentAgainstExtracted } from './studentMatching.js';
import {
  lookupRecordByGr,
  getSheetStudentFields,
  matchFatherIdentity,
  matchChildRowToRecords,
  buildMisfiledDiscrepancy,
  setOrClearMisfiledDiscrepancy,
} from './packetHelpers.js';

export interface PacketResolutionSummary {
  packetsProcessed: number;
  multiSiblingLinks: number;
  misfiledCount: number;
  reassignedCount: number;
  updatedDocIds: string[];
}

export function resolveStudentPackets(
  allDocuments: StudentDocumentRecord[],
  sheetRecords: any[]
): PacketResolutionSummary {
  const summary: PacketResolutionSummary = {
    packetsProcessed: 0,
    multiSiblingLinks: 0,
    misfiledCount: 0,
    reassignedCount: 0,
    updatedDocIds: [],
  };
  if (!Array.isArray(allDocuments) || allDocuments.length === 0 || !Array.isArray(sheetRecords) || sheetRecords.length === 0) {
    return summary;
  }

  const packets = new Map<string, StudentDocumentRecord[]>();
  for (const doc of allDocuments) {
    const key =
      doc.packetId ||
      (doc.folderName ? `folder:${doc.folderName}` : `${doc.jobId}:${doc.parsedFolderGrNo || doc.grNo}`);
    const list = packets.get(key) || [];
    list.push(doc);
    packets.set(key, list);
  }

  for (const packetDocs of packets.values()) {
    summary.packetsProcessed++;
    const folderGr =
      packetDocs.find((d) => d.parsedFolderGrNo && d.parsedFolderGrNo !== 'UNASSIGNED')?.parsedFolderGrNo ||
      packetDocs.find((d) => d.grNo !== 'UNASSIGNED')?.grNo ||
      'UNASSIGNED';
    const primaryStudent = lookupRecordByGr(sheetRecords, folderGr);
    const primaryFields = primaryStudent ? getSheetStudentFields(primaryStudent) : undefined;

    const packetFatherCnics = new Set<string>();
    const packetFatherNames = new Set<string>();
    if (primaryFields?.parentCnic) packetFatherCnics.add(primaryFields.parentCnic);
    if (primaryFields?.fatherName) packetFatherNames.add(primaryFields.fatherName);
    for (const d of packetDocs) {
      const ext = d.extractedData || {};
      const cnic = ext.fatherCnic || ext.applicantCnic;
      const fname = ext.cardholderName || ext.fatherName || ext.applicantName;
      if (cnic) packetFatherCnics.add(cnic);
      if (fname && !isInvalidPersonName(fname)) packetFatherNames.add(fname);
    }

    const fallbackFatherName = [...packetFatherNames][0];
    const fallbackFatherCnic = [...packetFatherCnics][0];
    const packetResolvedSingleChildGrs = new Set<string>();

    for (const doc of packetDocs) {
      const ext = doc.extractedData || {};
      const docFolderGr = doc.parsedFolderGrNo || folderGr;

      if (doc.classification === 'STUDENT_PHOTO') continue;

      if (doc.classification === 'B_FORM' || (Array.isArray(ext.children) && ext.children.length > 0)) {
        const bFatherName = ext.applicantName || ext.fatherName || fallbackFatherName;
        const bFatherCnic = ext.applicantCnic || ext.fatherCnic || fallbackFatherCnic;
        const rows: ExtractedChildRecord[] =
          Array.isArray(ext.children) && ext.children.length > 0
            ? ext.children
            : ext.studentName || ext.bFormNo
            ? [{ childNameEnglish: ext.studentName, bFormNo: ext.bFormNo, dob: ext.dob }]
            : [];

        const matchedGrs: string[] = [];
        for (const child of rows) {
          const matched = matchChildRowToRecords(child, bFatherName, bFatherCnic, sheetRecords);
          if (matched) {
            const matchedGr = getSheetStudentFields(matched.record).grNo;
            if (matchedGr && !matchedGrs.includes(matchedGr)) {
              matchedGrs.push(matchedGr);
              if (matched.score >= 55) child.isTargetStudent = matchedGr === docFolderGr || matchedGrs.length === 1;
            }
          }
        }

        if (matchedGrs.length > 0) {
          doc.linkedGrNos = matchedGrs;
          if (matchedGrs.length > 1) summary.multiSiblingLinks++;
          if (docFolderGr !== 'UNASSIGNED' && matchedGrs.includes(docFolderGr)) {
            doc.grNo = docFolderGr;
            setOrClearMisfiledDiscrepancy(doc, null);
          } else if (docFolderGr === 'UNASSIGNED') {
            doc.grNo = matchedGrs[0];
            summary.reassignedCount++;
            setOrClearMisfiledDiscrepancy(doc, null);
          } else {
            const candidates: CandidateStudentMatch[] = matchedGrs
              .map((g) => lookupRecordByGr(sheetRecords, g))
              .filter(Boolean)
              .map((rec) => {
                const sf = getSheetStudentFields(rec);
                return {
                  grNo: sf.grNo,
                  studentName: sf.studentName,
                  fatherName: sf.fatherName,
                  currentClass: sf.currentClass,
                  section: sf.section,
                  bFormNo: sf.bFormNo,
                  parentCnic: sf.parentCnic,
                  score: 92,
                  evidence: ['B-Form child & family table match'],
                  reasons: 'B-Form child & family table match',
                };
              });
            const names = candidates.map((c) => `GR #${c.grNo} (${c.studentName})`).join(', ');
            setOrClearMisfiledDiscrepancy(
              doc,
              buildMisfiledDiscrepancy(
                doc,
                docFolderGr,
                primaryStudent,
                candidates,
                `Misfiled B-Form: Placed in folder GR #${docFolderGr}, but listed children match ${names}.`
              )
            );
            summary.misfiledCount++;
          }
          if (matchedGrs.length === 1) packetResolvedSingleChildGrs.add(matchedGrs[0]);
          summary.updatedDocIds.push(doc.id);
        }
        continue;
      }

      if (doc.classification === 'FATHER_CNIC_FRONT' || doc.classification === 'FATHER_CNIC_BACK') {
        const cnicFatherName = ext.cardholderName || ext.fatherName;
        const cnicNumber = ext.fatherCnic;
        const matchingChildrenGrs: string[] = [];

        for (const r of sheetRecords) {
          if (matchFatherIdentity(cnicFatherName, cnicNumber, r).matched) {
            const sf = getSheetStudentFields(r);
            if (sf.grNo && !matchingChildrenGrs.includes(sf.grNo)) matchingChildrenGrs.push(sf.grNo);
          }
        }

        if (docFolderGr !== 'UNASSIGNED' && primaryStudent) {
          const primaryFatherCheck = matchFatherIdentity(cnicFatherName, cnicNumber, primaryStudent);
          if (primaryFatherCheck.strongMismatch && matchingChildrenGrs.length > 0) {
            const candidates = getRankedCandidateMatches(
              { fatherName: cnicFatherName, fatherCnic: cnicNumber },
              sheetRecords,
              5
            );
            setOrClearMisfiledDiscrepancy(
              doc,
              buildMisfiledDiscrepancy(
                doc,
                docFolderGr,
                primaryStudent,
                candidates,
                `Misfiled Father CNIC: Placed in folder GR #${docFolderGr} (${primaryFields?.fatherName || 'different guardian'}), but CNIC belongs to ${candidates[0]?.fatherName || 'another parent'} (GR #${matchingChildrenGrs.join(', #')}).`
              )
            );
            summary.misfiledCount++;
          } else {
            doc.grNo = docFolderGr;
            if (matchingChildrenGrs.length > 0) {
              doc.linkedGrNos = matchingChildrenGrs.includes(docFolderGr)
                ? matchingChildrenGrs
                : [docFolderGr, ...matchingChildrenGrs];
            }
            setOrClearMisfiledDiscrepancy(doc, null);
          }
        } else if (matchingChildrenGrs.length > 0) {
          doc.grNo = matchingChildrenGrs[0];
          doc.linkedGrNos = matchingChildrenGrs;
          summary.reassignedCount++;
          setOrClearMisfiledDiscrepancy(doc, null);
        }
        summary.updatedDocIds.push(doc.id);
        continue;
      }

      const rawProbe: ExtractedStudentInfo = { ...ext, grNo: undefined };
      const rawCandidates = getRankedCandidateMatches(rawProbe, sheetRecords, 5);
      const rawBest = rawCandidates[0];
      const rawPrimaryScore = primaryStudent ? scoreStudentAgainstExtracted(rawProbe, primaryStudent).points : 0;

      if (docFolderGr !== 'UNASSIGNED' && primaryStudent && primaryFields && rawBest && rawBest.score >= 55 && rawBest.grNo !== docFolderGr) {
        const simToPrimary =
          ext.studentName && primaryFields.studentName
            ? calculateNameSimilarity(ext.studentName, primaryFields.studentName).similarity
            : 0;
        const fatherCheck = matchFatherIdentity(ext.fatherName, ext.fatherCnic, primaryStudent);
        if (fatherCheck.strongMismatch || (simToPrimary < 0.65 && rawBest.score >= rawPrimaryScore + 15)) {
          setOrClearMisfiledDiscrepancy(
            doc,
            buildMisfiledDiscrepancy(
              doc,
              docFolderGr,
              primaryStudent,
              rawCandidates,
              `Misfiled ${doc.classification.replace(/_/g, ' ')}: Inside folder GR #${docFolderGr}, but content belongs to GR #${rawBest.grNo} (${rawBest.studentName}, ${rawBest.currentClass || 'enrolled student'}).`
            )
          );
          summary.misfiledCount++;
          summary.updatedDocIds.push(doc.id);
          continue;
        }
      }

      const primaryFatherCheck = primaryStudent
        ? matchFatherIdentity(ext.fatherName, ext.fatherCnic, primaryStudent)
        : { matched: false, strongMismatch: false };
      const enrichedProbe: ExtractedStudentInfo = {
        ...rawProbe,
        fatherName: ext.fatherName || (!primaryFatherCheck.strongMismatch ? fallbackFatherName : undefined),
        fatherCnic: ext.fatherCnic || (!primaryFatherCheck.strongMismatch ? fallbackFatherCnic : undefined),
      };
      const candidates = getRankedCandidateMatches(enrichedProbe, sheetRecords, 5);
      const best = candidates[0];

      if (best && best.score >= 55) {
        if (doc.grNo === 'UNASSIGNED') {
          doc.grNo = best.grNo;
          summary.reassignedCount++;
        }
        doc.linkedGrNos = [doc.grNo];
        setOrClearMisfiledDiscrepancy(doc, null);
        packetResolvedSingleChildGrs.add(doc.grNo);
        summary.updatedDocIds.push(doc.id);
      } else if (docFolderGr !== 'UNASSIGNED') {
        doc.grNo = docFolderGr;
        doc.linkedGrNos = [docFolderGr];
      }
    }

    for (const doc of packetDocs) {
      if (doc.classification !== 'STUDENT_PHOTO') continue;
      const docFolderGr = doc.parsedFolderGrNo || folderGr;
      if (docFolderGr !== 'UNASSIGNED') {
        doc.grNo = docFolderGr;
        doc.linkedGrNos = [docFolderGr];
      } else if (doc.grNo === 'UNASSIGNED' && packetResolvedSingleChildGrs.size === 1) {
        const onlyChildGr = [...packetResolvedSingleChildGrs][0];
        doc.grNo = onlyChildGr;
        doc.linkedGrNos = [onlyChildGr];
        summary.reassignedCount++;
        summary.updatedDocIds.push(doc.id);
      }
    }
  }

  return summary;
}

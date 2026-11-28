import type {
  ArchiveDocument,
  ArchiveDocumentStatus,
  BatchPacket,
  DocumentCategory,
  DocumentOcrExtraction,
  OcrLogEntry,
  PreClassifierResult,
  SiblingMatchLink,
  StudentRecord,
} from '../src/types.ts';

export function parseGrNumberFromText(input: string): string | undefined {
  if (!input) return undefined;
  const cleaned = input.trim();
  const explicit = cleaned.match(/(?:gr[-_\s#]*|^)(\d{3,6})(?:[-_\s]|$)/i);
  if (explicit?.[1]) return explicit[1];
  const anyDigits = cleaned.match(/\b(\d{3,6})\b/);
  return anyDigits?.[1];
}

export function normalizeCnicDigits(val?: string): string {
  if (!val) return '';
  return val.replace(/\D/g, '');
}

function normalizeNameTokens(name?: string): string[] {
  if (!name) return [];
  const stopWords = new Set(['mr', 'mrs', 'ms', 'miss', 's/o', 'd/o', 'bin', 'binte']);
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && !stopWords.has(t));
}

function nameSimilarity(a?: string, b?: string): number {
  const ta = normalizeNameTokens(a);
  const tb = normalizeNameTokens(b);
  if (ta.length === 0 || tb.length === 0) return 0;

  let matches = 0;
  for (const tokenA of ta) {
    if (
      tb.some(
        (tokenB) =>
          tokenA === tokenB ||
          (tokenA.length >= 4 && tokenB.startsWith(tokenA)) ||
          (tokenB.length >= 4 && tokenA.startsWith(tokenB))
      )
    ) {
      matches += 1;
    }
  }
  return matches / Math.max(ta.length, tb.length);
}

export interface IncomingPacketItem {
  tempId: string;
  source: 'google_drive' | 'local_upload';
  driveFileId?: string;
  folderName: string;
  fileName: string;
  pageIndex: number;
  totalPages: number;
  mimeType: string;
  colorMode: 'original_color' | 'high_contrast_greyscale';
  originalBytes: number;
  optimizedBytes: number;
  width: number;
  height: number;
  storedFileName: string;
  preClassification: PreClassifierResult;
  ocrSkipped: boolean;
  ocrData?: DocumentOcrExtraction;
}

export function resolveBatchPacket(params: {
  packetId: string;
  folderName: string;
  driveFolderId?: string;
  items: IncomingPacketItem[];
  students: StudentRecord[];
}): {
  packet: BatchPacket;
  documents: ArchiveDocument[];
  logs: OcrLogEntry[];
  updatedPortraitLinks: Array<{ grNumber: string; documentId: string }>;
} {
  const now = new Date().toISOString();
  const { packetId, folderName, driveFolderId, items, students } = params;

  let parsedGrNumber = parseGrNumberFromText(folderName);
  if (!parsedGrNumber) {
    for (const item of items) {
      const fromFile = parseGrNumberFromText(item.fileName);
      if (fromFile) {
        parsedGrNumber = fromFile;
        break;
      }
    }
  }

  const primaryStudent = parsedGrNumber
    ? students.find((s) => s.grNumber === parsedGrNumber)
    : undefined;

  // Aggregate packet-wide clues from all OCR-extracted documents
  let packetFatherCnic = primaryStudent?.fatherCnic || '';
  let packetFatherName = primaryStudent?.fatherName || '';
  const childNamesSet = new Set<string>();
  const detectedGrSet = new Set<string>();
  if (parsedGrNumber) detectedGrSet.add(parsedGrNumber);

  for (const item of items) {
    const ocr = item.ocrData;
    if (!ocr) continue;
    if (ocr.fatherCnic && normalizeCnicDigits(ocr.fatherCnic).length >= 13) {
      packetFatherCnic = ocr.fatherCnic;
    }
    if (ocr.fatherName && !packetFatherName) {
      packetFatherName = ocr.fatherName;
    }
    if (ocr.grNumberDetected) {
      detectedGrSet.add(ocr.grNumberDetected.replace(/\D/g, '') || ocr.grNumberDetected);
    }
    if (ocr.studentName) {
      childNamesSet.add(ocr.studentName);
    }
    for (const child of ocr.children) {
      childNamesSet.add(child.fullName);
    }
  }

  const documents: ArchiveDocument[] = [];
  const logs: OcrLogEntry[] = [];
  const updatedPortraitLinks: Array<{ grNumber: string; documentId: string }> = [];

  let skippedPortraitCount = 0;
  let flaggedCount = 0;
  let siblingLinksCreated = 0;

  for (const item of items) {
    const docId = item.tempId;
    const bytesSaved = Math.max(0, item.originalBytes - item.optimizedBytes);
    let category: DocumentCategory = 'other_document';
    let status: ArchiveDocumentStatus = 'flagged_ambiguous';
    let linkedGrNumbers: string[] = [];
    let siblingMatches: SiblingMatchLink[] = [];
    let flagReason: string | undefined;

    if (item.ocrSkipped || item.preClassification.classification === 'portrait') {
      category = 'student_photo';
      skippedPortraitCount += 1;

      if (primaryStudent) {
        status = 'skipped_portrait';
        linkedGrNumbers = [primaryStudent.grNumber];
        siblingMatches = [
          {
            grNumber: primaryStudent.grNumber,
            studentName: primaryStudent.fullName,
            className: primaryStudent.className,
            matchReason: `Folder GR ${primaryStudent.grNumber} primary portrait match (AI skipped)`,
            confidence: item.preClassification.confidence,
          },
        ];
        updatedPortraitLinks.push({ grNumber: primaryStudent.grNumber, documentId: docId });
      } else {
        status = 'flagged_ambiguous';
        flagReason = parsedGrNumber
          ? `Portrait detected, but GR ${parsedGrNumber} was not found in Student Records.`
          : 'Portrait detected, but no GR number could be parsed from folder or filename.';
        flaggedCount += 1;
      }

      logs.push({
        id: `log_pf_${docId}`,
        timestamp: now,
        packetId,
        documentId: docId,
        fileName: item.fileName,
        stage: 'pre_filter',
        outcome: primaryStudent ? 'skipped_portrait' : 'flagged',
        aiCostSaved: true,
        bytesSaved,
        durationMs: item.preClassification.processingMs,
        details: primaryStudent
          ? `Local detector classified as student_photo (${Math.round(
              item.preClassification.confidence * 100
            )}%). Kept full color, skipped Gemini API, linked to GR ${primaryStudent.grNumber}.`
          : `Local detector classified as student_photo ($0 AI cost), flagged because no student record matched folder "${folderName}".`,
      });
    } else if (item.ocrData) {
      const ocr = item.ocrData;
      category = ocr.documentType;

      const docFatherCnicDigits = normalizeCnicDigits(ocr.fatherCnic);
      const primaryFatherCnicDigits = normalizeCnicDigits(primaryStudent?.fatherCnic);
      const effectiveFatherCnicDigits =
        docFatherCnicDigits || normalizeCnicDigits(packetFatherCnic);
      const effectiveFatherName = ocr.fatherName || packetFatherName;

      if (category === 'b_form') {
        const matchedMap = new Map<string, SiblingMatchLink>();

        // 1. Check father CNIC conflict against primary folder student
        const hasFamilyConflict =
          primaryStudent &&
          docFatherCnicDigits.length === 13 &&
          primaryFatherCnicDigits.length === 13 &&
          docFatherCnicDigits !== primaryFatherCnicDigits;

        // 2. Match every child listed on the B-Form against full student database
        const entriesToMatch =
          ocr.children.length > 0
            ? ocr.children
            : ocr.studentName
              ? [
                  {
                    fullName: ocr.studentName,
                    bFormNumber: ocr.bFormNumber,
                    dateOfBirth: ocr.dateOfBirth,
                  },
                ]
              : [];

        for (const child of entriesToMatch) {
          const childBFormDigits = normalizeCnicDigits(child.bFormNumber);
          let bestStudent: StudentRecord | undefined;
          let bestScore = 0;
          let bestReason = '';

          for (const student of students) {
            let score = 0;
            const reasons: string[] = [];

            if (
              childBFormDigits.length === 13 &&
              normalizeCnicDigits(student.bFormNumber) === childBFormDigits
            ) {
              score += 0.98;
              reasons.push('Exact B-Form ID');
            }

            const studentFatherDigits = normalizeCnicDigits(student.fatherCnic);
            if (
              effectiveFatherCnicDigits.length === 13 &&
              studentFatherDigits === effectiveFatherCnicDigits
            ) {
              score += 0.42;
              reasons.push('Father CNIC match');
            } else if (nameSimilarity(effectiveFatherName, student.fatherName) >= 0.65) {
              score += 0.28;
              reasons.push('Father name match');
            }

            const childSim = nameSimilarity(child.fullName, student.fullName);
            if (childSim >= 0.5) {
              score += childSim * 0.55;
              reasons.push(`Child name (${Math.round(childSim * 100)}%)`);
            }

            if (child.dateOfBirth && student.dateOfBirth && child.dateOfBirth === student.dateOfBirth) {
              score += 0.25;
              reasons.push('DOB match');
            }

            if (score > bestScore) {
              bestScore = score;
              bestStudent = student;
              bestReason = reasons.join(' + ');
            }
          }

          if (bestStudent && bestScore >= 0.68) {
            matchedMap.set(bestStudent.grNumber, {
              grNumber: bestStudent.grNumber,
              studentName: bestStudent.fullName,
              className: bestStudent.className,
              matchReason: bestReason,
              confidence: Math.min(0.99, Number(bestScore.toFixed(2))),
            });
          }
        }

        // Also check if B-Form matches all siblings via Father CNIC when child names are partially occluded
        if (matchedMap.size === 0 && primaryStudent && !hasFamilyConflict) {
          if (
            (docFatherCnicDigits && docFatherCnicDigits === primaryFatherCnicDigits) ||
            nameSimilarity(ocr.fatherName, primaryStudent.fatherName) >= 0.65
          ) {
            matchedMap.set(primaryStudent.grNumber, {
              grNumber: primaryStudent.grNumber,
              studentName: primaryStudent.fullName,
              className: primaryStudent.className,
              matchReason: `Packet GR ${primaryStudent.grNumber} + Father verification`,
              confidence: 0.82,
            });
          }
        }

        siblingMatches = Array.from(matchedMap.values());
        linkedGrNumbers = siblingMatches.map((m) => m.grNumber);

        if (hasFamilyConflict) {
          status = 'flagged_misfiled';
          flagReason = `Misfiled B-Form: Father CNIC (${ocr.fatherCnic}) does not match folder GR ${primaryStudent.grNumber}'s father (${primaryStudent.fatherCnic}).`;
          flaggedCount += 1;
        } else if (linkedGrNumbers.length >= 2) {
          status = 'multi_sibling_linked';
          siblingLinksCreated += linkedGrNumbers.length;
        } else if (linkedGrNumbers.length === 1) {
          if (primaryStudent && linkedGrNumbers[0] !== primaryStudent.grNumber) {
            status = 'flagged_misfiled';
            flagReason = `B-Form child matches GR ${linkedGrNumbers[0]} (${siblingMatches[0].studentName}), but was placed inside GR ${primaryStudent.grNumber}'s folder.`;
            flaggedCount += 1;
          } else {
            status = 'linked';
          }
        } else {
          status = 'flagged_ambiguous';
          flagReason =
            'Could not confidently match children listed on B-Form to enrolled Student Records.';
          flaggedCount += 1;
        }
      } else if (category === 'father_cnic') {
        // Father CNIC has no student name: resolve via Packet Father CNIC + Folder GR + Siblings
        const familyStudents =
          docFatherCnicDigits.length === 13
            ? students.filter((s) => normalizeCnicDigits(s.fatherCnic) === docFatherCnicDigits)
            : students.filter((s) => nameSimilarity(ocr.fatherName, s.fatherName) >= 0.75);

        const hasFamilyConflict =
          primaryStudent &&
          docFatherCnicDigits.length === 13 &&
          primaryFatherCnicDigits.length === 13 &&
          docFatherCnicDigits !== primaryFatherCnicDigits;

        if (hasFamilyConflict) {
          status = 'flagged_misfiled';
          flagReason = `Misfiled Father CNIC: Card belongs to ${ocr.fatherName || 'another guardian'} (${ocr.fatherCnic}), not GR ${primaryStudent.grNumber}'s father (${primaryStudent.fatherCnic}).`;
          siblingMatches = familyStudents.map((s) => ({
            grNumber: s.grNumber,
            studentName: s.fullName,
            className: s.className,
            matchReason: 'Matched Father CNIC in another household',
            confidence: 0.92,
          }));
          linkedGrNumbers = [];
          flaggedCount += 1;
        } else if (primaryStudent && (familyStudents.some((s) => s.grNumber === primaryStudent.grNumber) || nameSimilarity(ocr.fatherName, primaryStudent.fatherName) >= 0.6)) {
          // Verified against folder GR! Also surface sibling links if same household
          const targetStudents = familyStudents.length > 0 ? familyStudents : [primaryStudent];
          siblingMatches = targetStudents.map((s) => ({
            grNumber: s.grNumber,
            studentName: s.fullName,
            className: s.className,
            matchReason:
              s.grNumber === primaryStudent.grNumber
                ? `Primary folder GR ${s.grNumber} + Father CNIC verified`
                : `Sibling sharing Father CNIC (${s.className})`,
            confidence: 0.94,
          }));
          linkedGrNumbers = targetStudents.map((s) => s.grNumber);
          status = linkedGrNumbers.length > 1 ? 'multi_sibling_linked' : 'linked';
          if (linkedGrNumbers.length > 1) siblingLinksCreated += linkedGrNumbers.length;
        } else if (familyStudents.length > 0) {
          siblingMatches = familyStudents.map((s) => ({
            grNumber: s.grNumber,
            studentName: s.fullName,
            className: s.className,
            matchReason: 'Matched Father CNIC across Student Records',
            confidence: 0.88,
          }));
          linkedGrNumbers = familyStudents.map((s) => s.grNumber);
          status = linkedGrNumbers.length > 1 ? 'multi_sibling_linked' : 'linked';
        } else {
          status = 'flagged_ambiguous';
          flagReason = `Father CNIC (${ocr.fatherCnic || ocr.fatherName || 'unreadable'}) did not match any guardian in Student Records.`;
          flaggedCount += 1;
        }
      } else {
        // Marksheet, Admission Form, or Other individual document
        const extractedGr = ocr.grNumberDetected
          ? parseGrNumberFromText(ocr.grNumberDetected) || ocr.grNumberDetected.trim()
          : undefined;

        let matchedStudent: StudentRecord | undefined;
        let matchReason = '';
        let matchConfidence = 0;

        if (extractedGr) {
          matchedStudent = students.find((s) => s.grNumber === extractedGr);
          if (matchedStudent) {
            matchReason = `Printed GR ${matchedStudent.grNumber}`;
            matchConfidence = 0.97;
          }
        }

        if (!matchedStudent && ocr.studentName) {
          let bestScore = 0;
          for (const student of students) {
            let score = nameSimilarity(ocr.studentName, student.fullName) * 0.65;
            if (
              effectiveFatherCnicDigits.length === 13 &&
              normalizeCnicDigits(student.fatherCnic) === effectiveFatherCnicDigits
            ) {
              score += 0.25;
            } else if (nameSimilarity(effectiveFatherName, student.fatherName) >= 0.65) {
              score += 0.2;
            }
            if (
              ocr.className &&
              student.className.toLowerCase().includes(ocr.className.toLowerCase().replace(/class\s*/i, '').trim())
            ) {
              score += 0.12;
            }
            if (score > bestScore) {
              bestScore = score;
              matchedStudent = student;
            }
          }
          if (bestScore >= 0.58 && matchedStudent) {
            matchReason = `Name & packet context match (${Math.round(bestScore * 100)}%)`;
            matchConfidence = Math.min(0.96, Number(bestScore.toFixed(2)));
          } else {
            matchedStudent = undefined;
          }
        }

        if (matchedStudent && primaryStudent && matchedStudent.grNumber !== primaryStudent.grNumber) {
          status = 'flagged_misfiled';
          flagReason = `Misfiled ${category.replace('_', ' ')}: Document belongs to ${matchedStudent.fullName} (GR ${matchedStudent.grNumber}, ${matchedStudent.className}), but was found inside GR ${primaryStudent.grNumber}'s packet.`;
          siblingMatches = [
            {
              grNumber: matchedStudent.grNumber,
              studentName: matchedStudent.fullName,
              className: matchedStudent.className,
              matchReason,
              confidence: matchConfidence,
            },
          ];
          linkedGrNumbers = [];
          flaggedCount += 1;
        } else if (matchedStudent) {
          status = 'linked';
          linkedGrNumbers = [matchedStudent.grNumber];
          siblingMatches = [
            {
              grNumber: matchedStudent.grNumber,
              studentName: matchedStudent.fullName,
              className: matchedStudent.className,
              matchReason,
              confidence: matchConfidence,
            },
          ];
        } else if (primaryStudent && !ocr.studentName && !extractedGr) {
          status = 'linked';
          linkedGrNumbers = [primaryStudent.grNumber];
          siblingMatches = [
            {
              grNumber: primaryStudent.grNumber,
              studentName: primaryStudent.fullName,
              className: primaryStudent.className,
              matchReason: `Folder GR ${primaryStudent.grNumber} fallback link`,
              confidence: 0.72,
            },
          ];
        } else {
          status = 'flagged_ambiguous';
          flagReason = `Could not verify student identity for ${category.replace('_', ' ')} (${ocr.studentName || 'name unreadable'}).`;
          flaggedCount += 1;
        }
      }

      logs.push({
        id: `log_res_${docId}`,
        timestamp: now,
        packetId,
        documentId: docId,
        fileName: item.fileName,
        stage: 'packet_resolve',
        outcome:
          status === 'multi_sibling_linked'
            ? 'multi_sibling_linked'
            : status === 'linked'
              ? 'linked'
              : 'flagged',
        aiCostSaved: false,
        bytesSaved,
        durationMs: item.preClassification.processingMs,
        details:
          status === 'multi_sibling_linked'
            ? `Resolved ${category} across ${linkedGrNumbers.length} siblings: GR ${linkedGrNumbers.join(', ')}.`
            : status === 'linked'
              ? `Verified ${category} against Student GR ${linkedGrNumbers[0]}.`
              : flagReason || 'Flagged for Admin review.',
      });
    }

    documents.push({
      id: docId,
      packetId,
      source: item.source,
      driveFileId: item.driveFileId,
      folderName: item.folderName,
      fileName: item.fileName,
      pageIndex: item.pageIndex,
      totalPages: item.totalPages,
      mimeType: item.mimeType,
      category,
      colorMode: item.colorMode,
      originalBytes: item.originalBytes,
      optimizedBytes: item.optimizedBytes,
      width: item.width,
      height: item.height,
      imageUrl: `/api/files/${item.storedFileName}`,
      preClassification: item.preClassification,
      ocrSkipped: item.ocrSkipped,
      ocrData: item.ocrData,
      primaryFolderGr: parsedGrNumber,
      linkedGrNumbers,
      siblingMatches,
      status,
      flagReason,
      createdAt: now,
    });
  }

  const packet: BatchPacket = {
    id: packetId,
    folderName,
    driveFolderId,
    parsedGrNumber,
    primaryStudentName: primaryStudent?.fullName,
    packetClues: {
      fatherName: packetFatherName || undefined,
      fatherCnic: packetFatherCnic || undefined,
      childNames: Array.from(childNamesSet),
      detectedGrNumbers: Array.from(detectedGrSet),
    },
    documentIds: documents.map((d) => d.id),
    processedCount: documents.length,
    skippedPortraitCount,
    flaggedCount,
    siblingLinksCreated,
    status: flaggedCount > 0 ? 'needs_review' : 'completed',
    createdAt: now,
  };

  return { packet, documents, logs, updatedPortraitLinks };
}

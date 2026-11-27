import { normalizeGrKey } from '../identityNormalization';
import {
  computeStudentMarksheet,
  isHsscGrade,
  normalizeGradeLevel,
} from '../marksheet/calculations';
import { SUBJECT_LABELS } from '../marksheet/config';
import { SUBJECT_HEADER_ALIASES } from '../marksheet/importer';
import {
  loadMarksheetConfig,
  loadMarksheetEntries,
  makeMarkEntryKey,
  saveMarksheetEntries,
} from '../marksheet/storage';
import type {
  ComputedStudentMarksheet,
  MarksheetExamType,
  MarksheetGradeLevel,
  MarksheetRosterStudent,
  StudentMarkEntry,
  SubjectKey,
} from '../marksheet/types';
import { queueSheetSync, type PendingSyncEntry } from '../sheetSyncQueue';
import type { StudentRecord } from '../sheets/types';
import type { OmrScanResult } from './types';

function normSubj(raw: string): string {
  return String(raw || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Maps free-text curriculum or OMR QR subject strings (e.g. "Physics", "Pak Studies", "Computer Science")
 * to canonical Marksheet SubjectKey values.
 */
export function mapSubjectToMarksheetKey(
  rawSubject: string,
  gradeLevel: MarksheetGradeLevel = 'IX'
): SubjectKey | null {
  const norm = normSubj(rawSubject);
  if (!norm) return null;

  for (const [key, aliases] of Object.entries(SUBJECT_HEADER_ALIASES) as Array<[SubjectKey, string[]]>) {
    if (norm === normSubj(key)) return key;
    if (aliases.some((alias) => norm === alias || norm.includes(alias) || alias.includes(norm))) {
      if (key === 'islamicStudies' && (gradeLevel === 'X' || gradeLevel === 'XII')) {
        continue;
      }
      return key;
    }
  }
  return null;
}

export interface CommitOmrParams {
  scanResult: OmrScanResult;
  examType?: MarksheetExamType;
  subjectKey?: SubjectKey;
  gradeLevel?: MarksheetGradeLevel;
  rosterRecords?: StudentRecord[];
  forceOverwrite?: boolean;
  /** Optional explicit mark scale factor if OMR score should map onto exam maxMarks; defaults to raw 1-to-1 points clamped to maxMarks. */
  scaleToMaxMarks?: boolean;
}

export type CommitOmrOutcome =
  | {
      status: 'error';
      message: string;
    }
  | {
      status: 'conflict';
      resolvedGrNo: string;
      studentName: string;
      gradeLevel: MarksheetGradeLevel;
      examType: MarksheetExamType;
      subjectKey: SubjectKey;
      existingScore: number | 'A';
      proposedScore: number;
    }
  | {
      status: 'committed';
      resolvedGrNo: string;
      studentName: string;
      gradeLevel: MarksheetGradeLevel;
      examType: MarksheetExamType;
      subjectKey: SubjectKey;
      writtenScore: number;
      entry: StudentMarkEntry;
      computed: ComputedStudentMarksheet;
      queuedSync: PendingSyncEntry;
    };

export function commitOmrScanToMarksheet(params: CommitOmrParams): CommitOmrOutcome {
  const { scanResult, forceOverwrite = false, rosterRecords = [], scaleToMaxMarks = false } = params;

  const rawGr = String(scanResult.grNumber || '').trim();
  const targetGrKey = normalizeGrKey(rawGr);
  if (!targetGrKey) {
    return { status: 'error', message: 'GR Number is required before saving to marksheet.' };
  }

  const entries = loadMarksheetEntries();
  const examType: MarksheetExamType = params.examType || scanResult.qrPayload.ex || 'midterm';

  // Resolve matching student from roster records first, then existing marksheet entries
  const matchedRoster = rosterRecords.find((r) => normalizeGrKey(r.grNo) === targetGrKey);
  const existingEntryMatch = Object.values(entries).find(
    (e) => e.examType === examType && normalizeGrKey(e.grNo) === targetGrKey
  ) || Object.values(entries).find((e) => normalizeGrKey(e.grNo) === targetGrKey);

  const resolvedGrNo =
    String(matchedRoster?.grNo || existingEntryMatch?.grNo || rawGr).trim() || targetGrKey;

  const gradeLevel: MarksheetGradeLevel =
    params.gradeLevel ||
    normalizeGradeLevel(scanResult.classLevel) ||
    normalizeGradeLevel(matchedRoster?.currentClass) ||
    normalizeGradeLevel(existingEntryMatch?.currentClass) ||
    'IX';

  const subjectKey: SubjectKey | null =
    params.subjectKey || mapSubjectToMarksheetKey(scanResult.qrPayload.sub, gradeLevel);
  if (!subjectKey) {
    return {
      status: 'error',
      message: `Subject "${scanResult.qrPayload.sub}" does not match a marksheet column. Choose a target subject manually.`,
    };
  }

  const config = loadMarksheetConfig();
  const maxMarks = Number(config.subjectMaxMarks?.[examType]?.[gradeLevel]?.[subjectKey]) || 50;

  let proposedScore = Math.max(0, Math.round(scanResult.score));
  if (scaleToMaxMarks && scanResult.total > 0) {
    proposedScore = Math.round((scanResult.score / scanResult.total) * maxMarks);
  }
  proposedScore = Math.max(0, Math.min(maxMarks, proposedScore));

  const entryKey = makeMarkEntryKey(resolvedGrNo, examType);
  const priorEntry = entries[entryKey] || entries[makeMarkEntryKey(targetGrKey, examType)];
  const existingScore = priorEntry?.scores?.[subjectKey];

  const hasNonZeroConflict =
    (typeof existingScore === 'number' && Number.isFinite(existingScore) && existingScore > 0 && existingScore !== proposedScore) ||
    existingScore === 'A';

  const studentName =
    scanResult.studentName?.trim() ||
    matchedRoster?.studentName?.trim() ||
    priorEntry?.studentName?.trim() ||
    `Student ${resolvedGrNo}`;

  if (hasNonZeroConflict && !forceOverwrite) {
    return {
      status: 'conflict',
      resolvedGrNo,
      studentName,
      gradeLevel,
      examType,
      subjectKey,
      existingScore: existingScore as number | 'A',
      proposedScore,
    };
  }

  const optionalLanguage =
    subjectKey === 'urdu'
      ? 'Urdu'
      : subjectKey === 'sindhi'
        ? 'Sindhi'
        : priorEntry?.optionalLanguage || 'Sindhi';

  const optionalElective =
    isHsscGrade(gradeLevel)
      ? subjectKey === 'mathematics'
        ? 'Mathematics'
        : subjectKey === 'biology'
          ? 'Biology'
          : priorEntry?.optionalElective || 'Biology'
      : subjectKey === 'ict'
        ? 'ICT'
        : subjectKey === 'biology'
          ? 'Biology'
          : priorEntry?.optionalElective || 'Biology';

  const nextEntry: StudentMarkEntry = {
    grNo: resolvedGrNo,
    studentName,
    fatherName:
      scanResult.fatherName?.trim() ||
      matchedRoster?.fatherName?.trim() ||
      priorEntry?.fatherName ||
      '',
    currentClass: matchedRoster?.currentClass?.trim() || priorEntry?.currentClass || gradeLevel,
    section: matchedRoster?.section?.trim() || priorEntry?.section || '',
    gender: matchedRoster?.gender?.trim() || priorEntry?.gender || '',
    optionalLanguage,
    optionalElective,
    scores: {
      ...(priorEntry?.scores || {}),
      [subjectKey]: proposedScore,
    },
    daysPresent: priorEntry?.daysPresent ?? null,
    codeOfConduct: priorEntry?.codeOfConduct || 'Satisfactory',
    teacherRemarks: priorEntry?.teacherRemarks || '',
    examType,
    updatedAt: Date.now(),
  };

  const nextEntries = { ...entries, [entryKey]: nextEntry };
  saveMarksheetEntries(nextEntries);

  const rosterStudent: MarksheetRosterStudent = {
    grNo: resolvedGrNo,
    studentName: nextEntry.studentName,
    fatherName: nextEntry.fatherName || '',
    gradeLevel,
    currentClass: nextEntry.currentClass || gradeLevel,
    section: nextEntry.section || '',
    gender: nextEntry.gender || '',
    dob: '',
    status: matchedRoster?.status || 'Enrolled',
    fromSheet: Boolean(matchedRoster),
  };

  const computed = computeStudentMarksheet(rosterStudent, nextEntry, config, examType);

  const queuedSync = queueSheetSync({
    target: 'marksheet',
    scope: `${examType}::${resolvedGrNo}::${subjectKey}`,
    label: `OMR ${SUBJECT_LABELS[subjectKey]} (${resolvedGrNo}: ${proposedScore}/${maxMarks})`,
    payload: {
      grNo: resolvedGrNo,
      gradeLevel,
      examType,
      subjectKey,
      score: proposedScore,
    },
  });

  return {
    status: 'committed',
    resolvedGrNo,
    studentName: nextEntry.studentName,
    gradeLevel,
    examType,
    subjectKey,
    writtenScore: proposedScore,
    entry: nextEntry,
    computed,
    queuedSync,
  };
}

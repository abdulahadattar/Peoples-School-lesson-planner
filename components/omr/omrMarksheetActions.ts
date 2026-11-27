import { getCurrentUser } from '../../services/googleAuth';
import { SUBJECT_LABELS } from '../../services/marksheet/config';
import {
  mergePendingEditDelta,
  saveMarksheetPendingEdit,
  upsertLocalPendingEdit,
} from '../../services/marksheet/pendingEditsRepository';
import type { MarksheetExamType, MarksheetGradeLevel, SubjectKey } from '../../services/marksheet/types';
import {
  commitOmrScanToMarksheet,
  mapSubjectToMarksheetKey,
  type CommitOmrOutcome,
} from '../../services/omr/marksheetBridge';
import {
  markResultRowSynced,
  type ScannedStudentResultRow,
} from '../../services/omr/scanResultsStore';
import type { OmrScanResult } from '../../services/omr/types';
import type { StudentRecord } from '../../services/sheets/types';

export interface OmrMarksheetConflictState {
  mode: 'single' | 'batch';
  resolvedGrNo: string;
  studentName: string;
  gradeLevel: MarksheetGradeLevel;
  examType: MarksheetExamType;
  subjectKey: SubjectKey;
  existingScore: number | 'A';
  proposedScore: number;
  rowsSnapshot?: ScannedStudentResultRow[];
  answerKey?: string;
}

export interface PushSingleResultOutcome {
  status: 'error' | 'conflict' | 'committed';
  message?: string;
  conflict?: OmrMarksheetConflictState;
}

function recordPendingMarksheetEdit(
  committed: Extract<CommitOmrOutcome, { status: 'committed' }>,
): void {
  const user = getCurrentUser();
  const edit = mergePendingEditDelta(undefined, {
    grNo: committed.resolvedGrNo,
    studentName: committed.studentName,
    gradeLevel: committed.gradeLevel,
    examType: committed.examType,
    changedScores: { [committed.subjectKey]: committed.writtenScore },
    optionalLanguage: committed.entry.optionalLanguage,
    optionalElective: committed.entry.optionalElective,
    author: {
      uid: user?.uid || 'local',
      name: user?.displayName || 'OMR Scanner',
      email: user?.email || undefined,
    },
    nowMs: committed.entry.updatedAt,
  });
  upsertLocalPendingEdit(edit);
  if (user) {
    void saveMarksheetPendingEdit(edit).catch(() => {});
  }
}

export function pushActiveScanToMarksheet(params: {
  scanResult: OmrScanResult | null;
  grNumber: string;
  gradeLevel: MarksheetGradeLevel;
  effectiveScore: number;
  roster: StudentRecord[];
  examType: MarksheetExamType;
  forceOverwrite?: boolean;
}): PushSingleResultOutcome {
  const { scanResult, grNumber, gradeLevel, effectiveScore, roster, examType, forceOverwrite } =
    params;

  if (!scanResult || !grNumber.trim()) {
    return { status: 'error', message: 'Scan a sheet and enter a valid GR Number first.' };
  }

  const outcome = commitOmrScanToMarksheet({
    scanResult: {
      ...scanResult,
      grNumber: grNumber.trim(),
      classLevel: gradeLevel,
      score: effectiveScore,
    },
    examType,
    gradeLevel,
    rosterRecords: roster,
    forceOverwrite,
  });

  if (outcome.status === 'error') {
    return { status: 'error', message: outcome.message };
  }

  if (outcome.status === 'conflict') {
    return {
      status: 'conflict',
      conflict: {
        mode: 'single',
        resolvedGrNo: outcome.resolvedGrNo,
        studentName: outcome.studentName,
        gradeLevel: outcome.gradeLevel,
        examType: outcome.examType,
        subjectKey: outcome.subjectKey,
        existingScore: outcome.existingScore,
        proposedScore: outcome.proposedScore,
      },
    };
  }

  markResultRowSynced(scanResult.qrPayload.pid || 'general_omr', outcome.resolvedGrNo);
  recordPendingMarksheetEdit(outcome);

  return {
    status: 'committed',
    message: `Saved ${SUBJECT_LABELS[outcome.subjectKey]} (${outcome.writtenScore}) for ${outcome.studentName} (GR #${outcome.resolvedGrNo}) to ${examType} marksheet.`,
  };
}

export function pushBatchRowsToMarksheet(params: {
  rows: ScannedStudentResultRow[];
  roster: StudentRecord[];
  examType: MarksheetExamType;
  answerKey?: string;
  forceOverwrite?: boolean;
}): {
  committedCount: number;
  errorMessages: string[];
  firstConflict: OmrMarksheetConflictState | null;
} {
  const { rows, roster, examType, answerKey = '', forceOverwrite = false } = params;
  let committedCount = 0;
  const errorMessages: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row.syncedToMarksheet && !forceOverwrite) continue;

    const subjectKey = mapSubjectToMarksheetKey(row.subject, row.classLevel);
    if (!subjectKey) {
      errorMessages.push(`Subject "${row.subject}" has no marksheet column.`);
      continue;
    }

    const syntheticScan: OmrScanResult = {
      qrPayload: {
        v: 1,
        pid: row.testCode,
        cls: row.classLevel,
        sub: row.subject,
        n: row.total,
        key: answerKey,
        tf: row.testFrequency,
        ttl: row.title,
        ex: examType,
      },
      grNumber: row.grNo,
      studentName: row.studentName,
      fatherName: row.fatherName,
      classLevel: row.classLevel,
      rawAnswers: row.rawAnswers,
      flaggedQuestions: [],
      score: row.score,
      total: row.total,
      correctCount: row.correctCount,
      wrongCount: row.wrongCount,
      blankCount: row.blankCount,
      multiCount: row.multiCount,
      confidenceMap: row.rawAnswers.map(() => 1),
      fiducialsDetected: true,
      bubbleDetections: [],
    };

    const outcome = commitOmrScanToMarksheet({
      scanResult: syntheticScan,
      examType,
      gradeLevel: row.classLevel,
      subjectKey,
      rosterRecords: roster,
      forceOverwrite,
    });

    if (outcome.status === 'conflict') {
      return {
        committedCount,
        errorMessages,
        firstConflict: {
          mode: 'batch',
          resolvedGrNo: outcome.resolvedGrNo,
          studentName: outcome.studentName,
          gradeLevel: outcome.gradeLevel,
          examType: outcome.examType,
          subjectKey: outcome.subjectKey,
          existingScore: outcome.existingScore,
          proposedScore: outcome.proposedScore,
          rowsSnapshot: rows.slice(i),
          answerKey,
        },
      };
    }

    if (outcome.status === 'error') {
      errorMessages.push(outcome.message);
      continue;
    }

    markResultRowSynced(row.testCode, outcome.resolvedGrNo);
    recordPendingMarksheetEdit(outcome);
    committedCount++;
  }

  return { committedCount, errorMessages, firstConflict: null };
}

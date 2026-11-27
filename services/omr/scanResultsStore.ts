import { normalizeGrKey } from '../identityNormalization';
import { getGradeForPercentage, getPassThresholdPct, normalizeGradeLevel } from '../marksheet/calculations';
import { loadMarksheetConfig } from '../marksheet/storage';
import type { MarksheetExamType, MarksheetGradeLevel } from '../marksheet/types';
import type { StudentRecord } from '../sheets/types';
import { computeCompetitionRanks } from './classroomRanking';
import { getOmrTestByCode, todayIsoDate } from './testRegistry';
import type { ClassroomTestFrequency, OmrDetectedMark, OmrScanResult } from './types';

export interface ScannedStudentResultRow {
  id: string;
  testCode: string;
  testFrequency: ClassroomTestFrequency;
  testNumber: string;
  testDate: string;
  subject: string;
  classLevel: MarksheetGradeLevel;
  title: string;
  examType?: MarksheetExamType;
  grNo: string;
  studentName: string;
  fatherName: string;
  section: string;
  score: number;
  total: number;
  percentage: number;
  rank?: number;
  grade: string;
  correctCount: number;
  wrongCount: number;
  blankCount: number;
  multiCount: number;
  rawAnswers: OmrDetectedMark[];
  scannedAt: number;
  syncedToMarksheet: boolean;
}

export interface PrintableClassResultSummary {
  testCode: string;
  testFrequency: ClassroomTestFrequency;
  testNumber: string;
  testDate: string;
  subject: string;
  classLevel: MarksheetGradeLevel;
  title: string;
  examType?: MarksheetExamType;
  totalMarks: number;
  scannedCount: number;
  enrolledCount: number;
  highestScore: number;
  averageScore: number;
  averagePercentage: number;
  passCount: number;
  passRate: number;
  rows: ScannedStudentResultRow[];
}

const SCAN_RESULTS_STORAGE_KEY = 'phssj_omr_scan_results_v1';

function readResultsMap(): Record<string, ScannedStudentResultRow[]> {
  try {
    if (typeof localStorage === 'undefined') return {};
    const raw = localStorage.getItem(SCAN_RESULTS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object'
      ? (parsed as Record<string, ScannedStudentResultRow[]>)
      : {};
  } catch {
    return {};
  }
}

function writeResultsMap(map: Record<string, ScannedStudentResultRow[]>): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(SCAN_RESULTS_STORAGE_KEY, JSON.stringify(map));
  } catch (err) {
    console.warn('Failed to persist scanned OMR result list:', err);
  }
}

export function resolveStudentFromRoster(
  grNo: string,
  roster: StudentRecord[]
): StudentRecord | null {
  const key = normalizeGrKey(grNo);
  if (!key) return null;
  return roster.find((r) => normalizeGrKey(r.grNo) === key) || null;
}

export function upsertScannedResultRow(params: {
  scanResult: OmrScanResult;
  grNoOverride?: string;
  effectiveAnswers?: OmrDetectedMark[];
  rosterRecords?: StudentRecord[];
  testNumberOverride?: string;
  testDateOverride?: string;
  syncedToMarksheet?: boolean;
}): ScannedStudentResultRow | null {
  const { scanResult, rosterRecords = [], syncedToMarksheet = false } = params;
  const rawGr = String(params.grNoOverride ?? scanResult.grNumber ?? '').trim();
  const grKey = normalizeGrKey(rawGr);
  if (!grKey) return null;

  const matchedRoster = resolveStudentFromRoster(rawGr, rosterRecords);
  const resolvedGrNo = String(matchedRoster?.grNo || rawGr).trim() || grKey;

  const testCode = scanResult.qrPayload.pid || 'general_omr';
  const regTest = getOmrTestByCode(testCode);

  const answers = params.effectiveAnswers ?? scanResult.rawAnswers;
  const key = regTest?.answerKey || scanResult.qrPayload.key;
  let score = 0;
  let correctCount = 0;
  let wrongCount = 0;
  let blankCount = 0;
  let multiCount = 0;

  answers.forEach((mark, idx) => {
    if (mark === 'BLANK') blankCount++;
    else if (mark === 'MULTI') multiCount++;
    else if (mark === key[idx]) {
      score++;
      correctCount++;
    } else {
      wrongCount++;
    }
  });

  const total = Math.max(1, scanResult.total);
  const pct = total > 0 ? Number(((score / total) * 100).toFixed(1)) : 0;
  const cfg = loadMarksheetConfig();
  const { grade } = getGradeForPercentage(pct, cfg.activeGradingSystem);

  const classLevel: MarksheetGradeLevel =
    normalizeGradeLevel(regTest?.classLevel) ||
    normalizeGradeLevel(scanResult.classLevel) ||
    normalizeGradeLevel(matchedRoster?.currentClass) ||
    'IX';

  const testFrequency: ClassroomTestFrequency =
    regTest?.testFrequency === 'monthly' || scanResult.qrPayload.tf === 'monthly'
      ? 'monthly'
      : 'weekly';

  const row: ScannedStudentResultRow = {
    id: `${testCode}::${grKey}`,
    testCode,
    testFrequency,
    testNumber: params.testNumberOverride?.trim() || regTest?.testNumber || 'Test #01',
    testDate: params.testDateOverride?.trim() || regTest?.testDate || todayIsoDate(),
    subject: regTest?.subject || scanResult.qrPayload.sub || 'General',
    classLevel,
    title: regTest?.title || scanResult.qrPayload.ttl || `${scanResult.qrPayload.sub} Classroom Test`,
    examType: regTest?.examType || scanResult.qrPayload.ex,
    grNo: resolvedGrNo,
    studentName:
      matchedRoster?.studentName?.trim() ||
      scanResult.studentName?.trim() ||
      `Student ${resolvedGrNo}`,
    fatherName:
      matchedRoster?.fatherName?.trim() ||
      scanResult.fatherName?.trim() ||
      '',
    section: matchedRoster?.section?.trim() || '',
    score,
    total,
    percentage: Number(pct.toFixed(1)),
    grade,
    correctCount,
    wrongCount,
    blankCount,
    multiCount,
    rawAnswers: [...answers],
    scannedAt: Date.now(),
    syncedToMarksheet,
  };

  const map = readResultsMap();
  const existing = map[testCode] || [];
  const next = existing.filter((r) => normalizeGrKey(r.grNo) !== grKey);
  next.push(row);
  const ranked = computeCompetitionRanks(next);
  map[testCode] = ranked;
  writeResultsMap(map);

  if (typeof window !== 'undefined') {
    void import('./classroomFirestore')
      .then((m) => m.syncClassroomResultToFirestore(row))
      .catch(() => {});
  }

  return ranked.find((r) => normalizeGrKey(r.grNo) === grKey) || row;
}

export function mergeSyncedResultsForTest(
  testCode: string,
  remoteRows: ScannedStudentResultRow[]
): ScannedStudentResultRow[] {
  const map = readResultsMap();
  const merged = new Map<string, ScannedStudentResultRow>();
  for (const local of map[testCode] || []) {
    merged.set(normalizeGrKey(local.grNo), local);
  }
  for (const remote of remoteRows) {
    const key = normalizeGrKey(remote.grNo);
    const prev = merged.get(key);
    if (!prev || remote.scannedAt >= prev.scannedAt) {
      merged.set(key, remote);
    }
  }
  const ranked = computeCompetitionRanks(Array.from(merged.values()));
  map[testCode] = ranked;
  writeResultsMap(map);
  return ranked;
}

export function markResultRowSynced(testCode: string, grNo: string): void {
  const key = normalizeGrKey(grNo);
  const map = readResultsMap();
  const list = map[testCode];
  if (!list) return;
  map[testCode] = list.map((row) =>
    normalizeGrKey(row.grNo) === key ? { ...row, syncedToMarksheet: true } : row
  );
  writeResultsMap(map);
}

export function listScannedResultsByTest(testCode: string): ScannedStudentResultRow[] {
  const map = readResultsMap();
  return computeCompetitionRanks(map[testCode] || []);
}

export function listScannedTestCodes(): Array<{
  testCode: string;
  testFrequency: ClassroomTestFrequency;
  count: number;
  subject: string;
  classLevel: MarksheetGradeLevel;
  testNumber: string;
  testDate: string;
  title: string;
  latestScanAt: number;
}> {
  const map = readResultsMap();
  return Object.entries(map)
    .filter(([, rows]) => rows.length > 0)
    .map(([testCode, rows]) => {
      const sample = rows[rows.length - 1];
      const latestScanAt = rows.reduce((m, r) => Math.max(m, r.scannedAt), 0);
      const testFrequency: ClassroomTestFrequency =
        sample.testFrequency === 'monthly' ? 'monthly' : 'weekly';
      return {
        testCode,
        testFrequency,
        count: rows.length,
        subject: sample.subject,
        classLevel: sample.classLevel,
        testNumber: sample.testNumber,
        testDate: sample.testDate,
        title: sample.title,
        latestScanAt,
      };
    })
    .sort((a, b) => b.latestScanAt - a.latestScanAt);
}

export function removeScannedResultRow(testCode: string, grNo: string): void {
  const key = normalizeGrKey(grNo);
  const map = readResultsMap();
  if (!map[testCode]) return;
  map[testCode] = computeCompetitionRanks(
    map[testCode].filter((r) => normalizeGrKey(r.grNo) !== key)
  );
  writeResultsMap(map);

  if (typeof window !== 'undefined') {
    void import('./classroomFirestore')
      .then((m) => m.deleteClassroomResultFromFirestore(testCode, grNo))
      .catch(() => {});
  }
}

export function clearScannedResultsForTest(testCode: string): void {
  const map = readResultsMap();
  delete map[testCode];
  writeResultsMap(map);
}

export function buildPrintableResultSummary(params: {
  testCode: string;
  rows: ScannedStudentResultRow[];
  rosterRecords?: StudentRecord[];
  fallbackSubject?: string;
  fallbackClassLevel?: MarksheetGradeLevel;
  fallbackTestFrequency?: ClassroomTestFrequency;
  fallbackTestNumber?: string;
  fallbackTestDate?: string;
  fallbackTitle?: string;
  fallbackTotalMarks?: number;
  fallbackExamType?: MarksheetExamType;
}): PrintableClassResultSummary {
  const { testCode, rows, rosterRecords = [] } = params;
  const reg = getOmrTestByCode(testCode);
  const firstRow = rows[0];
  const rankedRows = computeCompetitionRanks(rows);

  const classLevel: MarksheetGradeLevel =
    normalizeGradeLevel(reg?.classLevel) ||
    firstRow?.classLevel ||
    params.fallbackClassLevel ||
    'IX';

  const testFrequency: ClassroomTestFrequency =
    reg?.testFrequency === 'monthly' ||
    firstRow?.testFrequency === 'monthly' ||
    params.fallbackTestFrequency === 'monthly'
      ? 'monthly'
      : 'weekly';

  const enrolledCount = rosterRecords.filter(
    (r) =>
      normalizeGradeLevel(r.currentClass) === classLevel &&
      !(r.status || '').toLowerCase().includes('drop') &&
      !(r.status || '').toLowerCase().includes('left')
  ).length;

  const totalMarks = firstRow?.total || reg?.questionCount || params.fallbackTotalMarks || 30;
  const scannedCount = rankedRows.length;
  const highestScore = rankedRows.reduce((max, r) => Math.max(max, r.score), 0);
  const sumScore = rankedRows.reduce((sum, r) => sum + r.score, 0);
  const averageScore = scannedCount > 0 ? Number((sumScore / scannedCount).toFixed(1)) : 0;
  const averagePercentage =
    scannedCount > 0 && totalMarks > 0
      ? Number(((averageScore / totalMarks) * 100).toFixed(1))
      : 0;
  const cfg = loadMarksheetConfig();
  const passThreshold = getPassThresholdPct(cfg.activeGradingSystem);
  const passCount = rankedRows.filter((r) => Math.round(r.percentage) >= passThreshold).length;
  const passRate = scannedCount > 0 ? Math.round((passCount / scannedCount) * 100) : 0;

  return {
    testCode,
    testFrequency,
    testNumber: reg?.testNumber || firstRow?.testNumber || params.fallbackTestNumber || 'Test #01',
    testDate: reg?.testDate || firstRow?.testDate || params.fallbackTestDate || todayIsoDate(),
    subject: reg?.subject || firstRow?.subject || params.fallbackSubject || 'General',
    classLevel,
    title: reg?.title || firstRow?.title || params.fallbackTitle || 'Classroom MCQ Test Result',
    examType: reg?.examType || firstRow?.examType || params.fallbackExamType,
    totalMarks,
    scannedCount,
    enrolledCount,
    highestScore,
    averageScore,
    averagePercentage,
    passCount,
    passRate,
    rows: rankedRows,
  };
}

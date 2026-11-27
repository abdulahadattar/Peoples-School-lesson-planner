import type { GeneratedPaper } from '../../types';
import { normalizeGradeLevel } from '../marksheet/calculations';
import type { MarksheetExamType } from '../marksheet/types';
import { extractPaperOmrData } from './omrPdfGenerator';
import { type ClassroomTestFrequency, normalizeAnswerKeyString } from './types';

export interface OmrTestRecord {
  /** Short unique test code encoded into the QR `pid` and printed on paper/OMR sheet. */
  testCode: string;
  savedPaperId?: string;
  title: string;
  subject: string;
  classLevel: string;
  testFrequency?: ClassroomTestFrequency;
  testNumber: string;
  testDate: string; // YYYY-MM-DD
  examType?: MarksheetExamType;
  questionCount: number;
  answerKey: string;
  paperSnapshot?: GeneratedPaper;
  createdAt: number;
  updatedAt: number;
}

const TEST_REGISTRY_STORAGE_KEY = 'phssj_omr_test_registry_v1';

export function todayIsoDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function isMcqOnlyPaper(paper: GeneratedPaper): boolean {
  const allQuestions = paper.sections.flatMap((sec) => sec.questions || []);
  if (allQuestions.length === 0) return false;
  return allQuestions.every(
    (q) => q.type === 'mcq' || (Array.isArray(q.options) && q.options.length > 0)
  );
}

export function generateTestCode(
  subject: string,
  classLevel: string,
  testNumber?: string,
  nonceSeed?: string
): string {
  const subTag =
    String(subject || 'SUB')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 3) || 'SUB';
  const gradeTag = normalizeGradeLevel(classLevel) || 'IX';
  const numTag =
    String(testNumber || 'T01')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 4) || 'T01';
  const randomSuffix =
    nonceSeed ||
    Math.random()
      .toString(36)
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 4)
      .padEnd(4, 'X');
  return `${subTag}${gradeTag}-${numTag}-${randomSuffix}`.slice(0, 20);
}

export function suggestNextTestNumber(subject: string, classLevel: string): string {
  const normSub = String(subject || '').trim().toLowerCase();
  const normCls = normalizeGradeLevel(classLevel) || String(classLevel || '').trim();
  const existing = listOmrTests().filter(
    (t) =>
      t.subject.trim().toLowerCase() === normSub &&
      (normalizeGradeLevel(t.classLevel) || t.classLevel) === normCls
  );
  const nextIndex = existing.length + 1;
  return `Test #${String(nextIndex).padStart(2, '0')}`;
}

function readRegistryMap(): Record<string, OmrTestRecord> {
  try {
    if (typeof localStorage === 'undefined') return {};
    const raw = localStorage.getItem(TEST_REGISTRY_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, OmrTestRecord>) : {};
  } catch {
    return {};
  }
}

function writeRegistryMap(map: Record<string, OmrTestRecord>): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(TEST_REGISTRY_STORAGE_KEY, JSON.stringify(map));
  } catch (err) {
    console.warn('Failed to persist OMR test registry:', err);
  }
}

export function listOmrTests(): OmrTestRecord[] {
  const map = readRegistryMap();
  return Object.values(map).sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getOmrTestByCode(testCode: string | undefined | null): OmrTestRecord | null {
  if (!testCode) return null;
  const trimmed = String(testCode).trim();
  if (!trimmed) return null;
  const map = readRegistryMap();
  if (map[trimmed]) return map[trimmed];
  const lower = trimmed.toLowerCase();
  return (
    Object.values(map).find(
      (t) => t.testCode.toLowerCase() === lower || t.savedPaperId === trimmed
    ) || null
  );
}

export function saveOmrTestRecord(
  record: OmrTestRecord,
  options?: { skipRemoteSync?: boolean }
): OmrTestRecord {
  const map = readRegistryMap();
  const normalized: OmrTestRecord = {
    ...record,
    testFrequency: record.testFrequency === 'monthly' ? 'monthly' : 'weekly',
    answerKey: normalizeAnswerKeyString(record.answerKey, record.questionCount),
    updatedAt: record.updatedAt || Date.now(),
  };
  map[normalized.testCode] = normalized;
  writeRegistryMap(map);

  if (!options?.skipRemoteSync && typeof window !== 'undefined') {
    void import('./classroomFirestore')
      .then((m) => m.syncClassroomTestToFirestore(normalized, normalized.paperSnapshot))
      .catch(() => {});
  }

  return normalized;
}

export function mergeSyncedOmrTests(remote: OmrTestRecord[]): OmrTestRecord[] {
  const map = readRegistryMap();
  for (const r of remote) {
    if (!r?.testCode) continue;
    const prev = map[r.testCode];
    if (!prev || r.updatedAt >= prev.updatedAt) {
      map[r.testCode] = {
        ...prev,
        ...r,
        testFrequency: r.testFrequency === 'monthly' ? 'monthly' : 'weekly',
        answerKey: normalizeAnswerKeyString(r.answerKey, r.questionCount),
      };
    }
  }
  writeRegistryMap(map);
  return Object.values(map).sort((a, b) => b.updatedAt - a.updatedAt);
}

export function registerOmrTestFromPaper(
  paper: GeneratedPaper,
  overrides?: {
    testCode?: string;
    testNumber?: string;
    testDate?: string;
    testFrequency?: ClassroomTestFrequency;
    examType?: MarksheetExamType;
    paperSnapshot?: GeneratedPaper;
  }
): OmrTestRecord {
  const extracted = extractPaperOmrData(paper);
  const classLevel = normalizeGradeLevel(paper.gradeLevel) || extracted.classLevel || 'IX';
  const testFrequency: ClassroomTestFrequency =
    overrides?.testFrequency === 'monthly' || paper.omrMeta?.testFrequency === 'monthly'
      ? 'monthly'
      : 'weekly';
  const testNumber =
    overrides?.testNumber?.trim() ||
    paper.omrMeta?.testNumber?.trim() ||
    suggestNextTestNumber(extracted.subject, classLevel);
  const testDate =
    overrides?.testDate?.trim() || paper.omrMeta?.testDate?.trim() || todayIsoDate();
  const examType: MarksheetExamType =
    overrides?.examType || paper.omrMeta?.examType || 'midterm';
  const testCode =
    overrides?.testCode?.trim() ||
    paper.omrMeta?.testCode?.trim() ||
    generateTestCode(extracted.subject, classLevel, testNumber);

  const existing = getOmrTestByCode(testCode);
  const now = Date.now();
  const record: OmrTestRecord = {
    testCode,
    savedPaperId: paper.savedPaperId || existing?.savedPaperId,
    title: paper.title || extracted.title,
    subject: paper.subject || extracted.subject,
    classLevel,
    testFrequency,
    testNumber,
    testDate,
    examType,
    questionCount: extracted.questionCount,
    answerKey: normalizeAnswerKeyString(extracted.answerKey, extracted.questionCount),
    paperSnapshot: overrides?.paperSnapshot || paper,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  paper.omrMeta = {
    enabled: true,
    testCode: record.testCode,
    testFrequency: record.testFrequency,
    testNumber: record.testNumber,
    testDate: record.testDate,
    examType: record.examType,
  };

  return saveOmrTestRecord(record);
}

export function deleteOmrTestRecord(testCode: string): void {
  const map = readRegistryMap();
  if (map[testCode]) {
    delete map[testCode];
    writeRegistryMap(map);
  }
}

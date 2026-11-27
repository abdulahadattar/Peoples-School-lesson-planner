import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  setDoc,
  where,
} from 'firebase/firestore';
import type { GeneratedPaper } from '../../types';
import { normalizeGrKey } from '../identityNormalization';
import { normalizeGradeLevel } from '../marksheet/calculations';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import type { ScannedStudentResultRow } from './scanResultsStore';
import type { OmrTestRecord } from './testRegistry';

export function sanitizeFirestoreDocId(raw: string): string {
  const cleaned = String(raw || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return (cleaned || 'item').slice(0, 128);
}

export function buildClassroomResultDocId(testCode: string, grNo: string): string {
  const code = sanitizeFirestoreDocId(testCode);
  const gr = sanitizeFirestoreDocId(normalizeGrKey(grNo) || grNo);
  return `${code}__${gr}`.slice(0, 128);
}

function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefined(item)) as unknown as T;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) {
        out[k] = stripUndefined(v);
      }
    }
    return out as T;
  }
  return value;
}

export async function syncClassroomTestToFirestore(
  record: OmrTestRecord,
  paperSnapshot?: GeneratedPaper | null
): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) return;

  const docId = sanitizeFirestoreDocId(record.testCode);
  const payload = stripUndefined({
    testCode: docId,
    ...(record.savedPaperId ? { savedPaperId: String(record.savedPaperId).slice(0, 120) } : {}),
    title: String(record.title || 'Classroom MCQ Test').slice(0, 180),
    subject: String(record.subject || 'General').slice(0, 80),
    classLevel: String(record.classLevel || 'IX').slice(0, 24),
    testFrequency: record.testFrequency === 'monthly' ? 'monthly' : 'weekly',
    testNumber: String(record.testNumber || 'Test #01').slice(0, 48),
    testDate: String(record.testDate || '').slice(0, 24),
    questionCount: Math.max(1, Math.min(100, Math.round(Number(record.questionCount) || 30))),
    answerKey: String(record.answerKey || 'A')
      .toUpperCase()
      .replace(/[^A-D]/g, '')
      .slice(0, 100) || 'A',
    ...(paperSnapshot ? { paperSnapshot: stripUndefined(paperSnapshot) } : {}),
    createdAt: Math.round(Number(record.createdAt) || Date.now()),
    updatedAt: Math.round(Number(record.updatedAt) || Date.now()),
    updatedByUid: uid,
  });

  try {
    await setDoc(doc(db, 'classroom_tests', docId), payload, { merge: true });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `classroom_tests/${docId}`);
  }
}

export async function syncClassroomResultToFirestore(
  row: ScannedStudentResultRow
): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) return;

  const testCode = sanitizeFirestoreDocId(row.testCode);
  const resultId = buildClassroomResultDocId(testCode, row.grNo);
  const payload = stripUndefined({
    resultId,
    testCode,
    testNumber: String(row.testNumber || 'Test #01').slice(0, 48),
    testDate: String(row.testDate || '').slice(0, 24),
    testFrequency: row.testFrequency === 'monthly' ? 'monthly' : 'weekly',
    subject: String(row.subject || 'General').slice(0, 80),
    classLevel: String(row.classLevel || 'IX').slice(0, 24),
    title: String(row.title || 'Classroom MCQ Test').slice(0, 180),
    grNo: String(row.grNo || '').slice(0, 32),
    studentName: String(row.studentName || '').slice(0, 120),
    ...(row.fatherName ? { fatherName: String(row.fatherName).slice(0, 120) } : {}),
    ...(row.section ? { section: String(row.section).slice(0, 24) } : {}),
    score: Math.max(0, Math.min(100, Math.round(Number(row.score) || 0))),
    total: Math.max(1, Math.min(100, Math.round(Number(row.total) || 1))),
    percentage: Number(Number(row.percentage || 0).toFixed(1)),
    ...(row.grade ? { grade: String(row.grade).slice(0, 16) } : {}),
    correctCount: Math.max(0, Math.round(Number(row.correctCount) || 0)),
    wrongCount: Math.max(0, Math.round(Number(row.wrongCount) || 0)),
    blankCount: Math.max(0, Math.round(Number(row.blankCount) || 0)),
    multiCount: Math.max(0, Math.round(Number(row.multiCount) || 0)),
    rawAnswers: Array.isArray(row.rawAnswers) ? row.rawAnswers.slice(0, 100) : [],
    scannedAt: Math.round(Number(row.scannedAt) || Date.now()),
    scannedByUid: uid,
  });

  try {
    await setDoc(doc(db, 'classroom_omr_results', resultId), payload, { merge: true });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `classroom_omr_results/${resultId}`);
  }
}

export async function deleteClassroomResultFromFirestore(
  testCode: string,
  grNo: string
): Promise<void> {
  if (!auth.currentUser?.uid) return;
  const resultId = buildClassroomResultDocId(testCode, grNo);
  try {
    await deleteDoc(doc(db, 'classroom_omr_results', resultId));
  } catch (err) {
    console.warn('Unable to delete classroom_omr_results doc:', err);
  }
}

export async function fetchClassroomTestsFromFirestore(): Promise<OmrTestRecord[]> {
  try {
    const snap = await getDocs(collection(db, 'classroom_tests'));
    const out: OmrTestRecord[] = [];
    snap.forEach((docSnap) => {
      const d = docSnap.data() as Partial<OmrTestRecord> & { paperSnapshot?: GeneratedPaper };
      if (!d?.testCode || !d?.answerKey) return;
      out.push({
        testCode: d.testCode,
        savedPaperId: d.savedPaperId,
        title: d.title || 'Classroom MCQ Test',
        subject: d.subject || 'General',
        classLevel: d.classLevel || 'IX',
        testFrequency: d.testFrequency === 'monthly' ? 'monthly' : 'weekly',
        testNumber: d.testNumber || 'Test #01',
        testDate: d.testDate || '',
        questionCount: Number(d.questionCount) || d.answerKey.length,
        answerKey: d.answerKey,
        paperSnapshot: d.paperSnapshot,
        createdAt: Number(d.createdAt) || Date.now(),
        updatedAt: Number(d.updatedAt) || Date.now(),
      });
    });
    return out;
  } catch {
    return [];
  }
}

export async function fetchClassroomResultsFromFirestore(
  testCode: string
): Promise<ScannedStudentResultRow[]> {
  if (!testCode) return [];
  const safeCode = sanitizeFirestoreDocId(testCode);
  try {
    const q = query(
      collection(db, 'classroom_omr_results'),
      where('testCode', '==', safeCode)
    );
    const snap = await getDocs(q);
    const rows: ScannedStudentResultRow[] = [];
    snap.forEach((docSnap) => {
      const d = docSnap.data() as Record<string, any>;
      if (!d?.grNo) return;
      rows.push({
        id: `${d.testCode}::${normalizeGrKey(String(d.grNo))}`,
        testCode: String(d.testCode || safeCode),
        testNumber: String(d.testNumber || 'Test #01'),
        testDate: String(d.testDate || ''),
        testFrequency: d.testFrequency === 'monthly' ? 'monthly' : 'weekly',
        subject: String(d.subject || 'General'),
        classLevel: normalizeGradeLevel(String(d.classLevel || 'IX')) || 'IX',
        title: String(d.title || 'Classroom MCQ Test'),
        grNo: String(d.grNo),
        studentName: String(d.studentName || `Student ${d.grNo}`),
        fatherName: String(d.fatherName || ''),
        section: String(d.section || ''),
        score: Number(d.score) || 0,
        total: Number(d.total) || 30,
        percentage: Number(d.percentage) || 0,
        grade: String(d.grade || ''),
        correctCount: Number(d.correctCount) || 0,
        wrongCount: Number(d.wrongCount) || 0,
        blankCount: Number(d.blankCount) || 0,
        multiCount: Number(d.multiCount) || 0,
        rawAnswers: Array.isArray(d.rawAnswers) ? d.rawAnswers : [],
        scannedAt: Number(d.scannedAt) || Date.now(),
        syncedToMarksheet: false,
      });
    });
    return rows;
  } catch {
    return [];
  }
}

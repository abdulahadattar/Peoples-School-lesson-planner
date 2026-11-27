import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { GeneratedPaper } from '../../types';
import {
  CLASSROOM_MCQ_MIN,
  CLASSROOM_MCQ_MAX,
  clampClassroomMcqCount,
  computeCompetitionRanks,
  formatTestFrequencyLabel,
  formatTestFrequencyBadge,
} from '../../services/omr/classroomRanking';
import { encodeOmrQrPayload, decodeOmrQrPayload } from '../../services/omr/types';
import { renderSyntheticOmrImageData } from '../../services/omr/syntheticSheet';
import { gradeOmrImageData } from '../../services/omr/visionEngine';
import { registerOmrTestFromPaper } from '../../services/omr/testRegistry';
import {
  buildPrintableResultSummary,
  listScannedResultsByTest,
  upsertScannedResultRow,
} from '../../services/omr/scanResultsStore';
import {
  formatResultListCsv,
  generateTestResultListPdf,
} from '../../services/omr/resultListPdf';
import type { StudentRecord } from '../../services/sheets/types';

type Harness = {
  describe: (name: string) => void;
  itAsync: (name: string, fn: () => Promise<void> | void) => Promise<void>;
  eq: (actual: unknown, expected: unknown, msg?: string) => void;
};

function installMemoryLocalStorage() {
  const store = new Map<string, string>();
  const prev = (globalThis as any).localStorage;
  (globalThis as any).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => {
      store.set(k, String(v));
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => {
      store.clear();
    },
  };
  return () => {
    if (prev === undefined) delete (globalThis as any).localStorage;
    else (globalThis as any).localStorage = prev;
  };
}

function makeStudent(grNo: string, studentName: string, fatherName: string): StudentRecord {
  return {
    rowNumber: Number(grNo) || 1,
    grNo,
    studentName,
    bFormNo: '',
    fatherName,
    gender: 'Girl',
    dobDay: '1',
    dobMonth: '1',
    dobYear: '2011',
    classAdmitted: 'IX',
    currentClass: 'IX',
    parentCnic: '',
    religion: 'Islam',
    address: '',
    parentContact: '',
    emergencyContact: '',
    admissionDay: '1',
    admissionMonth: '4',
    admissionYear: '2025',
    section: 'A',
    partnerContact: '',
    shift: 'Morning',
    medium: 'English',
    picture: '',
    status: 'Enrolled',
  };
}

export async function runClassroomMcqOmrTests(h: Harness) {
  const { describe, itAsync, eq } = h;

  describe('omr.classroomMcqAndRanking');

  await itAsync('clamps classroom MCQ counts strictly to 30–50 and formats weekly/monthly labels', () => {
    eq(CLASSROOM_MCQ_MIN, 30);
    eq(CLASSROOM_MCQ_MAX, 50);
    eq(clampClassroomMcqCount(10), 30);
    eq(clampClassroomMcqCount(35), 35);
    eq(clampClassroomMcqCount(75), 50);
    eq(formatTestFrequencyLabel('weekly'), 'Weekly Class Test');
    eq(formatTestFrequencyLabel('monthly'), 'Monthly Class Test');
    eq(formatTestFrequencyBadge('weekly'), 'WEEKLY TEST');
    eq(formatTestFrequencyBadge('monthly'), 'MONTHLY TEST');
  });

  await itAsync('encodes and decodes tf (weekly/monthly) cleanly inside QR payloads', () => {
    const raw = encodeOmrQrPayload({
      v: 1,
      pid: 'BIOIX-T03',
      cls: 'IX',
      sub: 'Biology',
      n: 30,
      key: 'ABCD'.repeat(7) + 'AB',
      tf: 'monthly',
      ttl: 'Monthly Bio Quiz',
    });
    const decoded = decodeOmrQrPayload(raw);
    assert.ok(decoded);
    eq(decoded.tf, 'monthly');
    eq(decoded.pid, 'BIOIX-T03');
  });

  await itAsync('overrides QR answer key with lookupAnswerKey and builds competition-ranked Notice Board sheet', async () => {
    const restore = installMemoryLocalStorage();
    try {
      const authoritativeKey = 'ABCDABCDABCDABCDABCDABCDABCDAB'; // 30 answers
      const staleQrKey = 'DDDDDDDDDDDDDDDDDDDDDDDDDDDDDD';
      const testCode = 'BIOIX-CL30';

      const paper: GeneratedPaper = {
        title: 'Weekly Biology Cell Test',
        gradeLevel: 'Grade 9',
        subject: 'Biology',
        chapterName: 'Cells',
        totalMarks: 30,
        durationMinutes: 35,
        sections: [
          {
            title: 'Section A — Multiple Choice Questions',
            instruction: 'Choose the best option.',
            questions: authoritativeKey.split('').map((ans, idx) => ({
              id: `q_${idx + 1}`,
              type: 'mcq',
              question: `Bio MCQ #${idx + 1}`,
              options: ['A', 'B', 'C', 'D'],
              correctAnswer: ans,
              marks: 1,
            })),
          },
        ],
      };

      const record = registerOmrTestFromPaper(paper, {
        testCode,
        testNumber: 'Test #03',
        testDate: '2026-11-24',
        testFrequency: 'weekly',
        paperSnapshot: paper,
      });
      eq(record.questionCount, 30);
      eq(record.testFrequency, 'weekly');
      eq(Boolean(record.paperSnapshot), true);

      const roster = [
        makeStudent('0101', 'Amina Soomro', 'Rashid Ali'),
        makeStudent('0102', 'Sana Panhwar', 'Tariq Mahmood'),
        makeStudent('0103', 'Hina Laghari', 'Aslam Laghari'),
        makeStudent('0104', 'Noor Fatima', 'Bilal Memon'),
      ];

      // Student 1: 30/30, Student 2: 28/30, Student 3: 28/30, Student 4: 25/30
      const makeAnswers = (wrongCount: number) =>
        authoritativeKey.split('').map((l, idx) =>
          idx < wrongCount ? [('ABCD'.indexOf(l) + 1) % 4] : ['ABCD'.indexOf(l)]
        );

      const candidates = [
        { gr: '0101', wrong: 0 },
        { gr: '0102', wrong: 2 },
        { gr: '0103', wrong: 2 },
        { gr: '0104', wrong: 5 },
      ];

      for (const c of candidates) {
        const img = renderSyntheticOmrImageData({
          payload: {
            v: 1,
            pid: testCode,
            cls: 'IX',
            sub: 'Biology',
            n: 30,
            key: staleQrKey,
            gr: c.gr,
            tf: 'weekly',
            ttl: record.title,
          },
          answers: makeAnswers(c.wrong),
        });
        const graded = gradeOmrImageData(img, {
          lookupAnswerKey: (code) => (code === testCode ? authoritativeKey : null),
        });
        eq(graded.ok, true, 'error' in graded ? graded.error : '');
        if ('error' in graded) return;
        eq(graded.result.score, 30 - c.wrong, `GR ${c.gr} must use authoritative DB key`);

        upsertScannedResultRow({
          scanResult: graded.result,
          rosterRecords: roster,
        });
      }

      const rows = listScannedResultsByTest(testCode);
      const ranked = computeCompetitionRanks(rows);
      eq(ranked.map((r) => [r.grNo, r.score, r.rank]), [
        ['0101', 30, 1],
        ['0102', 28, 2],
        ['0103', 28, 2],
        ['0104', 25, 4],
      ]);

      const summary = buildPrintableResultSummary({
        testCode,
        rows,
        rosterRecords: roster,
      });
      eq(summary.testFrequency, 'weekly');
      const csv = formatResultListCsv(summary);
      eq(csv.includes('Rank,GR No,Student Name,Father Name,Obtained Marks,Total Marks,Percentage'), true);
      eq(csv.includes('2,0102,Sana Panhwar,Tariq Mahmood,28,30,93.3%'), true);

      const pdfBytes = await generateTestResultListPdf(summary);
      const pdfDoc = await PDFDocument.load(pdfBytes);
      eq(pdfDoc.getPageCount(), 1);
    } finally {
      restore();
    }
  });
}

const isDirect =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv.some((a) => a.includes('classroomMcqOmr.test'));

if (isDirect) {
  const { test, describe } = await import('node:test');
  await runClassroomMcqOmrTests({
    describe: (name) => {
      describe(name, () => {});
    },
    itAsync: async (name, fn) => {
      await test(name, fn);
    },
    eq: (a, b, m) => assert.deepStrictEqual(a, b, m),
  });
}

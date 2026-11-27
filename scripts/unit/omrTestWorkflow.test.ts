import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { GeneratedPaper } from '../../types';
import {
  formatAnswerKeyCsv,
  generateAnswerKeyPdf,
} from '../../services/omr/answerKeyPdf';
import {
  generateTestCode,
  getOmrTestByCode,
  isMcqOnlyPaper,
  listOmrTests,
  registerOmrTestFromPaper,
} from '../../services/omr/testRegistry';
import {
  buildPrintableResultSummary,
  listScannedResultsByTest,
  upsertScannedResultRow,
} from '../../services/omr/scanResultsStore';
import {
  formatResultListCsv,
  generateTestResultListPdf,
} from '../../services/omr/resultListPdf';
import { renderSyntheticOmrImageData } from '../../services/omr/syntheticSheet';
import { gradeOmrImageData } from '../../services/omr/visionEngine';
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

export async function runOmrTestWorkflowTests(h: Harness) {
  const { describe, itAsync, eq } = h;

  describe('omr.mcqTestWorkflow');

  await itAsync(
    'pairs MCQ-only paper -> testCode & answer key PDF -> scans multiple GR sheets -> builds printable result list & PDF',
    async () => {
      const restore = installMemoryLocalStorage();
      try {
        const key = 'ABCDABCDAB';
        const paper: GeneratedPaper = {
          title: 'Chapter 3 Dynamics Quiz',
          gradeLevel: 'Grade 9',
          subject: 'Physics',
          chapterName: 'Dynamics',
          totalMarks: 10,
          durationMinutes: 20,
          sections: [
            {
              title: 'Section A — Multiple Choice Questions',
              instruction: 'All questions are compulsory.',
              questions: key.split('').map((ans, idx) => ({
                id: `q_${idx + 1}`,
                type: 'mcq',
                question: `Dynamics MCQ #${idx + 1}`,
                options: ['Opt A', 'Opt B', 'Opt C', 'Opt D'],
                correctAnswer: ans,
                marks: 1,
              })),
            },
          ],
        };

        eq(isMcqOnlyPaper(paper), true);
        const testCode = generateTestCode('Physics', 'IX', 'Test #04', '7K9P');
        eq(testCode.startsWith('PHYIX-'), true);

        const reg = registerOmrTestFromPaper(paper, {
          testCode,
          testNumber: 'Test #04',
          testDate: '2026-11-19',
          examType: 'midterm',
        });

        eq(paper.omrMeta?.testCode, testCode);
        eq(reg.answerKey, key);
        eq(getOmrTestByCode(testCode)?.testNumber, 'Test #04');
        eq(listOmrTests().length, 1);

        // Answer Key PDF & CSV
        const keyPdfBytes = await generateAnswerKeyPdf({
          subject: reg.subject,
          classLevel: reg.classLevel,
          title: reg.title,
          testCode: reg.testCode,
          testNumber: reg.testNumber,
          testDate: reg.testDate,
          questionCount: reg.questionCount,
          answerKey: reg.answerKey,
        });
        const keyDoc = await PDFDocument.load(keyPdfBytes);
        eq(keyDoc.getPageCount(), 1);
        eq(formatAnswerKeyCsv({
          subject: reg.subject,
          classLevel: reg.classLevel,
          title: reg.title,
          testCode: reg.testCode,
          testNumber: reg.testNumber,
          testDate: reg.testDate,
          questionCount: reg.questionCount,
          answerKey: reg.answerKey,
        }).includes('10,B'), true);

        // Roster with leading zeros
        const roster = [
          makeStudent('0145', 'Aqsa Batool', 'Imdad Hussain Channa'),
          makeStudent('0146', 'Zainab Memon', 'Tariq Memon'),
        ];

        // Scan Student 1 (9/10)
        const s1Answers = key.split('').map((l, i) =>
          i === 0 ? [('ABCD'.indexOf(l) + 1) % 4] : ['ABCD'.indexOf(l)]
        );
        const img1 = renderSyntheticOmrImageData({
          payload: {
            v: 1,
            pid: testCode,
            cls: 'IX',
            sub: 'Physics',
            n: 10,
            key,
            gr: '0145',
            ex: 'midterm',
            ttl: reg.title,
          },
          answers: s1Answers,
          tiltDeg: 4,
        });
        const scan1 = gradeOmrImageData(img1);
        eq(scan1.ok, true, 'error' in scan1 ? scan1.error : '');
        if ('error' in scan1) return;

        const row1 = upsertScannedResultRow({
          scanResult: scan1.result,
          rosterRecords: roster,
        });
        assert.ok(row1);
        eq(row1.studentName, 'Aqsa Batool');
        eq(row1.fatherName, 'Imdad Hussain Channa');
        eq(row1.score, 9);
        eq(row1.testNumber, 'Test #04');
        eq(row1.testDate, '2026-11-19');

        // Scan Student 2 (10/10)
        const s2Answers = key.split('').map((l) => ['ABCD'.indexOf(l)]);
        const img2 = renderSyntheticOmrImageData({
          payload: {
            v: 1,
            pid: testCode,
            cls: 'IX',
            sub: 'Physics',
            n: 10,
            key,
            gr: '146', // without leading zero — still normalizes to 0146
            ex: 'midterm',
            ttl: reg.title,
          },
          answers: s2Answers,
        });
        const scan2 = gradeOmrImageData(img2);
        eq(scan2.ok, true);
        if ('error' in scan2) return;

        const row2 = upsertScannedResultRow({
          scanResult: scan2.result,
          rosterRecords: roster,
        });
        assert.ok(row2);
        eq(row2.grNo, '0146');
        eq(row2.studentName, 'Zainab Memon');
        eq(row2.fatherName, 'Tariq Memon');
        eq(row2.score, 10);

        const rows = listScannedResultsByTest(testCode);
        eq(rows.length, 2);

        const summary = buildPrintableResultSummary({
          testCode,
          rows,
          rosterRecords: roster,
        });
        eq(summary.subject, 'Physics');
        eq(summary.testNumber, 'Test #04');
        eq(summary.testDate, '2026-11-19');
        eq(summary.scannedCount, 2);
        eq(summary.highestScore, 10);
        eq(summary.averageScore, 9.5);
        eq(summary.passRate, 100);

        const csv = formatResultListCsv(summary);
        eq(csv.includes('Aqsa Batool'), true);
        eq(csv.includes('Imdad Hussain Channa'), true);
        eq(csv.includes('Zainab Memon'), true);

        const resultPdfBytes = await generateTestResultListPdf(summary);
        const resultPdfDoc = await PDFDocument.load(resultPdfBytes);
        eq(resultPdfDoc.getPageCount(), 1);
      } finally {
        restore();
      }
    }
  );
}

const isDirect =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv.some((a) => a.includes('omrTestWorkflow.test'));

if (isDirect) {
  const { test, describe } = await import('node:test');
  await runOmrTestWorkflowTests({
    describe: (name) => {
      describe(name, () => {});
    },
    itAsync: async (name, fn) => {
      await test(name, fn);
    },
    eq: (a, b, m) => assert.deepStrictEqual(a, b, m),
  });
}

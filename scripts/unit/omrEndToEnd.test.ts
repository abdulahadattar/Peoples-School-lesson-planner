import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { GeneratedPaper } from '../../types';
import { extractPaperOmrData, generateOmrPdf } from '../../services/omr/omrPdfGenerator';
import { renderSyntheticOmrImageData } from '../../services/omr/syntheticSheet';
import { gradeOmrImageData } from '../../services/omr/visionEngine';
import { commitOmrScanToMarksheet } from '../../services/omr/marksheetBridge';
import { computeStudentMarksheet } from '../../services/marksheet/calculations';
import { loadMarksheetConfig, loadMarksheetEntries, makeMarkEntryKey } from '../../services/marksheet/storage';
import { clearAllPendingSync, listPendingSync } from '../../services/sheetSyncQueue';
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

export async function runOmrEndToEndTests(h: Harness) {
  const { describe, itAsync, eq } = h;

  describe('omr.endToEnd.pipeline');

  await itAsync(
    'runs paper -> A4 OMR PDF -> synthetic optical scan -> teacher override -> Marksheet commit -> sync queue',
    async () => {
      const restore = installMemoryLocalStorage();
      try {
        clearAllPendingSync();

        const keyLetters = 'ABCDABCDABCDABCDABCD';
        const paper: GeneratedPaper = {
          savedPaperId: 'e2e_phy_ix_01',
          title: 'Grade IX Physics Mid-Term Assessment',
          gradeLevel: 'IX',
          subject: 'Physics',
          chapterName: 'Kinematics',
          totalMarks: 20,
          durationMinutes: 30,
          sections: [
            {
              title: 'Section A — Multiple Choice Questions',
              instruction: 'Shade one bubble per question.',
              questions: keyLetters.split('').map((ans, idx) => ({
                id: `q_${idx + 1}`,
                type: 'mcq',
                question: `Physics sample question ${idx + 1}`,
                options: ['Option A', 'Option B', 'Option C', 'Option D'],
                correctAnswer: ans,
                marks: 1,
              })),
            },
          ],
        };

        // Stage 1: Extract OMR metadata & generate 2-student Class Batch PDF
        const extracted = extractPaperOmrData(paper);
        eq(extracted.questionCount, 20);
        eq(extracted.answerKey, keyLetters);

        const batchStudents: StudentRecord[] = [
          {
            rowNumber: 10,
            grNo: '00912',
            studentName: 'Ayesha Siddiqui',
            bFormNo: '',
            fatherName: 'Tariq Siddiqui',
            gender: 'Girl',
            dobDay: '12',
            dobMonth: '4',
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
          },
          {
            rowNumber: 11,
            grNo: '00913',
            studentName: 'Bilal Rajput',
            bFormNo: '',
            fatherName: 'Asif Rajput',
            gender: 'Boy',
            dobDay: '2',
            dobMonth: '8',
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
          },
        ];

        const pdfBytes = await generateOmrPdf({
          paperId: extracted.paperId,
          title: extracted.title,
          subject: extracted.subject,
          classLevel: extracted.classLevel,
          questionCount: extracted.questionCount,
          answerKey: extracted.answerKey,
          examType: 'midterm',
          mode: 'batch',
          students: batchStudents,
        });

        const parsedPdf = await PDFDocument.load(pdfBytes);
        eq(parsedPdf.getPageCount(), 2, 'batch PDF must contain one page per student');

        // Stage 2: Simulate student GR 00912 answering 18 right, Q4 wrong, Q15 blank
        const simulatedBubbles = keyLetters.split('').map((ltr, idx) => {
          const correctIdx = 'ABCD'.indexOf(ltr);
          if (idx === 14) return []; // Q15 blank
          if (idx === 3) return [(correctIdx + 1) % 4]; // Q4 wrong
          return [correctIdx];
        });

        const img = renderSyntheticOmrImageData({
          payload: {
            v: 1,
            pid: extracted.paperId,
            cls: 'IX',
            sub: 'Physics',
            n: 20,
            key: extracted.answerKey,
            gr: '00912',
            ex: 'midterm',
            ttl: extracted.title,
          },
          answers: simulatedBubbles,
          tiltDeg: 7,
          perspectiveSkew: 0.025,
          brightnessGradient: 0.3,
        });

        const scanned = gradeOmrImageData(img);
        eq(scanned.ok, true, 'error' in scanned ? scanned.error : '');
        if ('error' in scanned) return;

        eq(scanned.result.grNumber, '00912');
        eq(scanned.result.score, 18);
        eq(scanned.result.blankCount, 1);
        eq(scanned.result.flaggedQuestions.includes(15), true);

        // Stage 3/4: Teacher inspects Q15 faint mark & overrides to correct key letter -> 19/20
        const overriddenAnswers = [...scanned.result.rawAnswers];
        overriddenAnswers[14] = keyLetters[14] as 'A' | 'B' | 'C' | 'D';
        const correctedScore = overriddenAnswers.reduce(
          (sum, mark, idx) => sum + (mark === keyLetters[idx] ? 1 : 0),
          0
        );
        eq(correctedScore, 19);

        const commit = commitOmrScanToMarksheet({
          scanResult: {
            ...scanned.result,
            rawAnswers: overriddenAnswers,
            score: correctedScore,
            correctCount: correctedScore,
            wrongCount: 1,
            blankCount: 0,
          },
          rosterRecords: batchStudents,
          examType: 'midterm',
          gradeLevel: 'IX',
        });

        eq(commit.status, 'committed');
        if (commit.status !== 'committed') return;

        eq(commit.resolvedGrNo, '00912');
        eq(commit.studentName, 'Ayesha Siddiqui');
        eq(commit.subjectKey, 'physics');
        eq(commit.writtenScore, 19);

        // Verify computed Marksheet aggregate totals & localStorage persistence
        const storedEntries = loadMarksheetEntries();
        const saved = storedEntries[makeMarkEntryKey('00912', 'midterm')];
        assert.ok(saved, 'marksheet entry must exist in localStorage');
        eq(saved.scores.physics, 19);

        const cfg = loadMarksheetConfig();
        const recomputed = computeStudentMarksheet(
          {
            grNo: '00912',
            studentName: 'Ayesha Siddiqui',
            fatherName: 'Tariq Siddiqui',
            gradeLevel: 'IX',
            currentClass: 'IX',
            section: 'A',
            gender: 'Girl',
            dob: '',
            status: 'Enrolled',
            fromSheet: true,
          },
          saved,
          cfg,
          'midterm'
        );
        eq(recomputed.totalObtainedMarks, 19);
        eq(recomputed.hasAnyScore, true);

        // Verify Sheets sync queue has the 'marksheet' delta queued
        const pending = listPendingSync();
        eq(pending.length, 1);
        eq(pending[0].target, 'marksheet');
        eq(pending[0].scope, 'midterm::00912::physics');
      } finally {
        restore();
      }
    }
  );
}

const isDirect =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv.some((a) => a.includes('omrEndToEnd.test'));

if (isDirect) {
  const { test, describe } = await import('node:test');
  await runOmrEndToEndTests({
    describe: (name) => {
      describe(name, () => {});
    },
    itAsync: async (name, fn) => {
      await test(name, fn);
    },
    eq: (a, b, m) => assert.deepStrictEqual(a, b, m),
  });
}

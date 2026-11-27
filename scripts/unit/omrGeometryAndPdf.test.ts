import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { computeOmrGeometry } from '../../services/omr/layoutGeometry';
import {
  decodeOmrQrPayload,
  encodeOmrQrPayload,
  normalizeAnswerKeyString,
  OmrQrPayload,
} from '../../services/omr/types';
import { generateOmrPdf, extractPaperOmrData } from '../../services/omr/omrPdfGenerator';
import type { GeneratedPaper } from '../../types';

type Harness = {
  describe: (name: string) => void;
  itAsync: (name: string, fn: () => Promise<void> | void) => Promise<void>;
  eq: (actual: unknown, expected: unknown, msg?: string) => void;
};

export async function runOmrGeometryAndPdfTests(h: Harness) {
  const { describe, itAsync, eq } = h;

  describe('omr.layoutGeometry');
  await itAsync('produces non-overlapping A4 coordinates within safe margins for (20, false) and (50, true)', () => {
    for (const [count, hasGrGrid] of [
      [20, false],
      [50, true],
      [100, true],
    ] as const) {
      const geo = computeOmrGeometry(count, hasGrGrid);
      eq(geo.questionCount, count);
      eq(geo.bubbles.length, count * 4);

      // Every bubble sits cleanly inside printable interior [20..190mm x, 40..274mm y]
      for (const b of geo.bubbles) {
        eq(b.cxMm - b.radiusMm >= 20, true, `bubble x out of margin: ${b.cxMm}`);
        eq(b.cxMm + b.radiusMm <= 190, true, `bubble x out of margin: ${b.cxMm}`);
        eq(b.cyMm - b.radiusMm >= 70, true, `bubble y too high: ${b.cyMm}`);
        eq(b.cyMm + b.radiusMm <= 274, true, `bubble y too low: ${b.cyMm}`);
      }

      // Pairwise minimum center-to-center distance > 2 * radius
      for (let i = 0; i < geo.bubbles.length; i++) {
        for (let j = i + 1; j < geo.bubbles.length; j++) {
          const a = geo.bubbles[i];
          const b = geo.bubbles[j];
          const dx = a.cxMm - b.cxMm;
          const dy = a.cyMm - b.cyMm;
          const dist = Math.hypot(dx, dy);
          eq(dist > a.radiusMm + b.radiusMm + 0.5, true, `bubbles overlap at ${i},${j}`);
        }
      }

      if (hasGrGrid) {
        eq(geo.grGrid.bubbles.length, 40);
        for (const gb of geo.grGrid.bubbles) {
          eq(gb.cxMm >= geo.grGrid.boxMm.xMm, true);
          eq(gb.cxMm <= geo.grGrid.boxMm.xMm + geo.grGrid.boxMm.wMm, true);
        }
      } else {
        eq(geo.grGrid.bubbles.length, 0);
      }
    }
  });

  describe('omr.qrPayloadRoundTrip');
  await itAsync('encodes and decodes OmrQrPayload deterministically', () => {
    const input: OmrQrPayload = {
      v: 1,
      pid: 'paper_midterm_ix_phy',
      cls: 'IX',
      sub: 'Physics',
      n: 20,
      key: normalizeAnswerKeyString('ABCDabcdABCDabcdABCD', 20),
      gr: '1042',
      ex: 'midterm',
      ttl: 'Midterm Physics IX',
    };
    const encoded = encodeOmrQrPayload(input);
    const decoded = decodeOmrQrPayload(encoded);
    eq(decoded?.pid, 'paper_midterm_ix_phy');
    eq(decoded?.cls, 'IX');
    eq(decoded?.sub, 'Physics');
    eq(decoded?.n, 20);
    eq(decoded?.key, 'ABCDABCDABCDABCDABCD');
    eq(decoded?.gr, '1042');
    eq(decoded?.ex, 'midterm');

    eq(decodeOmrQrPayload('not json'), null);
    eq(decodeOmrQrPayload('{"v":2}'), null);
  });

  describe('omr.extractPaperOmrData & generateOmrPdf');
  await itAsync('extracts MCQ answer keys and builds valid batch + blank PDFs with exact page counts', async () => {
    const fakePaper: GeneratedPaper = {
      savedPaperId: 'saved_123',
      title: 'Class IX Physics Midterm',
      gradeLevel: 'IX',
      subject: 'Physics',
      chapterName: 'Physical Quantities',
      totalMarks: 20,
      durationMinutes: 60,
      sections: [
        {
          title: 'Section A (MCQs)',
          instruction: 'Choose the correct option.',
          questions: [
            { id: 'q1', type: 'mcq', question: 'Unit of force?', options: ['N', 'J', 'W', 'Pa'], marks: 1, correctAnswer: 'A' },
            { id: 'q2', type: 'mcq', question: 'Unit of energy?', options: ['N', 'J', 'W', 'Pa'], marks: 1, correctAnswer: 'B' },
            { id: 'q3', type: 'mcq', question: 'Unit of power?', options: ['N', 'J', 'W', 'Pa'], marks: 1, correctAnswer: 'C' },
          ],
        },
      ],
    };

    const extracted = extractPaperOmrData(fakePaper);
    eq(extracted.questionCount, 3);
    eq(extracted.answerKey, 'ABC');

    // Batch PDF with 3 students -> 3 pages
    const batchBytes = await generateOmrPdf({
      ...extracted,
      examType: 'midterm',
      mode: 'batch',
      students: [
        { grNo: '1042', studentName: 'Ali Raza', fatherName: 'Ahmed Raza', currentClass: 'IX', section: 'A' },
        { grNo: '1043', studentName: 'Sana Khan', fatherName: 'Tariq Khan', currentClass: 'IX', section: 'A' },
        { grNo: '1044', studentName: 'Bilal Shah', fatherName: 'Aslam Shah', currentClass: 'IX', section: 'A' },
      ],
    });
    const batchHeader = Buffer.from(batchBytes.slice(0, 5)).toString('ascii');
    eq(batchHeader, '%PDF-');
    const batchDoc = await PDFDocument.load(batchBytes);
    eq(batchDoc.getPageCount(), 3);

    // Blank PDF -> 1 page
    const blankBytes = await generateOmrPdf({
      paperId: 'blank_test_1',
      title: 'Chemistry Test',
      subject: 'Chemistry',
      classLevel: 'X',
      questionCount: 50,
      answerKey: normalizeAnswerKeyString('ABCD', 50),
      examType: 'mock',
      mode: 'blank',
    });
    const blankHeader = Buffer.from(blankBytes.slice(0, 5)).toString('ascii');
    eq(blankHeader, '%PDF-');
    const blankDoc = await PDFDocument.load(blankBytes);
    eq(blankDoc.getPageCount(), 1);
  });
}

// Allow direct execution via `tsx --test scripts/unit/omrGeometryAndPdf.test.ts`
const isDirect =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv.some((a) => a.includes('omrGeometryAndPdf.test'));

if (isDirect) {
  const { test, describe } = await import('node:test');
  await runOmrGeometryAndPdfTests({
    describe: (name) => {
      describe(name, () => {});
    },
    itAsync: async (name, fn) => {
      test(name, async () => {
        await fn();
      });
    },
    eq: (a, b, m) => assert.deepStrictEqual(a, b, m),
  });
}

import assert from 'node:assert/strict';
import { computeHomography, applyHomography } from '../../services/omr/homography';
import { renderSyntheticOmrImageData } from '../../services/omr/syntheticSheet';
import { gradeOmrImageData } from '../../services/omr/visionEngine';
import { normalizeAnswerKeyString, OmrQrPayload } from '../../services/omr/types';

type Harness = {
  describe: (name: string) => void;
  it: (name: string, fn: () => void) => void;
  eq: (actual: unknown, expected: unknown, msg?: string) => void;
};

export async function runOmrVisionEngineTests(h: Harness) {
  const { describe, it, eq } = h;

  describe('omr.homography');
  it('recovers projective mapping between 4 reference corners accurately', () => {
    const src = [
      { x: 15, y: 15 },
      { x: 195, y: 15 },
      { x: 195, y: 282 },
      { x: 15, y: 282 },
    ] as const;
    const dst = [
      { x: 120, y: 80 },
      { x: 740, y: 110 },
      { x: 700, y: 1090 },
      { x: 95, y: 1050 },
    ] as const;
    const H = computeHomography(src, dst);
    eq(Boolean(H), true);
    for (let i = 0; i < 4; i++) {
      const mapped = applyHomography(H!, src[i]);
      eq(Math.abs(mapped.x - dst[i].x) < 0.01, true);
      eq(Math.abs(mapped.y - dst[i].y) < 0.01, true);
    }
  });

  describe('omr.visionEngine (clean sheet)');
  it('grades a clean 20-question synthetic sheet with 100% accuracy', () => {
    const key = normalizeAnswerKeyString('ABCDABCDABCDABCDABCD', 20);
    const payload: OmrQrPayload = {
      v: 1,
      pid: 'paper_clean_20',
      cls: 'IX',
      sub: 'Physics',
      n: 20,
      key,
      gr: '1042',
      ex: 'midterm',
    };
    // 17 right, 3 wrong (Q1, Q5, Q10 forced wrong)
    const answers = key.split('').map((ltr, idx) => {
      const correctIdx = 'ABCD'.indexOf(ltr);
      if (idx === 0 || idx === 4 || idx === 9) {
        return [(correctIdx + 1) % 4];
      }
      return [correctIdx];
    });

    const img = renderSyntheticOmrImageData({ payload, answers });
    const outcome = gradeOmrImageData(img);
    eq(outcome.ok, true, 'error' in outcome ? outcome.error : '');
    if ('error' in outcome) return;

    eq(outcome.result.fiducialsDetected, true);
    eq(outcome.result.grNumber, '1042');
    eq(outcome.result.score, 17);
    eq(outcome.result.correctCount, 17);
    eq(outcome.result.wrongCount, 3);
    eq(outcome.result.blankCount, 0);
    eq(outcome.result.multiCount, 0);
    eq(outcome.result.total, 20);
  });

  describe('omr.visionEngine (12 deg tilt + perspective skew + brightness gradient)');
  it('rectifies perspective & uneven illumination without losing any bubble accuracy', () => {
    const key = normalizeAnswerKeyString('DCBADCBADCBADCBADCBA', 20);
    const payload: OmrQrPayload = {
      v: 1,
      pid: 'paper_tilt_20',
      cls: 'X',
      sub: 'Chemistry',
      n: 20,
      key,
      gr: '1188',
      ex: 'mock',
    };
    const answers = key.split('').map((ltr, idx) => {
      const correctIdx = 'ABCD'.indexOf(ltr);
      // 18 right, 2 wrong
      return idx === 2 || idx === 17 ? [(correctIdx + 2) % 4] : [correctIdx];
    });

    const img = renderSyntheticOmrImageData({
      payload,
      answers,
      tiltDeg: 12,
      perspectiveSkew: 0.04,
      brightnessGradient: 0.45,
    });
    const outcome = gradeOmrImageData(img);
    eq(outcome.ok, true, 'error' in outcome ? outcome.error : '');
    if ('error' in outcome) return;

    eq(outcome.result.grNumber, '1188');
    eq(outcome.result.score, 18);
    eq(outcome.result.correctCount, 18);
    eq(outcome.result.wrongCount, 2);
  });

  describe('omr.visionEngine (edge cases: MULTI, BLANK, 4-digit GR bubbles, missing QR)');
  it('flags MULTI and BLANK questions for review and decodes Blank-mode 4-digit GR bubbles', () => {
    const key = normalizeAnswerKeyString('ABCDABCDABCDABCDABCD', 20);
    const payload: OmrQrPayload = {
      v: 1,
      pid: 'paper_blank_edge',
      cls: 'IX',
      sub: 'Biology',
      n: 20,
      key,
      // gr intentionally omitted -> Blank Template Mode with 4-digit GR bubble grid
    };
    const answers = key.split('').map((ltr, idx) => {
      if (idx === 1) return [0, 2]; // Q2 double-bubbled -> MULTI
      if (idx === 3) return []; // Q4 empty -> BLANK
      return ['ABCD'.indexOf(ltr)];
    });

    const img = renderSyntheticOmrImageData({
      payload,
      answers,
      grDigits: '0842',
    });
    const outcome = gradeOmrImageData(img);
    eq(outcome.ok, true, 'error' in outcome ? outcome.error : '');
    if ('error' in outcome) return;

    eq(outcome.result.grNumber, '0842');
    eq(outcome.result.rawAnswers[1], 'MULTI');
    eq(outcome.result.rawAnswers[3], 'BLANK');
    eq(outcome.result.multiCount, 1);
    eq(outcome.result.blankCount, 1);
    eq(outcome.result.score, 18);
    eq(outcome.result.flaggedQuestions.includes(2), true);
    eq(outcome.result.flaggedQuestions.includes(4), true);

    // Blank white noise frame fails safely
    const blankImg = {
      data: new Uint8ClampedArray(300 * 400 * 4).fill(240),
      width: 300,
      height: 400,
    };
    const failOutcome = gradeOmrImageData(blankImg);
    eq(failOutcome.ok, false);
  });
}

const isDirect =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv.some((a) => a.includes('omrVisionEngine.test'));

if (isDirect) {
  const { test, describe } = await import('node:test');
  await runOmrVisionEngineTests({
    describe: (name) => {
      describe(name, () => {});
    },
    it: (name, fn) => {
      test(name, fn);
    },
    eq: (a, b, m) => assert.deepStrictEqual(a, b, m),
  });
}

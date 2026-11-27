import { BatchScanController, computeFrameMetrics } from '../../services/omr/batchStateMachine';
import { renderSyntheticOmrImageData } from '../../services/omr/syntheticSheet';
import { gradeOmrImageData } from '../../services/omr/visionEngine';
import { OMR_ANSWER_LETTERS, normalizeAnswerKeyString } from '../../services/omr/types';

type Harness = {
  describe: (name: string) => void;
  it: (name: string, fn: () => void) => void;
  eq: (actual: unknown, expected: unknown, msg?: string) => void;
};

function makeCheckerboardRgba(width: number, height: number, phaseShift = 0, sharp = true): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const lum = sharp
        ? ((Math.floor((x + phaseShift) / 10) + Math.floor(y / 10)) % 2 === 0 ? 25 : 235)
        : 128;
      const p = (y * width + x) * 4;
      out[p] = lum;
      out[p + 1] = lum;
      out[p + 2] = lum;
      out[p + 3] = 255;
    }
  }
  return out;
}

export function runOmrBatchAndAccuracyTests(h: Harness) {
  const { describe, it, eq } = h;

  describe('omr.batchStateMachine');
  it('detects sharpness/motion and runs searching -> stabilizing -> captured -> waiting_for_swap -> searching lifecycle', () => {
    const controller = new BatchScanController({
      requiredStableFrames: 2,
      motionThreshold: 0.05,
      swapMotionThreshold: 0.08,
      minSharpness: 0.12,
      capturedHoldMs: 500,
      swapQuietFrames: 2,
    });

    const blurry = makeCheckerboardRgba(240, 240, 0, false);
    const s0 = controller.stepFrame(blurry, 240, 240, 100);
    eq(s0.shouldAttemptDecode, false);
    eq(s0.telemetry.phase, 'searching');

    const sheetA = makeCheckerboardRgba(240, 240, 0, true);
    const metricsA = computeFrameMetrics(sheetA, 240, 240, null);
    eq(metricsA.sharpnessScore > 0.3, true);

    // Frame 1 & Frame 2 steady -> ready to capture
    const f1 = controller.stepFrame(sheetA, 240, 240, 200);
    eq(f1.shouldAttemptDecode, false); // motionDelta vs blank=high on first frame
    const f2 = controller.stepFrame(sheetA, 240, 240, 400);
    eq(f2.shouldAttemptDecode, false); // 1st stable
    const f3 = controller.stepFrame(sheetA, 240, 240, 600);
    eq(f3.shouldAttemptDecode, true); // 2nd stable -> capture ready

    const cap = controller.recordDecodeResult({ ok: true, signature: 'test1::1042', grNumber: '1042' }, 610);
    eq(cap.accepted, true);
    eq(cap.telemetry.phase, 'captured');
    eq(cap.telemetry.batchCount, 1);

    // Holds captured state briefly, then enters waiting_for_swap
    const hold = controller.stepFrame(sheetA, 240, 240, 750);
    eq(hold.shouldAttemptDecode, false);
    eq(hold.telemetry.phase, 'captured');

    const wait1 = controller.stepFrame(sheetA, 240, 240, 1200);
    eq(wait1.shouldAttemptDecode, false);
    eq(wait1.telemetry.phase, 'waiting_for_swap');

    // Duplicate same sheet rejection even if manually recorded
    const dup = controller.recordDecodeResult({ ok: true, signature: 'test1::1042', grNumber: '1042' }, 1250);
    eq(dup.accepted, false);
    eq(dup.telemetry.batchCount, 1);

    // Simulate physical sheet swap (shifted pattern creates high motion delta), then settle on sheet B
    const sheetB = makeCheckerboardRgba(240, 240, 10, true);
    const swapMove = controller.stepFrame(sheetB, 240, 240, 1500);
    eq(swapMove.shouldAttemptDecode, false);
    eq(swapMove.telemetry.phase, 'waiting_for_swap');

    controller.stepFrame(sheetB, 240, 240, 1750); // quiet frame 1
    const settle2 = controller.stepFrame(sheetB, 240, 240, 2000); // quiet frame 2 -> ready
    eq(settle2.shouldAttemptDecode, true);

    const capB = controller.recordDecodeResult({ ok: true, signature: 'test1::1043', grNumber: '1043' }, 2010);
    eq(capB.accepted, true);
    eq(capB.telemetry.batchCount, 2);
  });

  describe('omr.highAccuracyMultiCountGrading');
  it('grades 30, 40, and 50 MCQ tilted/skewed/gradient synthetic sheets with 100% accuracy & exact GR grid recognition', () => {
    for (const qCount of [30, 40, 50] as const) {
      const key = normalizeAnswerKeyString('ABCDACBD', qCount);
      const answers = Array.from({ length: qCount }, (_, i) => [OMR_ANSWER_LETTERS.indexOf(key[i] as any)]);
      const img = renderSyntheticOmrImageData({
        payload: {
          v: 1,
          pid: `batch_test_${qCount}`,
          cls: 'X',
          sub: 'Chemistry',
          n: qCount,
          key,
          tf: 'weekly',
        },
        answers,
        grDigits: '3849',
        tiltDeg: 3.5,
        perspectiveSkew: 0.025,
        brightnessGradient: 0.3,
      });

      const outcome = gradeOmrImageData(img);
      eq(outcome.ok, true, `Failed grading ${qCount}-MCQ tilted sheet: ${'error' in outcome ? outcome.error : ''}`);
      if (outcome.ok) {
        eq(outcome.result.fiducialsDetected, true);
        eq(outcome.result.grNumber, '3849');
        eq(outcome.result.score, qCount, `Expected ${qCount}/${qCount}, got ${outcome.result.score}`);
        eq(outcome.result.flaggedQuestions.length, 0);
      }
    }
  });
}

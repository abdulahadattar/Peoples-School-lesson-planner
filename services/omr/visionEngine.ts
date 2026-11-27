import jsQR from 'jsqr';
import { applyHomography, computeHomography } from './homography';
import { computeOmrGeometry } from './layoutGeometry';
import {
  buildIntegralImage,
  detectFourCornerFiducials,
  toGrayscale,
} from './fiducialDetector';
import {
  OMR_ANSWER_LETTERS,
  OmrBubbleDetection,
  OmrDetectedMark,
  OmrQrPayload,
  OmrScanResult,
  Point2D,
  decodeOmrQrPayload,
  normalizeAnswerKeyString,
} from './types';

export interface ImageDataLike {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export interface OmrGradeOptions {
  /** Optional database/registry lookup returning the authoritative answer key for a QR `pid`. */
  lookupAnswerKey?: (testCode: string) => string | null | undefined;
}

export type OmrGradeOutcome =
  | { ok: true; result: OmrScanResult }
  | { ok: false; error: string };

const FILL_ABS_THRESHOLD = 0.34;
const LOW_CONFIDENCE_THRESHOLD = 0.45;

function sampleBubbleDarkness(
  gray: Uint8Array,
  width: number,
  height: number,
  px: number,
  py: number,
  rPx: number
): number {
  const safeR = Math.max(2.5, rPx);
  const coreR = safeR * 0.28;
  const innerR = safeR * 0.84;
  const annMinR = safeR * 1.55;
  const annMaxR = safeR * 2.55;

  const minX = Math.max(0, Math.floor(px - annMaxR));
  const maxX = Math.min(width - 1, Math.ceil(px + annMaxR));
  const minY = Math.max(0, Math.floor(py - annMaxR));
  const maxY = Math.min(height - 1, Math.ceil(py + annMaxR));

  let weightedInnerSum = 0;
  let weightTotal = 0;
  const annulusVals: number[] = [];

  for (let y = minY; y <= maxY; y++) {
    const dy = y - py;
    const rowOff = y * width;
    for (let x = minX; x <= maxX; x++) {
      const dx = x - px;
      const dist = Math.hypot(dx, dy);
      if (dist <= innerR) {
        // Lightly weight center core so faint printed letters (A/B/C/D or 0-9) don't inflate empty bubbles
        const w = dist <= coreR ? 0.22 : 1.0;
        weightedInnerSum += gray[rowOff + x] * w;
        weightTotal += w;
      } else if (dist >= annMinR && dist <= annMaxR) {
        annulusVals.push(gray[rowOff + x]);
      }
    }
  }

  if (weightTotal === 0 || annulusVals.length === 0) return 0;
  annulusVals.sort((a, b) => a - b);
  const localPaperWhite = annulusVals[Math.floor(annulusVals.length * 0.75)];
  const innerMean = weightedInnerSum / weightTotal;

  if (localPaperWhite <= 35) return 0;
  const raw = (localPaperWhite - innerMean) / localPaperWhite;
  return Math.max(0, Math.min(1, raw));
}

function buildContrastEnhancedRgba(
  gray: Uint8Array,
  integral: Float64Array,
  width: number,
  height: number
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height * 4);
  const stride = width + 1;
  const winR = Math.max(10, Math.round(Math.min(width, height) * 0.025));

  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - winR);
    const y1 = Math.min(height - 1, y + winR);
    const rowOff = y * width;
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - winR);
      const x1 = Math.min(width - 1, x + winR);
      const area = (x1 - x0 + 1) * (y1 - y0 + 1);
      const sum =
        integral[(y1 + 1) * stride + (x1 + 1)] -
        integral[y0 * stride + (x1 + 1)] -
        integral[(y1 + 1) * stride + x0] +
        integral[y0 * stride + x0];
      const mean = sum / Math.max(1, area);
      const v = gray[rowOff + x] < mean * 0.88 ? 0 : 255;
      const p = (rowOff + x) * 4;
      out[p] = v;
      out[p + 1] = v;
      out[p + 2] = v;
      out[p + 3] = 255;
    }
  }
  return out;
}

function buildUpscaledRgba(
  gray: Uint8Array,
  width: number,
  height: number,
  yMax: number,
  scale = 2
): { rgba: Uint8ClampedArray; w: number; h: number } {
  const srcH = Math.min(height, yMax);
  const w = width * scale;
  const h = srcH * scale;
  const rgba = new Uint8ClampedArray(w * h * 4);

  for (let y = 0; y < h; y++) {
    const sy = Math.min(srcH - 1.001, y / scale);
    const y0 = Math.floor(sy);
    const fy = sy - y0;
    for (let x = 0; x < w; x++) {
      const sx = Math.min(width - 1.001, x / scale);
      const x0 = Math.floor(sx);
      const fx = sx - x0;
      const p00 = gray[y0 * width + x0];
      const p10 = gray[y0 * width + x0 + 1];
      const p01 = gray[(y0 + 1) * width + x0];
      const p11 = gray[(y0 + 1) * width + x0 + 1];
      const v = Math.round(
        (p00 * (1 - fx) + p10 * fx) * (1 - fy) + (p01 * (1 - fx) + p11 * fx) * fy
      );
      const p = (y * w + x) * 4;
      rgba[p] = v;
      rgba[p + 1] = v;
      rgba[p + 2] = v;
      rgba[p + 3] = 255;
    }
  }
  return { rgba, w, h };
}

function detectQrWithFallback(
  data: Uint8ClampedArray,
  gray: Uint8Array,
  integral: Float64Array,
  width: number,
  height: number
): { data: string; corners: [Point2D, Point2D, Point2D, Point2D] } | null {
  let qr = jsQR(data, width, height, { inversionAttempts: 'attemptBoth' });
  if (qr && qr.data) {
    return {
      data: qr.data,
      corners: [
        qr.location.topLeftCorner,
        qr.location.topRightCorner,
        qr.location.bottomRightCorner,
        qr.location.bottomLeftCorner,
      ],
    };
  }

  const enhanced = buildContrastEnhancedRgba(gray, integral, width, height);
  qr = jsQR(enhanced, width, height, { inversionAttempts: 'attemptBoth' });
  if (qr && qr.data) {
    return {
      data: qr.data,
      corners: [
        qr.location.topLeftCorner,
        qr.location.topRightCorner,
        qr.location.bottomRightCorner,
        qr.location.bottomLeftCorner,
      ],
    };
  }

  // Fallback 3: 2x upscaled top half (helps tilted high-density Version 5-8 QRs)
  const scale = 2;
  const up = buildUpscaledRgba(gray, width, height, Math.ceil(height * 0.55), scale);
  qr = jsQR(up.rgba, up.w, up.h, { inversionAttempts: 'attemptBoth' });
  if (qr && qr.data) {
    return {
      data: qr.data,
      corners: [
        { x: qr.location.topLeftCorner.x / scale, y: qr.location.topLeftCorner.y / scale },
        { x: qr.location.topRightCorner.x / scale, y: qr.location.topRightCorner.y / scale },
        { x: qr.location.bottomRightCorner.x / scale, y: qr.location.bottomRightCorner.y / scale },
        { x: qr.location.bottomLeftCorner.x / scale, y: qr.location.bottomLeftCorner.y / scale },
      ],
    };
  }

  return null;
}

export function gradeOmrImageData(
  image: ImageDataLike,
  options?: OmrGradeOptions
): OmrGradeOutcome {
  const { data, width, height } = image;
  if (!data || width < 64 || height < 64) {
    return { ok: false, error: 'Image resolution is too small for OMR scanning.' };
  }

  const gray = toGrayscale(data, width, height);
  const integral = buildIntegralImage(gray, width, height);

  const qrHit = detectQrWithFallback(data, gray, integral, width, height);
  if (!qrHit) {
    return {
      ok: false,
      error: 'Could not read paper QR code. Hold camera steadier over the full OMR sheet.',
    };
  }

  const decodedPayload: OmrQrPayload | null = decodeOmrQrPayload(qrHit.data);
  if (!decodedPayload) {
    return {
      ok: false,
      error: 'QR code does not contain valid PHSSJ OMR exam metadata.',
    };
  }

  const dbKey = options?.lookupAnswerKey?.(decodedPayload.pid);
  const effectiveKey = dbKey
    ? normalizeAnswerKeyString(dbKey, decodedPayload.n)
    : decodedPayload.key;
  const payload: OmrQrPayload = {
    ...decodedPayload,
    key: effectiveKey,
  };

  const qrQuad: [Point2D, Point2D, Point2D, Point2D] = qrHit.corners;
  const qrTopPx = Math.hypot(qrQuad[1].x - qrQuad[0].x, qrQuad[1].y - qrQuad[0].y);
  const qrLeftPx = Math.hypot(qrQuad[3].x - qrQuad[0].x, qrQuad[3].y - qrQuad[0].y);
  const hasGrGrid = !payload.gr;
  const geo = computeOmrGeometry(payload.n, hasGrGrid);

  const pxPerMm = ((qrTopPx + qrLeftPx) * 0.5) / geo.qrBox.sizeMm;
  const expectedFidSidePx = Math.max(6, geo.fiducials.tl.sizeMm * pxPerMm);

  const fiducials = detectFourCornerFiducials(
    gray,
    integral,
    width,
    height,
    expectedFidSidePx,
    qrQuad
  );
  if (!fiducials) {
    return {
      ok: false,
      error:
        'Could not detect all 4 corner alignment squares. Ensure all 4 black corner fiducials are visible.',
    };
  }

  const H = computeHomography(
    [
      { x: geo.fiducials.tl.cxMm, y: geo.fiducials.tl.cyMm },
      { x: geo.fiducials.tr.cxMm, y: geo.fiducials.tr.cyMm },
      { x: geo.fiducials.br.cxMm, y: geo.fiducials.br.cyMm },
      { x: geo.fiducials.bl.cxMm, y: geo.fiducials.bl.cyMm },
    ],
    [fiducials.tl, fiducials.tr, fiducials.br, fiducials.bl]
  );

  if (!H) {
    return {
      ok: false,
      error: 'Corner alignment points were collinear; unable to rectify perspective.',
    };
  }

  // Decode GR number from QR or 4-digit GR bubble grid
  let resolvedGr = payload.gr ? payload.gr.trim() : '';
  if (!resolvedGr && geo.grGrid.enabled) {
    const digitsOut: string[] = [];
    for (let dIdx = 0; dIdx < geo.grGrid.digits; dIdx++) {
      const colBubbles = geo.grGrid.bubbles.filter((b) => b.digitIndex === dIdx);
      let bestDigit = '0';
      let bestDark = -1;
      for (const gb of colBubbles) {
        const centerPx = applyHomography(H, { x: gb.cxMm, y: gb.cyMm });
        const edgePx = applyHomography(H, { x: gb.cxMm + gb.radiusMm, y: gb.cyMm });
        const rPx = Math.hypot(edgePx.x - centerPx.x, edgePx.y - centerPx.y);
        const dark = sampleBubbleDarkness(gray, width, height, centerPx.x, centerPx.y, rPx);
        if (dark > bestDark) {
          bestDark = dark;
          bestDigit = String(gb.digit);
        }
      }
      digitsOut.push(bestDark >= FILL_ABS_THRESHOLD ? bestDigit : '0');
    }
    resolvedGr = digitsOut.join('');
  }

  const rawAnswers: OmrDetectedMark[] = [];
  const confidenceMap: number[] = [];
  const flaggedQuestions: number[] = [];
  const bubbleDetections: OmrBubbleDetection[] = [];

  let score = 0;
  let correctCount = 0;
  let wrongCount = 0;
  let blankCount = 0;
  let multiCount = 0;

  for (let qIdx = 0; qIdx < geo.questionCount; qIdx++) {
    const rowCoords = geo.bubbles.filter((b) => b.questionIndex === qIdx);
    const sampled = rowCoords.map((b) => {
      const centerPx = applyHomography(H, { x: b.cxMm, y: b.cyMm });
      const edgePx = applyHomography(H, { x: b.cxMm + b.radiusMm, y: b.cyMm });
      const rPx = Math.hypot(edgePx.x - centerPx.x, edgePx.y - centerPx.y);
      const darkness = sampleBubbleDarkness(gray, width, height, centerPx.x, centerPx.y, rPx);
      return { b, centerPx, rPx, darkness };
    });

    const sortedDark = [...sampled].sort((a, b) => b.darkness - a.darkness);
    const topDark = sortedDark[0]?.darkness ?? 0;
    const secondDark = sortedDark[1]?.darkness ?? 0;

    const filledFlags = sampled.map(
      (s) => s.darkness >= FILL_ABS_THRESHOLD && s.darkness >= topDark * 0.58
    );
    const filledCount = filledFlags.filter(Boolean).length;

    let mark: OmrDetectedMark;
    let confidence = 0.9;

    if (filledCount === 0) {
      mark = 'BLANK';
      blankCount++;
      confidence = topDark > 0.22 ? 0.35 : 0.85;
      flaggedQuestions.push(qIdx + 1);
    } else if (filledCount >= 2) {
      mark = 'MULTI';
      multiCount++;
      confidence = 0.25;
      flaggedQuestions.push(qIdx + 1);
    } else {
      const winnerIdx = filledFlags.findIndex(Boolean);
      mark = OMR_ANSWER_LETTERS[winnerIdx];
      confidence = Math.max(0, Math.min(1, (topDark - secondDark) / 0.42));
      if (confidence < LOW_CONFIDENCE_THRESHOLD) {
        flaggedQuestions.push(qIdx + 1);
      }
      if (mark === payload.key[qIdx]) {
        score++;
        correctCount++;
      } else {
        wrongCount++;
      }
    }

    rawAnswers.push(mark);
    confidenceMap.push(Number(confidence.toFixed(3)));

    sampled.forEach((s, idx) => {
      bubbleDetections.push({
        questionIndex: s.b.questionIndex,
        optionIndex: s.b.optionIndex,
        option: s.b.option,
        px: Number(s.centerPx.x.toFixed(1)),
        py: Number(s.centerPx.y.toFixed(1)),
        radiusPx: Number(s.rPx.toFixed(1)),
        darkness: Number(s.darkness.toFixed(3)),
        filled: filledFlags[idx],
      });
    });
  }

  return {
    ok: true,
    result: {
      grNumber: resolvedGr,
      classLevel: payload.cls,
      rawAnswers,
      score,
      total: geo.questionCount,
      correctCount,
      wrongCount,
      blankCount,
      multiCount,
      confidenceMap,
      flaggedQuestions,
      qrPayload: payload,
      fiducialsDetected: true,
      fiducialPointsPx: fiducials,
      qrCornersPx: {
        tl: qrQuad[0],
        tr: qrQuad[1],
        bl: qrQuad[3],
        br: qrQuad[2],
      },
      bubbleDetections,
    },
  };
}

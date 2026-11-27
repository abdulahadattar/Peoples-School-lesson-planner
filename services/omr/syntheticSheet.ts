import QRCode from 'qrcode';
import { A4_HEIGHT_MM, A4_WIDTH_MM, computeOmrGeometry } from './layoutGeometry';
import { OmrQrPayload, encodeOmrQrPayload } from './types';

export interface SyntheticOmrOptions {
  payload: OmrQrPayload;
  /** Array of option indices (e.g. [0], [1]) or multi-mark arrays (e.g. [0, 2]) or empty [] for blank. */
  answers: number[][];
  /** 4-digit string e.g. '0842' when payload.gr is omitted (Blank Template Mode). */
  grDigits?: string;
  /** Output image dimensions (default 840x1188 = 4 px/mm on A4). */
  width?: number;
  height?: number;
  /** Clockwise tilt in degrees around image center (for perspective/rotation resilience tests). */
  tiltDeg?: number;
  /** Slight projective trapezoid squeeze 0..0.08. */
  perspectiveSkew?: number;
  /** Uneven lighting intensity gradient amplitude (e.g. 0.45 dims left-to-right + top-to-bottom). */
  brightnessGradient?: number;
}

function drawExactRectPx(
  buf: Uint8Array,
  bw: number,
  bh: number,
  fx0: number,
  fy0: number,
  fx1: number,
  fy1: number,
  val: number
) {
  const x0 = Math.max(0, Math.round(fx0));
  const y0 = Math.max(0, Math.round(fy0));
  const x1 = Math.min(bw, Math.round(fx1));
  const y1 = Math.min(bh, Math.round(fy1));
  for (let y = y0; y < y1; y++) {
    const row = y * bw;
    for (let x = x0; x < x1; x++) {
      buf[row + x] = val;
    }
  }
}

function drawFilledRectMm(
  buf: Uint8Array,
  bw: number,
  bh: number,
  pxPerMm: number,
  xMm: number,
  yMm: number,
  wMm: number,
  hMm: number,
  val: number
) {
  drawExactRectPx(
    buf,
    bw,
    bh,
    xMm * pxPerMm,
    yMm * pxPerMm,
    (xMm + wMm) * pxPerMm,
    (yMm + hMm) * pxPerMm,
    val
  );
}

function drawCircleMm(
  buf: Uint8Array,
  bw: number,
  bh: number,
  pxPerMm: number,
  cxMm: number,
  cyMm: number,
  rMm: number,
  filled: boolean
) {
  const cx = cxMm * pxPerMm;
  const cy = cyMm * pxPerMm;
  const r = rMm * pxPerMm;
  const strokeHalf = Math.max(0.7, 0.28 * pxPerMm);
  const outer = r + strokeHalf;
  const inner = Math.max(0, r - strokeHalf);

  const x0 = Math.max(0, Math.floor(cx - outer - 1));
  const x1 = Math.min(bw - 1, Math.ceil(cx + outer + 1));
  const y0 = Math.max(0, Math.floor(cy - outer - 1));
  const y1 = Math.min(bh - 1, Math.ceil(cy + outer + 1));

  for (let y = y0; y <= y1; y++) {
    const row = y * bw;
    for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (filled && d <= r * 0.92) {
        buf[row + x] = 18;
      } else if (d >= inner && d <= outer) {
        buf[row + x] = 35;
      }
    }
  }
}

/**
 * Generates an ImageData-compatible synthetic OMR scan buffer in pure TypeScript.
 * Usable both by Node.js unit tests and by the browser "Load Sample Sheet" button.
 */
export function renderSyntheticOmrImageData(
  options: SyntheticOmrOptions
): { data: Uint8ClampedArray; width: number; height: number } {
  const basePxPerMm = 8;
  const bw = Math.round(A4_WIDTH_MM * basePxPerMm); // 1680
  const bh = Math.round(A4_HEIGHT_MM * basePxPerMm); // 2376

  const outW = options.width ?? Math.round(A4_WIDTH_MM * 5); // 1050
  const outH = options.height ?? Math.round(A4_HEIGHT_MM * 5); // 1485

  const baseGray = new Uint8Array(bw * bh);
  baseGray.fill(248);

  const hasGrGrid = !options.payload.gr;
  const geo = computeOmrGeometry(options.payload.n, hasGrGrid);

  // 1. 4 corner fiducial black squares
  for (const f of [geo.fiducials.tl, geo.fiducials.tr, geo.fiducials.bl, geo.fiducials.br]) {
    drawFilledRectMm(
      baseGray,
      bw,
      bh,
      basePxPerMm,
      f.cxMm - f.sizeMm / 2,
      f.cyMm - f.sizeMm / 2,
      f.sizeMm,
      f.sizeMm,
      10
    );
  }

  // 2. Crisp QR code in geo.qrBox (2-module quiet zone inside box, surrounded by white paper)
  const qr = QRCode.create(encodeOmrQrPayload(options.payload), { errorCorrectionLevel: 'M' });
  const mods = qr.modules.size;
  const quiet = 2;
  const totalMods = mods + quiet * 2;
  const qrOriginX = geo.qrBox.xMm * basePxPerMm;
  const qrOriginY = geo.qrBox.yMm * basePxPerMm;
  const modPx = (geo.qrBox.sizeMm * basePxPerMm) / totalMods;
  for (let r = 0; r < mods; r++) {
    for (let c = 0; c < mods; c++) {
      if (!qr.modules.get(r, c)) continue;
      const x0 = qrOriginX + (c + quiet) * modPx;
      const y0 = qrOriginY + (r + quiet) * modPx;
      drawExactRectPx(baseGray, bw, bh, x0, y0, x0 + modPx, y0 + modPx, 10);
    }
  }

  // 3. Optional 4-digit GR bubble grid
  if (hasGrGrid && geo.grGrid.enabled) {
    const grStr = String(options.grDigits || '0000')
      .replace(/\D/g, '')
      .padStart(4, '0')
      .slice(0, 4);
    for (const gb of geo.grGrid.bubbles) {
      const targetDigit = Number(grStr[gb.digitIndex]);
      drawCircleMm(
        baseGray,
        bw,
        bh,
        basePxPerMm,
        gb.cxMm,
        gb.cyMm,
        gb.radiusMm,
        gb.digit === targetDigit
      );
    }
  }

  // 4. MCQ Bubbles
  for (const b of geo.bubbles) {
    const chosen = options.answers[b.questionIndex] || [];
    const filled = chosen.includes(b.optionIndex);
    drawCircleMm(baseGray, bw, bh, basePxPerMm, b.cxMm, b.cyMm, b.radiusMm, filled);
  }

  // 5. Transform output (scale, tilt, perspective skew, and uneven lighting gradient)
  const tiltRad = ((options.tiltDeg ?? 0) * Math.PI) / 180;
  const cosA = Math.cos(tiltRad);
  const sinA = Math.sin(tiltRad);
  const skew = options.perspectiveSkew ?? (tiltRad !== 0 ? 0.035 : 0);
  const gradAmp = options.brightnessGradient ?? 0;

  const out = new Uint8ClampedArray(outW * outH * 4);
  const cxOut = outW * 0.5;
  const cyOut = outH * 0.5;
  const cxIn = bw * 0.5;
  const cyIn = bh * 0.5;
  const isIdentityGeom = tiltRad === 0 && skew === 0 && outW === bw && outH === bh;
  const fitScale = tiltRad !== 0 ? 0.85 : 1.0;

  for (let y = 0; y < outH; y++) {
    const ny = (y - cyOut) / (outH * 0.5);
    for (let x = 0; x < outW; x++) {
      let lum = 225;
      if (isIdentityGeom) {
        lum = baseGray[y * bw + x];
      } else {
        const nx = (x - cxOut) / (outW * 0.5);
        const perspFactor = 1 + skew * ny;
        const dxOut = ((nx / perspFactor) * (bw * 0.5)) / fitScale;
        const dyOut = ((ny / perspFactor) * (bh * 0.5)) / fitScale;

        const srcX = cxIn + dxOut * cosA + dyOut * sinA;
        const srcY = cyIn - dxOut * sinA + dyOut * cosA;

        const x0 = Math.floor(srcX);
        const y0 = Math.floor(srcY);
        if (x0 >= 0 && x0 + 1 < bw && y0 >= 0 && y0 + 1 < bh) {
          const fx = srcX - x0;
          const fy = srcY - y0;
          const p00 = baseGray[y0 * bw + x0];
          const p10 = baseGray[y0 * bw + x0 + 1];
          const p01 = baseGray[(y0 + 1) * bw + x0];
          const p11 = baseGray[(y0 + 1) * bw + x0 + 1];
          lum =
            (p00 * (1 - fx) + p10 * fx) * (1 - fy) +
            (p01 * (1 - fx) + p11 * fx) * fy;
        }
      }

      if (gradAmp > 0) {
        const u = x / outW;
        const v = y / outH;
        const factor = 1 - gradAmp * (0.55 * u + 0.45 * v);
        lum = Math.max(8, Math.min(255, Math.round(lum * factor)));
      } else {
        lum = Math.round(lum);
      }

      const p = (y * outW + x) * 4;
      out[p] = lum;
      out[p + 1] = lum;
      out[p + 2] = lum;
      out[p + 3] = 255;
    }
  }

  return { data: out, width: outW, height: outH };
}

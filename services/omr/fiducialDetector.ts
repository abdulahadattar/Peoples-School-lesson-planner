import { Point2D } from './types';

export function toGrayscale(data: Uint8ClampedArray, width: number, height: number): Uint8Array {
  const gray = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
    gray[i] = (0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2]) | 0;
  }
  return gray;
}

export function buildIntegralImage(gray: Uint8Array, width: number, height: number): Float64Array {
  const stride = width + 1;
  const integral = new Float64Array(stride * (height + 1));
  for (let y = 1; y <= height; y++) {
    let rowSum = 0;
    const gRowOffset = (y - 1) * width;
    const iRowOffset = y * stride;
    const prevRowOffset = (y - 1) * stride;
    for (let x = 1; x <= width; x++) {
      rowSum += gray[gRowOffset + (x - 1)];
      integral[iRowOffset + x] = integral[prevRowOffset + x] + rowSum;
    }
  }
  return integral;
}

function boxMean(
  integral: Float64Array,
  width: number,
  height: number,
  cx: number,
  cy: number,
  radius: number
): number {
  const stride = width + 1;
  const x0 = Math.max(0, cx - radius);
  const y0 = Math.max(0, cy - radius);
  const x1 = Math.min(width - 1, cx + radius);
  const y1 = Math.min(height - 1, cy + radius);
  const count = (x1 - x0 + 1) * (y1 - y0 + 1);
  if (count <= 0) return 255;
  const sum =
    integral[(y1 + 1) * stride + (x1 + 1)] -
    integral[y0 * stride + (x1 + 1)] -
    integral[(y1 + 1) * stride + x0] +
    integral[y0 * stride + x0];
  return sum / count;
}

/** Expands a quad radially outward from its centroid by `padPx` and checks point inclusion. */
function expandQuad(
  quad: readonly [Point2D, Point2D, Point2D, Point2D],
  padPx: number
): [Point2D, Point2D, Point2D, Point2D] {
  const cx = (quad[0].x + quad[1].x + quad[2].x + quad[3].x) * 0.25;
  const cy = (quad[0].y + quad[1].y + quad[2].y + quad[3].y) * 0.25;
  return quad.map((pt) => {
    const dx = pt.x - cx;
    const dy = pt.y - cy;
    const len = Math.max(1, Math.hypot(dx, dy));
    return {
      x: pt.x + (dx / len) * padPx,
      y: pt.y + (dy / len) * padPx,
    };
  }) as [Point2D, Point2D, Point2D, Point2D];
}

function pointInConvexQuad(
  px: number,
  py: number,
  quad: readonly [Point2D, Point2D, Point2D, Point2D]
): boolean {
  let hasPos = false;
  let hasNeg = false;
  for (let i = 0; i < 4; i++) {
    const a = quad[i];
    const b = quad[(i + 1) % 4];
    const cross = (b.x - a.x) * (py - a.y) - (b.y - a.y) * (px - a.x);
    if (cross > 0) hasPos = true;
    else if (cross < 0) hasNeg = true;
    if (hasPos && hasNeg) return false;
  }
  return true;
}

function findFiducialInRegion(
  gray: Uint8Array,
  integral: Float64Array,
  width: number,
  height: number,
  rx0: number,
  ry0: number,
  rx1: number,
  ry1: number,
  expectedSidePx: number,
  expandedQrQuad: readonly [Point2D, Point2D, Point2D, Point2D],
  cornerTarget: Point2D
): Point2D | null {
  const x0 = Math.max(0, Math.floor(rx0));
  const y0 = Math.max(0, Math.floor(ry0));
  const x1 = Math.min(width - 1, Math.ceil(rx1));
  const y1 = Math.min(height - 1, Math.ceil(ry1));
  const rw = x1 - x0 + 1;
  const rh = y1 - y0 + 1;
  if (rw <= 8 || rh <= 8) return null;

  const winR = Math.max(12, Math.round(expectedSidePx * 1.4));
  const mask = new Uint8Array(rw * rh);
  const visited = new Uint8Array(rw * rh);

  for (let ly = 0; ly < rh; ly++) {
    const gy = y0 + ly;
    for (let lx = 0; lx < rw; lx++) {
      const gx = x0 + lx;
      if (pointInConvexQuad(gx, gy, expandedQrQuad)) continue;
      const localMean = boxMean(integral, width, height, gx, gy, winR);
      const pix = gray[gy * width + gx];
      if (pix < localMean * 0.72 && pix < 165) {
        mask[ly * rw + lx] = 1;
      }
    }
  }

  const expectedArea = expectedSidePx * expectedSidePx;
  const minArea = Math.max(25, expectedArea * 0.22);
  const maxArea = expectedArea * 3.8;
  const queueX = new Int32Array(rw * rh);
  const queueY = new Int32Array(rw * rh);

  let best: { cx: number; cy: number; score: number } | null = null;

  for (let sy = 0; sy < rh; sy++) {
    for (let sx = 0; sx < rw; sx++) {
      const startIdx = sy * rw + sx;
      if (!mask[startIdx] || visited[startIdx]) continue;

      let head = 0;
      let tail = 0;
      queueX[tail] = sx;
      queueY[tail] = sy;
      tail++;
      visited[startIdx] = 1;

      let sumX = 0;
      let sumY = 0;
      let count = 0;
      let minLx = sx;
      let maxLx = sx;
      let minLy = sy;
      let maxLy = sy;

      while (head < tail) {
        const cx = queueX[head];
        const cy = queueY[head];
        head++;
        sumX += x0 + cx;
        sumY += y0 + cy;
        count++;
        if (cx < minLx) minLx = cx;
        if (cx > maxLx) maxLx = cx;
        if (cy < minLy) minLy = cy;
        if (cy > maxLy) maxLy = cy;

        const neighbors = [
          [cx - 1, cy],
          [cx + 1, cy],
          [cx, cy - 1],
          [cx, cy + 1],
        ];
        for (const [nx, ny] of neighbors) {
          if (nx < 0 || nx >= rw || ny < 0 || ny >= rh) continue;
          const nIdx = ny * rw + nx;
          if (mask[nIdx] && !visited[nIdx]) {
            visited[nIdx] = 1;
            queueX[tail] = nx;
            queueY[tail] = ny;
            tail++;
          }
        }
      }

      if (count < minArea || count > maxArea) continue;
      const bw = maxLx - minLx + 1;
      const bh = maxLy - minLy + 1;
      const aspect = bw / Math.max(1, bh);
      if (aspect < 0.45 || aspect > 2.2) continue;

      const fillRatio = count / (bw * bh);
      if (fillRatio < 0.5) continue;

      const cx = sumX / count;
      const cy = sumY / count;
      const areaDiff = Math.abs(Math.log(count / Math.max(1, expectedArea)));
      const cornerDist = Math.hypot(cx - cornerTarget.x, cy - cornerTarget.y);
      const normDist = cornerDist / Math.max(width, height);
      const score = fillRatio * 3.0 - areaDiff * 1.4 - normDist * 0.6;

      if (!best || score > best.score) {
        // Sub-pixel dark-intensity weighted centroid refinement inside bounding box (+1px pad)
        const refX0 = Math.max(0, minLx - 1);
        const refX1 = Math.min(rw - 1, maxLx + 1);
        const refY0 = Math.max(0, minLy - 1);
        const refY1 = Math.min(rh - 1, maxLy + 1);
        const bgWhite = boxMean(integral, width, height, Math.round(cx), Math.round(cy), winR);
        let wSumX = 0;
        let wSumY = 0;
        let wTotal = 0;
        for (let ly = refY0; ly <= refY1; ly++) {
          const gy = y0 + ly;
          for (let lx = refX0; lx <= refX1; lx++) {
            const gx = x0 + lx;
            const d = Math.max(0, bgWhite - gray[gy * width + gx]);
            if (d > 15) {
              const w = d * d;
              wSumX += gx * w;
              wSumY += gy * w;
              wTotal += w;
            }
          }
        }
        best = {
          cx: wTotal > 0 ? wSumX / wTotal : cx,
          cy: wTotal > 0 ? wSumY / wTotal : cy,
          score,
        };
      }
    }
  }

  return best ? { x: best.cx, y: best.cy } : null;
}

export function detectFourCornerFiducials(
  gray: Uint8Array,
  integral: Float64Array,
  width: number,
  height: number,
  expectedSidePx: number,
  qrQuad: readonly [Point2D, Point2D, Point2D, Point2D]
): { tl: Point2D; tr: Point2D; bl: Point2D; br: Point2D } | null {
  const halfW = width * 0.46;
  const halfH = height * 0.46;
  const expandedQr = expandQuad(qrQuad, Math.max(4, expectedSidePx * 0.25));

  const tl = findFiducialInRegion(gray, integral, width, height, 0, 0, halfW, halfH, expectedSidePx, expandedQr, { x: 0, y: 0 });
  const tr = findFiducialInRegion(gray, integral, width, height, width - halfW, 0, width - 1, halfH, expectedSidePx, expandedQr, { x: width - 1, y: 0 });
  const bl = findFiducialInRegion(gray, integral, width, height, 0, height - halfH, halfW, height - 1, expectedSidePx, expandedQr, { x: 0, y: height - 1 });
  const br = findFiducialInRegion(gray, integral, width, height, width - halfW, height - halfH, width - 1, height - 1, expectedSidePx, expandedQr, { x: width - 1, y: height - 1 });

  if (!tl || !tr || !bl || !br) return null;
  return { tl, tr, bl, br };
}

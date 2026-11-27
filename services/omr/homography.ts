import { Point2D } from './types';

/**
 * Computes a 3x3 projective homography matrix H (as a 9-element row-major array)
 * mapping 4 source points -> 4 destination points using Gaussian elimination with partial pivoting.
 */
export function computeHomography(
  src: readonly [Point2D, Point2D, Point2D, Point2D],
  dst: readonly [Point2D, Point2D, Point2D, Point2D]
): number[] | null {
  const A: number[][] = [];
  const b: number[] = [];

  for (let i = 0; i < 4; i++) {
    const x = src[i].x;
    const y = src[i].y;
    const u = dst[i].x;
    const v = dst[i].y;

    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);

    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }

  const n = 8;
  // Augmented matrix M of size 8 x 9
  const M = A.map((row, idx) => [...row, b[idx]]);

  for (let col = 0; col < n; col++) {
    let pivotRow = col;
    let maxAbs = Math.abs(M[col][col]);
    for (let r = col + 1; r < n; r++) {
      const val = Math.abs(M[r][col]);
      if (val > maxAbs) {
        maxAbs = val;
        pivotRow = r;
      }
    }

    if (maxAbs < 1e-10) {
      return null;
    }

    if (pivotRow !== col) {
      const tmp = M[col];
      M[col] = M[pivotRow];
      M[pivotRow] = tmp;
    }

    const pivot = M[col][col];
    for (let c = col; c <= n; c++) {
      M[col][c] /= pivot;
    }

    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = M[r][col];
      if (factor === 0) continue;
      for (let c = col; c <= n; c++) {
        M[r][c] -= factor * M[col][c];
      }
    }
  }

  return [
    M[0][n],
    M[1][n],
    M[2][n],
    M[3][n],
    M[4][n],
    M[5][n],
    M[6][n],
    M[7][n],
    1,
  ];
}

export function applyHomography(H: readonly number[], pt: Point2D): Point2D {
  const denom = H[6] * pt.x + H[7] * pt.y + H[8];
  const safeDenom = Math.abs(denom) < 1e-9 ? 1e-9 : denom;
  return {
    x: (H[0] * pt.x + H[1] * pt.y + H[2]) / safeDenom,
    y: (H[3] * pt.x + H[4] * pt.y + H[5]) / safeDenom,
  };
}

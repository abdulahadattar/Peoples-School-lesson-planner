import {
  OMR_ANSWER_LETTERS,
  OmrBubbleCoord,
  OmrGrBubbleCoord,
  OmrGridGeometry,
} from './types';

export const A4_WIDTH_MM = 210;
export const A4_HEIGHT_MM = 297;
export const MM_TO_PT = 72 / 25.4;

export function mmToPt(mm: number): number {
  return mm * MM_TO_PT;
}

/**
 * Converts top-left A4 millimeter coordinates (x right, y down)
 * to pdf-lib bottom-left point coordinates (x right, y up).
 */
export function a4MmToPdfPoint(xMm: number, yMm: number): { x: number; y: number } {
  return {
    x: xMm * MM_TO_PT,
    y: (A4_HEIGHT_MM - yMm) * MM_TO_PT,
  };
}

/**
 * Single source of truth for A4 OMR Sheet layout coordinates.
 * Both `omrPdfGenerator.ts` and `visionEngine.ts` MUST consume this exact geometry.
 */
export function computeOmrGeometry(questionCount: number, hasGrGrid: boolean): OmrGridGeometry {
  const n = Math.max(1, Math.min(100, Math.round(questionCount)));

  const fiducialSize = 10;
  const fiducials = {
    tl: { id: 'tl' as const, cxMm: 15, cyMm: 15, sizeMm: fiducialSize },
    tr: { id: 'tr' as const, cxMm: 195, cyMm: 15, sizeMm: fiducialSize },
    bl: { id: 'bl' as const, cxMm: 15, cyMm: 282, sizeMm: fiducialSize },
    br: { id: 'br' as const, cxMm: 195, cyMm: 282, sizeMm: fiducialSize },
  };

  // Top-right QR box sits cleanly inside the top-right fiducial (x: 190..200) and above metaBox (y: 42)
  const qrBox = {
    xMm: 156,
    yMm: 10,
    sizeMm: 30,
  };

  // Optional 4-digit GR bubble grid (columns 0..3, digits 0..9)
  const grDigits = 4;
  const grBox = {
    xMm: 130,
    yMm: 42,
    wMm: 56,
    hMm: 52,
  };
  const grBubbles: OmrGrBubbleCoord[] = [];
  if (hasGrGrid) {
    const startX = grBox.xMm + 16;
    const colPitch = 9.5;
    const startY = grBox.yMm + 11;
    const rowPitch = 4.2;
    const radiusMm = 1.5;

    for (let dIdx = 0; dIdx < grDigits; dIdx++) {
      for (let digit = 0; digit <= 9; digit++) {
        grBubbles.push({
          digitIndex: dIdx,
          digit,
          cxMm: Number((startX + dIdx * colPitch).toFixed(3)),
          cyMm: Number((startY + digit * rowPitch).toFixed(3)),
          radiusMm,
        });
      }
    }
  }

  // Decide column layout so every row fits comfortably between yStart and yEnd (<= 270mm)
  const columns = n <= 20 ? 2 : n <= 50 ? 2 : n <= 75 ? 3 : 4;
  const rowsPerColumn = Math.ceil(n / columns);

  const areaLeftMm = 24;
  const areaRightMm = 186;
  const areaWidthMm = areaRightMm - areaLeftMm; // 162mm
  const colWidthMm = areaWidthMm / columns;

  const gridTopMm = hasGrGrid ? 102 : 76;
  const gridBottomMm = 268;
  const maxRowPitch = columns <= 2 ? 9.2 : 6.8;
  const minRowPitch = 5.4;
  const availableHeight = gridBottomMm - (gridTopMm + 7);
  const rawPitch = rowsPerColumn > 1 ? availableHeight / rowsPerColumn : maxRowPitch;
  const rowPitch = Math.max(minRowPitch, Math.min(maxRowPitch, Number(rawPitch.toFixed(3))));

  const radiusMm = columns <= 2 ? 2.25 : columns === 3 ? 1.95 : 1.75;
  const optionPitchMm = columns <= 2 ? 12.0 : columns === 3 ? 8.6 : 7.0;
  const labelWidthMm = columns <= 2 ? 15.0 : columns === 3 ? 11.5 : 9.5;

  const columnHeaders: OmrGridGeometry['columnHeaders'] = [];
  const bubbles: OmrBubbleCoord[] = [];

  for (let col = 0; col < columns; col++) {
    const colX = areaLeftMm + col * colWidthMm;
    const firstOptionX = colX + labelWidthMm + radiusMm + 1.5;
    const optionXsMm = OMR_ANSWER_LETTERS.map((_, optIdx) =>
      Number((firstOptionX + optIdx * optionPitchMm).toFixed(3))
    );
    columnHeaders.push({
      columnIndex: col,
      xStartMm: Number(colX.toFixed(3)),
      yMm: gridTopMm,
      optionXsMm,
    });
  }

  for (let qIdx = 0; qIdx < n; qIdx++) {
    const col = Math.floor(qIdx / rowsPerColumn);
    const rowInCol = qIdx % rowsPerColumn;
    const cyMm = Number((gridTopMm + 7.5 + rowInCol * rowPitch).toFixed(3));
    const header = columnHeaders[col];

    for (let optIdx = 0; optIdx < 4; optIdx++) {
      bubbles.push({
        questionIndex: qIdx,
        optionIndex: optIdx,
        option: OMR_ANSWER_LETTERS[optIdx],
        cxMm: header.optionXsMm[optIdx],
        cyMm,
        radiusMm,
      });
    }
  }

  return {
    pageWidthMm: A4_WIDTH_MM,
    pageHeightMm: A4_HEIGHT_MM,
    hasGrGrid,
    questionCount: n,
    columns,
    rowsPerColumn,
    fiducials,
    qrBox,
    grGrid: {
      enabled: hasGrGrid,
      digits: grDigits,
      boxMm: grBox,
      bubbles: grBubbles,
    },
    columnHeaders,
    bubbles,
  };
}

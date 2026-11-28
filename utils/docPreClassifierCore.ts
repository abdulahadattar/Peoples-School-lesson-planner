/**
 * Pure pixel-feature pre-classifier for student documents vs. portrait photos.
 *
 * Shared by both browser Canvas preprocessing (`utils/localDocPreClassifier.ts`)
 * and server Sharp preprocessing (`services/documentArchive/localPreClassifier.ts`),
 * with zero DOM or Node-native imports so it is directly unit-tested under node:test.
 */

export interface PixelFeatureStats {
  width: number;
  height: number;
  skinFraction: number;
  centerSkinFraction: number;
  meanLuma: number;
  nearWhiteBgFraction: number;
  edgeDensity: number;
  horizontalStrokeBands: number;
  faceDetectedCount: number;
}

export interface PreClassificationDecision {
  category: 'portrait' | 'document';
  confidence: number;
  shouldSkipAi: boolean;
  shouldGreyscale: boolean;
  reason: string;
}

export function extractPixelStatsFromRgb(
  data: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  channels: 3 | 4 = 3,
  faceDetectedCount: number = 0
): PixelFeatureStats {
  const totalPixels = Math.max(1, width * height);
  const luma = new Float32Array(totalPixels);

  let skinCount = 0;
  let centerSkinCount = 0;
  let centerTotal = 0;
  let nearWhiteCount = 0;
  let lumaSum = 0;

  const cxMin = Math.floor(width * 0.22);
  const cxMax = Math.ceil(width * 0.78);
  const cyMin = Math.floor(height * 0.10);
  const cyMax = Math.ceil(height * 0.68);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const off = idx * channels;
      const r = data[off] ?? 0;
      const g = data[off + 1] ?? 0;
      const b = data[off + 2] ?? 0;

      // ITU-R BT.601 luminance
      const yVal = 0.299 * r + 0.587 * g + 0.114 * b;
      luma[idx] = yVal;
      lumaSum += yVal;

      const maxC = Math.max(r, g, b);
      const minC = Math.min(r, g, b);
      const chroma = maxC - minC;

      if (yVal >= 195 && chroma <= 28) {
        nearWhiteCount++;
      }

      // YCbCr skin-tone cluster with chroma threshold so cream/yellow paper is excluded
      const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
      const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
      const isSkin = yVal >= 50 && yVal <= 238 && chroma >= 16 && cb >= 77 && cb <= 128 && cr >= 133 && cr <= 174;

      if (isSkin) skinCount++;
      if (x >= cxMin && x <= cxMax && y >= cyMin && y <= cyMax) {
        centerTotal++;
        if (isSkin) centerSkinCount++;
      }
    }
  }

  let edgePixels = 0;
  const bands = 24;
  const rowsPerBand = Math.max(1, Math.floor(height / bands));
  let activeTextBands = 0;

  for (let b = 0; b < bands; b++) {
    const yStart = Math.max(1, b * rowsPerBand);
    const yEnd = Math.min(height - 1, (b + 1) * rowsPerBand);
    let bandEdges = 0;
    let bandSamples = 0;
    let bandDark = 0;
    let bandLight = 0;

    for (let y = yStart; y < yEnd; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        const gx = Math.abs(luma[idx + 1] - luma[idx - 1]);
        const gy = Math.abs(luma[idx + width] - luma[idx - width]);
        const grad = gx + gy;
        if (grad > 46) {
          edgePixels++;
          bandEdges++;
        }
        if (luma[idx] < 110) bandDark++;
        else if (luma[idx] > 185) bandLight++;
        bandSamples++;
      }
    }

    if (bandSamples > 0) {
      const bandEdgeRatio = bandEdges / bandSamples;
      const hasPaperInkContrast = bandLight / bandSamples > 0.30 && bandDark / bandSamples > 0.03;
      if (bandEdgeRatio > 0.10 && hasPaperInkContrast) {
        activeTextBands++;
      }
    }
  }

  const interiorPixels = Math.max(1, (width - 2) * (height - 2));

  return {
    width,
    height,
    skinFraction: skinCount / totalPixels,
    centerSkinFraction: centerTotal > 0 ? centerSkinCount / centerTotal : 0,
    meanLuma: lumaSum / totalPixels,
    nearWhiteBgFraction: nearWhiteCount / totalPixels,
    edgeDensity: edgePixels / interiorPixels,
    horizontalStrokeBands: activeTextBands / bands,
    faceDetectedCount,
  };
}

export function classifyImageFeatures(stats: PixelFeatureStats): PreClassificationDecision {
  const aspectRatio = stats.height > 0 ? stats.width / stats.height : 1;

  // Official documents (CNIC cards, B-Forms, Marksheets, Forms) typically contain
  // repeated horizontal printed text lines, white paper margins, or card aspect ratio.
  const hasStrongDocumentText =
    stats.horizontalStrokeBands >= 0.25 ||
    (stats.nearWhiteBgFraction >= 0.58 && stats.edgeDensity >= 0.14);

  if (hasStrongDocumentText) {
    return {
      category: 'document',
      confidence: 0.93,
      shouldSkipAi: false,
      shouldGreyscale: true,
      reason: `Detected structured document text bands (${Math.round(stats.horizontalStrokeBands * 100)}%) & paper contrast`,
    };
  }

  // Native face detector hit on a portrait-proportioned image without dense document text
  if (stats.faceDetectedCount === 1 && aspectRatio <= 1.35 && stats.horizontalStrokeBands < 0.25) {
    return {
      category: 'portrait',
      confidence: 0.96,
      shouldSkipAi: true,
      shouldGreyscale: false,
      reason: 'Single human face detected locally without document text layout',
    };
  }

  // Offline skin-cluster portrait heuristic (centered face/neck + compact portrait/square aspect + low text bands)
  const isPortraitAspect = aspectRatio >= 0.52 && aspectRatio <= 1.25;
  const hasPortraitSkinCluster =
    stats.centerSkinFraction >= 0.12 &&
    stats.skinFraction >= 0.06 &&
    stats.edgeDensity < 0.24;

  if (isPortraitAspect && hasPortraitSkinCluster && stats.horizontalStrokeBands < 0.22) {
    return {
      category: 'portrait',
      confidence: 0.89,
      shouldSkipAi: true,
      shouldGreyscale: false,
      reason: `Centered portrait skin-tone cluster (${Math.round(stats.centerSkinFraction * 100)}%) with smooth tones`,
    };
  }

  return {
    category: 'document',
    confidence: 0.88,
    shouldSkipAi: false,
    shouldGreyscale: true,
    reason: 'Classified as text/official document for high-contrast greyscale OCR optimization',
  };
}

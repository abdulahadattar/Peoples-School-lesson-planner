/**
 * Pure Client/Server Portrait-vs-Document Classifier.
 *
 * Runs locally on downsampled RGB/RGBA pixels with zero network or AI calls:
 * - Detects standalone student passport portraits (central skin-tone cluster,
 *   smooth studio/solid border uniformity, low printed-text stroke density).
 * - Keeps standalone portraits in full color and skips Gemini AI completely.
 * - Detects text documents (B-Forms, CNICs, Marksheets) by high-frequency
 *   ink-on-paper edge/stroke density and horizontal line contrast, even if a
 *   small corner ID thumbnail is present on the document.
 *
 * Zero DOM / sharp / browser dependencies so unit tests and Node/browser
 * runtimes share the exact same heuristic.
 */

export interface PixelPreClassifyInput {
  width: number;
  height: number;
  /** Interleaved RGB (channels=3) or RGBA (channels=4) pixel buffer. */
  data: Uint8Array | Uint8ClampedArray;
  channels: 3 | 4;
  /** Optional bounding boxes from browser FaceDetector API normalized 0..1. */
  detectedFaces?: Array<{ x: number; y: number; width: number; height: number }>;
}

export interface PixelPreClassifyResult {
  classification: 'portrait' | 'document';
  confidence: number;
  reason: string;
  metrics: {
    skinCenterRatio: number;
    skinBorderRatio: number;
    borderUniformity: number;
    textStrokeDensity: number;
    paperWhiteRatio: number;
    faceCoverageRatio: number;
  };
}

function isSkinRgb(r: number, g: number, b: number): boolean {
  if (r <= 85 || g <= 38 || b <= 20) return false;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max - min <= 14) return false;
  if (Math.abs(r - g) <= 10 || r <= g || r <= b) return false;

  // YCbCr skin chrominance bounds calibrated across light to deep South Asian tones.
  const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
  const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
  return cb >= 75 && cb <= 130 && cr >= 131 && cr <= 176;
}

export function classifyPortraitOrDocumentPixels(input: PixelPreClassifyInput): PixelPreClassifyResult {
  const { width, height, data, channels, detectedFaces } = input;
  if (!width || !height || width < 8 || height < 8 || data.length < width * height * channels) {
    return {
      classification: 'document',
      confidence: 0.5,
      reason: 'Fallback to document for undersized frame',
      metrics: {
        skinCenterRatio: 0,
        skinBorderRatio: 0,
        borderUniformity: 0,
        textStrokeDensity: 0,
        paperWhiteRatio: 0,
        faceCoverageRatio: 0,
      },
    };
  }

  const luma = new Float32Array(width * height);
  let centerPixels = 0;
  let centerSkin = 0;
  let borderPixels = 0;
  let borderSkin = 0;
  let paperWhiteCount = 0;
  let borderSumR = 0;
  let borderSumG = 0;
  let borderSumB = 0;
  let borderCount = 0;

  for (let y = 0; y < height; y++) {
    const ny = y / height;
    const inBorderY = ny < 0.14 || ny > 0.88;
    for (let x = 0; x < width; x++) {
      const nx = x / width;
      const idx = (y * width + x) * channels;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      luma[y * width + x] = lum;

      if (lum >= 205 && Math.max(r, g, b) - Math.min(r, g, b) < 28) {
        paperWhiteCount++;
      }

      const skin = isSkinRgb(r, g, b);
      // Upper-center oval portrait face/neck zone
      const dx = (nx - 0.5) / 0.28;
      const dy = (ny - 0.40) / 0.30;
      const inCenterOval = dx * dx + dy * dy <= 1.0;

      if (inCenterOval) {
        centerPixels++;
        if (skin) centerSkin++;
      }

      const inBorder = inBorderY || nx < 0.14 || nx > 0.86;
      if (inBorder) {
        borderPixels++;
        if (skin) borderSkin++;
        borderSumR += r;
        borderSumG += g;
        borderSumB += b;
        borderCount++;
      }
    }
  }

  // Border color uniformity (low variance => clean studio/solid portrait backdrop)
  let borderVarAccum = 0;
  const meanR = borderCount > 0 ? borderSumR / borderCount : 0;
  const meanG = borderCount > 0 ? borderSumG / borderCount : 0;
  const meanB = borderCount > 0 ? borderSumB / borderCount : 0;
  for (let y = 0; y < height; y++) {
    const ny = y / height;
    const inBorderY = ny < 0.14 || ny > 0.88;
    for (let x = 0; x < width; x++) {
      const nx = x / width;
      if (!(inBorderY || nx < 0.14 || nx > 0.86)) continue;
      const idx = (y * width + x) * channels;
      const dr = data[idx] - meanR;
      const dg = data[idx + 1] - meanG;
      const db = data[idx + 2] - meanB;
      borderVarAccum += (dr * dr + dg * dg + db * db) / 3;
    }
  }
  const borderStd = borderCount > 0 ? Math.sqrt(borderVarAccum / borderCount) : 128;
  const borderUniformity = Math.max(0, Math.min(1, 1 - borderStd / 75));

  // Printed text / table edge density in outer & lower document bands (outside center face)
  let textEdgeSamples = 0;
  let strongStrokeEdges = 0;
  for (let y = 1; y < height - 1; y++) {
    const ny = y / height;
    for (let x = 1; x < width - 1; x++) {
      const nx = x / width;
      const dx = (nx - 0.5) / 0.24;
      const dy = (ny - 0.38) / 0.26;
      // Ignore facial feature edges (eyes/mouth) inside the face zone when measuring background/page text
      if (dx * dx + dy * dy <= 0.85) continue;

      const c = luma[y * width + x];
      const gx = Math.abs(luma[y * width + (x + 1)] - luma[y * width + (x - 1)]);
      const gy = Math.abs(luma[(y + 1) * width + x] - luma[(y - 1) * width + x]);
      textEdgeSamples++;
      if ((gx > 42 || gy > 42) && (c < 185 || luma[y * width + (x + 1)] > 195)) {
        strongStrokeEdges++;
      }
    }
  }

  const skinCenterRatio = centerPixels > 0 ? centerSkin / centerPixels : 0;
  const skinBorderRatio = borderPixels > 0 ? borderSkin / borderPixels : 0;
  const textStrokeDensity = textEdgeSamples > 0 ? strongStrokeEdges / textEdgeSamples : 0;
  const paperWhiteRatio = paperWhiteCount / (width * height);

  // Check optional browser FaceDetector box coverage.
  // Important: A CNIC or Admission Form may contain a tiny corner ID photo (< 9% area) surrounded
  // by heavy printed text; standalone portraits occupy a dominant centered face box (>= 9% area).
  let maxFaceArea = 0;
  if (Array.isArray(detectedFaces) && detectedFaces.length > 0) {
    for (const box of detectedFaces) {
      const area = Math.max(0, box.width) * Math.max(0, box.height);
      if (area > maxFaceArea) maxFaceArea = area;
    }
  }

  const aspect = width / height;
  const isWideLandscapeDocument = aspect > 1.38 && maxFaceArea < 0.16;

  // Browser FaceDetector confirmed standalone portrait
  if (maxFaceArea >= 0.09 && textStrokeDensity < 0.16 && !isWideLandscapeDocument) {
    return {
      classification: 'portrait',
      confidence: Math.min(0.98, 0.82 + maxFaceArea * 0.5),
      reason: 'Browser FaceDetector confirmed centered student portrait',
      metrics: {
        skinCenterRatio,
        skinBorderRatio,
        borderUniformity,
        textStrokeDensity,
        paperWhiteRatio,
        faceCoverageRatio: maxFaceArea,
      },
    };
  }

  // Pixel-only fast heuristic:
  // Standalone portrait has strong skin concentration in upper-center oval,
  // much lower skin outside (not full-page beige/sepia tint), smooth outer border,
  // and low printed text/table edge density.
  const skinConcentratedInCenter = skinCenterRatio >= 0.20 && skinCenterRatio >= skinBorderRatio * 2.1 + 0.08;
  const lowDocumentText = textStrokeDensity < 0.115 && paperWhiteRatio < 0.78;

  if (skinConcentratedInCenter && lowDocumentText && borderUniformity >= 0.35 && !isWideLandscapeDocument) {
    const score = Math.min(
      0.95,
      0.62 + Math.min(0.2, skinCenterRatio * 0.45) + (1 - textStrokeDensity / 0.15) * 0.15
    );
    return {
      classification: 'portrait',
      confidence: Number(score.toFixed(2)),
      reason: 'Centered portrait skin cluster with uniform studio backdrop and low text density',
      metrics: {
        skinCenterRatio,
        skinBorderRatio,
        borderUniformity,
        textStrokeDensity,
        paperWhiteRatio,
        faceCoverageRatio: maxFaceArea,
      },
    };
  }

  const docConf = Math.min(0.97, 0.72 + Math.min(0.22, textStrokeDensity * 1.1));
  return {
    classification: 'document',
    confidence: Number(docConf.toFixed(2)),
    reason:
      textStrokeDensity >= 0.115
        ? 'High printed text/table stroke density detected'
        : isWideLandscapeDocument
          ? 'Landscape official card/document aspect ratio detected'
          : 'Document scan characteristics detected',
    metrics: {
      skinCenterRatio,
      skinBorderRatio,
      borderUniformity,
      textStrokeDensity,
      paperWhiteRatio,
      faceCoverageRatio: maxFaceArea,
    },
  };
}

/**
 * Fast Client-Side Pre-Classifier & Selective Greyscale Converter.
 *
 * Runs locally in the browser BEFORE upload / Gemini Vision:
 * - Portrait photo -> preserves full original color, tags preClassifiedAs: 'portrait'
 *   so the backend skips Gemini extraction completely (zero AI cost).
 * - Text / Official Document -> converts to high-contrast greyscale via Canvas
 *   to shrink upload payload and maximize OCR accuracy.
 */
import {
  classifyImageFeatures,
  extractPixelStatsFromRgb,
  type PreClassificationDecision,
} from './docPreClassifierCore';

export interface PreprocessedUploadFile {
  file: File;
  preClassifiedAs?: 'portrait' | 'document';
  decision?: PreClassificationDecision;
  skipAi: boolean;
}

const MAX_ANALYSIS_DIM = 160;
const MAX_DOC_WIDTH = 1600;
const MAX_DOC_HEIGHT = 2200;
const MAX_PHOTO_WIDTH = 900;
const MAX_PHOTO_HEIGHT = 1100;

function loadImageElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    };
    img.src = url;
  });
}

async function detectFaceCount(source: HTMLCanvasElement): Promise<number> {
  try {
    const DetectorCtor = (window as any).FaceDetector;
    if (typeof DetectorCtor !== 'function') return 0;
    const detector = new DetectorCtor({ fastMode: true, maxDetectedFaces: 3 });
    const faces = await detector.detect(source);
    return Array.isArray(faces) ? faces.length : 0;
  } catch {
    return 0;
  }
}

function fitDimensions(w: number, h: number, maxW: number, maxH: number): { w: number; h: number } {
  const scale = Math.min(1, maxW / Math.max(1, w), maxH / Math.max(1, h));
  return {
    w: Math.max(1, Math.round(w * scale)),
    h: Math.max(1, Math.round(h * scale)),
  };
}

/**
 * Apply percentile contrast stretch on greyscale pixels to sharpen faded stamps
 * and handwritten/printed B-Form or CNIC text before OCR.
 */
function applyHighContrastGreyscale(imageData: ImageData): void {
  const d = imageData.data;
  const hist = new Uint32Array(256);
  const pixelCount = d.length / 4;
  const lumas = new Uint8Array(pixelCount);

  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    const y = Math.min(255, Math.max(0, Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2])));
    lumas[p] = y;
    hist[y]++;
  }

  const lowCut = Math.floor(pixelCount * 0.015);
  const highCut = Math.floor(pixelCount * 0.985);
  let acc = 0;
  let minVal = 0;
  let maxVal = 255;

  for (let v = 0; v < 256; v++) {
    acc += hist[v];
    if (acc >= lowCut) {
      minVal = v;
      break;
    }
  }
  acc = 0;
  for (let v = 255; v >= 0; v--) {
    acc += hist[v];
    if (acc >= pixelCount - highCut) {
      maxVal = v;
      break;
    }
  }

  const range = Math.max(32, maxVal - minVal);
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    const stretched = ((lumas[p] - minVal) * 255) / range;
    // Slight midtone S-curve boost for clean crisp OCR text
    const clamped = Math.max(0, Math.min(255, Math.round(stretched)));
    d[i] = clamped;
    d[i + 1] = clamped;
    d[i + 2] = clamped;
  }
}

export async function preprocessUploadFile(file: File): Promise<PreprocessedUploadFile> {
  const isImage = file.type.startsWith('image/') || /\.(jpe?g|png|webp)$/i.test(file.name);
  if (!isImage || typeof document === 'undefined') {
    return { file, skipAi: false };
  }

  try {
    const img = await loadImageElement(file);
    const analysisDims = fitDimensions(img.naturalWidth || img.width, img.naturalHeight || img.height, MAX_ANALYSIS_DIM, MAX_ANALYSIS_DIM);
    const probeCanvas = document.createElement('canvas');
    probeCanvas.width = analysisDims.w;
    probeCanvas.height = analysisDims.h;
    const probeCtx = probeCanvas.getContext('2d', { willReadFrequently: true });
    if (!probeCtx) return { file, skipAi: false };

    probeCtx.drawImage(img, 0, 0, analysisDims.w, analysisDims.h);
    const probePixels = probeCtx.getImageData(0, 0, analysisDims.w, analysisDims.h);
    const faceCount = await detectFaceCount(probeCanvas);
    const stats = extractPixelStatsFromRgb(probePixels.data, analysisDims.w, analysisDims.h, 4, faceCount);
    const decision = classifyImageFeatures(stats);

    const outCanvas = document.createElement('canvas');
    if (decision.category === 'portrait') {
      const dims = fitDimensions(img.naturalWidth || img.width, img.naturalHeight || img.height, MAX_PHOTO_WIDTH, MAX_PHOTO_HEIGHT);
      outCanvas.width = dims.w;
      outCanvas.height = dims.h;
      const ctx = outCanvas.getContext('2d');
      if (!ctx) return { file, preClassifiedAs: 'portrait', decision, skipAi: true };
      ctx.drawImage(img, 0, 0, dims.w, dims.h);
      const blob = await new Promise<Blob | null>((resolve) => outCanvas.toBlob(resolve, 'image/jpeg', 0.90));
      if (!blob) return { file, preClassifiedAs: 'portrait', decision, skipAi: true };
      const outFile = new File([blob], file.name, { type: 'image/jpeg', lastModified: file.lastModified });
      return { file: outFile, preClassifiedAs: 'portrait', decision, skipAi: true };
    }

    // Text / Official Document -> optimized high-contrast greyscale
    const docDims = fitDimensions(img.naturalWidth || img.width, img.naturalHeight || img.height, MAX_DOC_WIDTH, MAX_DOC_HEIGHT);
    outCanvas.width = docDims.w;
    outCanvas.height = docDims.h;
    const ctx = outCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return { file, preClassifiedAs: 'document', decision, skipAi: false };
    ctx.drawImage(img, 0, 0, docDims.w, docDims.h);
    const docImgData = ctx.getImageData(0, 0, docDims.w, docDims.h);
    applyHighContrastGreyscale(docImgData);
    ctx.putImageData(docImgData, 0, 0);

    const blob = await new Promise<Blob | null>((resolve) => outCanvas.toBlob(resolve, 'image/jpeg', 0.86));
    if (!blob) return { file, preClassifiedAs: 'document', decision, skipAi: false };
    const outFile = new File([blob], file.name, { type: 'image/jpeg', lastModified: file.lastModified });
    return { file: outFile, preClassifiedAs: 'document', decision, skipAi: false };
  } catch {
    return { file, skipAi: false };
  }
}

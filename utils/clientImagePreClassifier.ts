import { classifyPortraitOrDocumentPixels } from '../services/documentArchive/portraitDetectorCore';

export interface ClientPreClassificationOutput {
  file: File;
  base64Data: string;
  preClassifiedAs?: 'portrait' | 'document';
  aiSkipped: boolean;
  isBlackAndWhite: boolean;
  confidence: number;
  reason: string;
}

const SAMPLE_GRID_SIZE = 96;
const PORTRAIT_MAX_W = 600;
const PORTRAIT_MAX_H = 800;
const DOCUMENT_MAX_W = 1600;
const DOCUMENT_MAX_H = 2200;

function blobToBase64String(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = String(reader.result || '');
      resolve(res.split(',')[1] || res);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function loadHtmlImageFromFile(file: File): Promise<{ width: number; height: number; draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void; cleanup: () => void }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({
        width: img.naturalWidth || img.width,
        height: img.naturalHeight || img.height,
        draw: (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h),
        cleanup: () => URL.revokeObjectURL(url),
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Unable to decode image ${file.name}`));
    };
    img.src = url;
  });
}

async function detectBrowserFaceBoxes(
  source: HTMLCanvasElement,
  width: number,
  height: number
): Promise<Array<{ x: number; y: number; width: number; height: number }>> {
  const FaceDetectorCtor = (typeof window !== 'undefined' ? (window as any).FaceDetector : undefined);
  if (!FaceDetectorCtor || width <= 0 || height <= 0) return [];
  try {
    const detector = new FaceDetectorCtor({ fastMode: true, maxDetectedFaces: 3 });
    const rawFaces = await Promise.race([
      detector.detect(source) as Promise<Array<{ boundingBox?: DOMRectReadOnly }>>,
      new Promise<Array<{ boundingBox?: DOMRectReadOnly }>>((r) => setTimeout(() => r([]), 500)),
    ]);
    return (rawFaces || [])
      .map((f) => f.boundingBox)
      .filter((b): b is DOMRectReadOnly => Boolean(b))
      .map((b) => ({
        x: b.x / width,
        y: b.y / height,
        width: b.width / width,
        height: b.height / height,
      }));
  } catch {
    return [];
  }
}

/**
 * Applies percentile contrast stretch on greyscale pixel buffer (P2 -> 0, P98 -> 255)
 * plus mild unsharp-style clarity for OCR readability and smaller JPEG file size.
 */
function applyHighContrastGreyscale(imageData: ImageData): void {
  const data = imageData.data;
  const pixelCount = data.length / 4;
  const lumas = new Uint8Array(pixelCount);
  const hist = new Uint32Array(256);

  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const l = Math.min(255, Math.max(0, Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2])));
    lumas[p] = l;
    hist[l]++;
  }

  const lowTarget = Math.floor(pixelCount * 0.02);
  const highTarget = Math.floor(pixelCount * 0.985);
  let cumul = 0;
  let blackPt = 0;
  let whitePt = 255;

  for (let v = 0; v < 256; v++) {
    cumul += hist[v];
    if (cumul >= lowTarget) {
      blackPt = v;
      break;
    }
  }
  cumul = 0;
  for (let v = 0; v < 256; v++) {
    cumul += hist[v];
    if (cumul >= highTarget) {
      whitePt = Math.max(blackPt + 32, v);
      break;
    }
  }

  const span = Math.max(32, whitePt - blackPt);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const stretched = ((lumas[p] - blackPt) * 255) / span;
    // Mild mid-tone gamma/S-curve contrast for crisp ink on light paper
    const norm = Math.max(0, Math.min(1, stretched / 255));
    const boosted = norm < 0.5
      ? 0.5 * Math.pow(norm * 2, 1.15)
      : 1 - 0.5 * Math.pow((1 - norm) * 2, 1.15);
    const out = Math.min(255, Math.max(0, Math.round(boosted * 255)));
    data[i] = out;
    data[i + 1] = out;
    data[i + 2] = out;
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) reject(new Error('Canvas export returned null blob'));
        else resolve(blob);
      },
      'image/jpeg',
      quality
    );
  });
}

function isImageCandidate(file: File): boolean {
  if (file.type && file.type.startsWith('image/')) return true;
  return /\.(jpe?g|png|webp|gif|bmp)$/i.test(file.name);
}

/**
 * Runs client-side pre-classification on image uploads before hitting Gemini/server:
 * - Portrait detected -> keep FULL ORIGINAL COLOR, set preClassifiedAs: 'portrait' & aiSkipped: true.
 * - Text document detected -> convert to optimized high-contrast greyscale JPEG for faster upload + sharper OCR.
 * - PDFs/ZIPs pass straight through untouched for server PDF extraction/ZIP unpacking.
 */
export async function preClassifyAndOptimizeClientFile(file: File): Promise<ClientPreClassificationOutput> {
  if (!isImageCandidate(file) || typeof document === 'undefined') {
    const base64Data = await blobToBase64String(file);
    return {
      file,
      base64Data,
      aiSkipped: false,
      isBlackAndWhite: false,
      confidence: 0,
      reason: 'Non-image container passed directly for server extraction',
    };
  }

  let decoded: Awaited<ReturnType<typeof loadHtmlImageFromFile>> | null = null;
  try {
    decoded = await loadHtmlImageFromFile(file);
    const { width: srcW, height: srcH, draw } = decoded;

    // 1. Sample 96x96 grid for instant pixel + optional FaceDetector classification
    const sampleCanvas = document.createElement('canvas');
    sampleCanvas.width = SAMPLE_GRID_SIZE;
    sampleCanvas.height = SAMPLE_GRID_SIZE;
    const sampleCtx = sampleCanvas.getContext('2d', { willReadFrequently: true });
    if (!sampleCtx) throw new Error('2D canvas context unavailable');
    draw(sampleCtx, SAMPLE_GRID_SIZE, SAMPLE_GRID_SIZE);

    const detectedFaces = await detectBrowserFaceBoxes(sampleCanvas, SAMPLE_GRID_SIZE, SAMPLE_GRID_SIZE);
    const sampleImgData = sampleCtx.getImageData(0, 0, SAMPLE_GRID_SIZE, SAMPLE_GRID_SIZE);
    const result = classifyPortraitOrDocumentPixels({
      width: SAMPLE_GRID_SIZE,
      height: SAMPLE_GRID_SIZE,
      data: sampleImgData.data,
      channels: 4,
      detectedFaces,
    });

    const isPortrait = result.classification === 'portrait';
    const maxW = isPortrait ? PORTRAIT_MAX_W : DOCUMENT_MAX_W;
    const maxH = isPortrait ? PORTRAIT_MAX_H : DOCUMENT_MAX_H;
    const scale = Math.min(1, maxW / Math.max(1, srcW), maxH / Math.max(1, srcH));
    const targetW = Math.max(1, Math.round(srcW * scale));
    const targetH = Math.max(1, Math.round(srcH * scale));

    const outCanvas = document.createElement('canvas');
    outCanvas.width = targetW;
    outCanvas.height = targetH;
    const outCtx = outCanvas.getContext('2d', { willReadFrequently: !isPortrait });
    if (!outCtx) throw new Error('Output 2D canvas context unavailable');
    draw(outCtx, targetW, targetH);

    if (!isPortrait) {
      const docPixels = outCtx.getImageData(0, 0, targetW, targetH);
      applyHighContrastGreyscale(docPixels);
      outCtx.putImageData(docPixels, 0, 0);
    }

    const optimizedBlob = await canvasToBlob(outCanvas, isPortrait ? 0.90 : 0.85);
    const outFilename = file.name.replace(/\.[^.]+$/, '') + '.jpg';
    const optimizedFile = new File([optimizedBlob], outFilename, { type: 'image/jpeg' });
    const base64Data = await blobToBase64String(optimizedBlob);

    return {
      file: optimizedFile,
      base64Data,
      preClassifiedAs: result.classification,
      aiSkipped: isPortrait,
      isBlackAndWhite: !isPortrait,
      confidence: result.confidence,
      reason: result.reason,
    };
  } catch {
    const base64Data = await blobToBase64String(file);
    return {
      file,
      base64Data,
      aiSkipped: false,
      isBlackAndWhite: false,
      confidence: 0,
      reason: 'Client canvas decode fallback to server classifier',
    };
  } finally {
    decoded?.cleanup();
  }
}

import sharp from 'sharp';
import { extractPdfImagesInPageOrder } from './pdfImageWalker.js';

export async function extractImagesFromPdf(
  pdfBuffer: Buffer
): Promise<Array<{ pageNumber: number; buffer: Buffer }>> {
  try {
    return await extractPdfImagesInPageOrder(pdfBuffer);
  } catch (err) {
    console.warn('[documentArchiveService] PDF image extraction error:', err);
    return [];
  }
}

export async function optimizeAndPrepareImage(
  inputBuffer: Buffer,
  isPhoto: boolean = false,
  rotateClockwise: 0 | 90 | 180 | 270 = 0
): Promise<{ buffer: Buffer; isBw: boolean; width: number; height: number }> {
  let pipeline = sharp(inputBuffer);
  if (rotateClockwise > 0) {
    pipeline = pipeline.rotate(rotateClockwise);
  } else {
    pipeline = pipeline.rotate();
  }

  pipeline = pipeline.resize({
    width: isPhoto ? 600 : 1600,
    height: isPhoto ? 800 : 2200,
    fit: 'inside',
    withoutEnlargement: true,
  });

  const isBw = !isPhoto;

  if (isPhoto) {
    pipeline = pipeline.jpeg({ quality: 90, mozjpeg: true });
  } else {
    // High-contrast greyscale for sharp NADRA/B-Form/CNIC/Marksheet OCR readability & compact size
    pipeline = pipeline
      .grayscale()
      .normalize()
      .linear(1.22, -18)
      .sharpen({ sigma: 0.7 })
      .jpeg({ quality: 85, mozjpeg: true });
  }

  const outputBuffer = await pipeline.toBuffer();
  const outMeta = await sharp(outputBuffer).metadata();

  return {
    buffer: outputBuffer,
    isBw,
    width: outMeta.width || 0,
    height: outMeta.height || 0,
  };
}

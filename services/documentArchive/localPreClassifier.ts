import sharp from 'sharp';
import {
  classifyPortraitOrDocumentPixels,
  type PixelPreClassifyResult,
} from './portraitDetectorCore.js';

/**
 * Server-side local pre-classification for extracted PDF page images and
 * buffers uploaded without a client-side pre-classification tag.
 * Runs cleanly with sharp at 96x96 RGB before Gemini Vision is invoked.
 */
export async function detectPortraitOrDocumentServer(buffer: Buffer): Promise<PixelPreClassifyResult> {
  try {
    const { data, info } = await sharp(buffer)
      .rotate()
      .resize(96, 96, { fit: 'fill' })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const channels = info.channels === 4 ? 4 : 3;
    return classifyPortraitOrDocumentPixels({
      width: info.width,
      height: info.height,
      data,
      channels,
    });
  } catch {
    return {
      classification: 'document',
      confidence: 0.5,
      reason: 'Fallback to document when image pixel buffer could not be sampled',
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
}

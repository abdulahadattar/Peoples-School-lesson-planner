import sharp from 'sharp';
import { classifyPortraitOrDocumentPixels } from '../../services/documentArchive/portraitDetectorCore';
import { detectPortraitOrDocumentServer } from '../../services/documentArchive/localPreClassifier';
import { optimizeAndPrepareImage } from '../../services/documentArchive/imageProcessing';

type Harness = {
  describe: (name: string) => void;
  it: (name: string, fn: () => void) => void;
  itAsync: (name: string, fn: () => Promise<void> | void) => Promise<void>;
  eq: (actual: unknown, expected: unknown, msg?: string) => void;
};

function buildPortraitRgba(w = 96, h = 96): Uint8Array {
  const buf = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const nx = x / w;
      const ny = y / h;
      const dx = (nx - 0.5) / 0.22;
      const dy = (ny - 0.38) / 0.23;
      const inFace = dx * dx + dy * dy <= 1;
      const inShoulders = ny > 0.65 && Math.abs(nx - 0.5) < 0.36;

      if (inFace) {
        // Warm skin tone with natural studio shading + dark eyes inside face oval
        const isEye = ny > 0.32 && ny < 0.37 && (Math.abs(nx - 0.43) < 0.03 || Math.abs(nx - 0.57) < 0.03);
        buf[idx] = isEye ? 42 : 212;
        buf[idx + 1] = isEye ? 34 : 158;
        buf[idx + 2] = isEye ? 30 : 126;
        buf[idx + 3] = 255;
      } else if (inShoulders) {
        buf[idx] = 36;
        buf[idx + 1] = 54;
        buf[idx + 2] = 92;
        buf[idx + 3] = 255;
      } else {
        // Smooth studio slate backdrop
        buf[idx] = 62;
        buf[idx + 1] = 98;
        buf[idx + 2] = 148;
        buf[idx + 3] = 255;
      }
    }
  }
  return buf;
}

function buildOfficialDocumentRgba(w = 96, h = 96, warmSepia = false): Uint8Array {
  const buf = new Uint8Array(w * h * 4);
  const bg = warmSepia ? [232, 208, 172] : [244, 245, 242];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const inMargin = x < 6 || x > w - 6 || y < 5 || y > h - 5;
      const isTextRow = !inMargin && y >= 10 && y <= 84 && y % 6 === 0 && (x % 5 !== 0);
      const isTableLine = !inMargin && ((x === 14 || x === 48 || x === 80) && y > 18 && y < 82);
      const isInk = isTextRow || isTableLine;

      buf[idx] = isInk ? 34 : bg[0];
      buf[idx + 1] = isInk ? 34 : bg[1];
      buf[idx + 2] = isInk ? 38 : bg[2];
      buf[idx + 3] = 255;
    }
  }
  return buf;
}

export async function runPortraitPreClassifierTests(h: Harness) {
  const { describe, it, itAsync, eq } = h;

  describe('portraitDetectorCore & localPreClassifier');

  it('classifies studio portrait pixels as portrait (AI skipped)', () => {
    const res = classifyPortraitOrDocumentPixels({
      width: 96,
      height: 96,
      data: buildPortraitRgba(),
      channels: 4,
    });
    eq(res.classification, 'portrait', `Expected portrait, got ${res.classification} (${res.reason})`);
    eq(res.confidence >= 0.5, true);
  });

  it('classifies crisp B-Form table/text pixels as document (even with small corner thumbnail face)', () => {
    const res = classifyPortraitOrDocumentPixels({
      width: 96,
      height: 96,
      data: buildOfficialDocumentRgba(96, 96, false),
      channels: 4,
      detectedFaces: [{ x: 0.78, y: 0.08, width: 0.12, height: 0.14 }],
    });
    eq(res.classification, 'document', `Expected document, got ${res.classification} (${res.reason})`);
  });

  it('does not misclassify warm/aged sepia scanned forms as portraits', () => {
    const res = classifyPortraitOrDocumentPixels({
      width: 96,
      height: 96,
      data: buildOfficialDocumentRgba(96, 96, true),
      channels: 4,
    });
    eq(res.classification, 'document', `Expected document for warm sepia form (${res.reason})`);
  });

  await itAsync('keeps real JPEG portrait in full color while converting document to high-contrast greyscale', async () => {
    const portraitPng = await sharp(Buffer.from(buildPortraitRgba(160, 200)), {
      raw: { width: 160, height: 200, channels: 4 },
    })
      .png()
      .toBuffer();

    const docPng = await sharp(Buffer.from(buildOfficialDocumentRgba(240, 320, false)), {
      raw: { width: 240, height: 320, channels: 4 },
    })
      .png()
      .toBuffer();

    const pPre = await detectPortraitOrDocumentServer(portraitPng);
    eq(pPre.classification, 'portrait');

    const pOpt = await optimizeAndPrepareImage(portraitPng, true);
    eq(pOpt.isBw, false);
    const pRaw = await sharp(pOpt.buffer).raw().toBuffer({ resolveWithObject: true });
    let maxChromaDiff = 0;
    for (let i = 0; i < pRaw.data.length; i += pRaw.info.channels) {
      const diff =
        Math.max(pRaw.data[i], pRaw.data[i + 1], pRaw.data[i + 2]) -
        Math.min(pRaw.data[i], pRaw.data[i + 1], pRaw.data[i + 2]);
      if (diff > maxChromaDiff) maxChromaDiff = diff;
    }
    eq(maxChromaDiff > 25, true, 'Portrait must preserve full original RGB color');

    const dPre = await detectPortraitOrDocumentServer(docPng);
    eq(dPre.classification, 'document');

    const dOpt = await optimizeAndPrepareImage(docPng, false);
    eq(dOpt.isBw, true);
    const dMeta = await sharp(dOpt.buffer).metadata();
    const dRaw = await sharp(dOpt.buffer).raw().toBuffer({ resolveWithObject: true });
    let docChromaDiff = 0;
    if (dRaw.info.channels >= 3) {
      for (let i = 0; i < dRaw.data.length; i += dRaw.info.channels) {
        const diff =
          Math.max(dRaw.data[i], dRaw.data[i + 1], dRaw.data[i + 2]) -
          Math.min(dRaw.data[i], dRaw.data[i + 1], dRaw.data[i + 2]);
        if (diff > docChromaDiff) docChromaDiff = diff;
      }
    }
    eq(dMeta.channels === 1 || docChromaDiff <= 3, true, 'Document scan must be greyscale');
  });
}

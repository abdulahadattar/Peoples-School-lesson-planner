import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';

export async function extractImagesFromPdf(
  pdfBuffer: Buffer
): Promise<Array<{ pageNumber: number; buffer: Buffer }>> {
  const images: Array<{ pageNumber: number; buffer: Buffer }> = [];
  try {
    const pdfDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
    const context = pdfDoc.context;
    let pageNum = 1;

    for (const [_, obj] of context.enumerateIndirectObjects()) {
      if (!obj || !(obj as any).dict || !(obj as any).dict.get) continue;
      const dict = (obj as any).dict;
      const subtype = dict.get(context.obj('Subtype'))?.toString();
      if (subtype !== '/Image') continue;

      try {
        const raw = Buffer.from((obj as any).getContents());
        try {
          const meta = await sharp(raw).metadata();
          const w = meta.width || 0;
          const h = meta.height || 0;
          const totalPixels = w * h;
          if (w < 320 || h < 320 || totalPixels < 120000 || raw.length < 12000) continue;
          const jpg = await sharp(raw).jpeg({ quality: 90 }).toBuffer();
          images.push({ pageNumber: pageNum++, buffer: jpg });
          continue;
        } catch (_) {}

        const widthVal = dict.lookup ? dict.lookup(context.obj('Width')) : dict.get(context.obj('Width'));
        const heightVal = dict.lookup ? dict.lookup(context.obj('Height')) : dict.get(context.obj('Height'));
        const width = Number(typeof widthVal?.value === 'function' ? widthVal.value() : typeof widthVal?.asNumber === 'function' ? widthVal.asNumber() : 0);
        const height = Number(typeof heightVal?.value === 'function' ? heightVal.value() : typeof heightVal?.asNumber === 'function' ? heightVal.asNumber() : 0);

        if (width >= 320 && height >= 320 && width * height >= 120000) {
          const channels = 3;
          let decompressed = raw;
          try {
            const zlib = await import('zlib');
            decompressed = zlib.inflateSync(raw);
          } catch {}

          if (decompressed.length >= width * height * channels) {
            const rawJpg = await sharp(decompressed.slice(0, width * height * channels), {
              raw: { width, height, channels },
            }).jpeg({ quality: 90 }).toBuffer();
            images.push({ pageNumber: pageNum++, buffer: rawJpg });
          }
        }
      } catch (innerErr) {
        console.warn('[documentArchiveService] Failed decoding indirect PDF image:', innerErr);
      }
    }
  } catch (err) {
    console.warn('[documentArchiveService] PDF image extraction error:', err);
  }
  return images;
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

  const meta = await sharp(inputBuffer).metadata();
  const isBw = !isPhoto && meta.channels === 1;

  if (isPhoto) {
    pipeline = pipeline.jpeg({ quality: 90, mozjpeg: true });
  } else {
    pipeline = pipeline.grayscale().normalize().jpeg({ quality: 85, mozjpeg: true });
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

import sharp from 'sharp';
import zlib from 'zlib';
import { PDFDocument, PDFName, PDFDict, PDFStream, PDFRef } from 'pdf-lib';

const MIN_DIM = 320;
const MIN_PIXELS = 120000;
const MIN_COMPRESSED_BYTES = 8000;

function readNumericEntry(dict: any, context: any, key: string): number {
  try {
    const val = dict.lookup ? dict.lookup(PDFName.of(key)) : dict.get(PDFName.of(key));
    if (!val) return 0;
    if (typeof val.value === 'function') return Number(val.value()) || 0;
    if (typeof val.asNumber === 'function') return Number(val.asNumber()) || 0;
  } catch {}
  return 0;
}

function resolveColorChannels(dict: any, context: any): number | null {
  try {
    const cs = dict.lookup ? dict.lookup(PDFName.of('ColorSpace')) : dict.get(PDFName.of('ColorSpace'));
    const str = cs?.toString?.() || '';
    if (str.includes('DeviceGray')) return 1;
    if (str.includes('DeviceCMYK')) return 4;
    if (str.includes('DeviceRGB')) return 3;
    if (cs && typeof cs.lookup === 'function' && typeof cs.get === 'function') {
      const first = cs.lookup(0)?.toString?.() || '';
      if (first.includes('ICCBased')) {
        const profile = cs.lookup(1);
        const nVal = profile?.dict ? readNumericEntry(profile.dict, context, 'N') : 0;
        if (nVal === 1 || nVal === 3 || nVal === 4) return nVal;
      }
      if (first.includes('Indexed')) return 1;
    }
  } catch {}
  return null;
}

async function decodePdfImageObject(obj: any, context: any): Promise<Buffer | null> {
  if (!obj || !obj.dict || typeof obj.getContents !== 'function') return null;
  const dict = obj.dict;
  const subtype = dict.get(PDFName.of('Subtype'))?.toString();
  if (subtype !== '/Image') return null;

  const raw = Buffer.from(obj.getContents());
  if (!raw || raw.length === 0) return null;

  // Fast path: JPEG / PNG / JP2 streams directly readable by sharp
  const filterStr = (dict.lookup?.(PDFName.of('Filter')) || dict.get(PDFName.of('Filter')))?.toString?.() || '';
  if (filterStr.includes('DCTDecode') || filterStr.includes('JPXDecode') || !filterStr) {
    try {
      const meta = await sharp(raw).metadata();
      const w = meta.width || 0;
      const h = meta.height || 0;
      if (w < MIN_DIM || h < MIN_DIM || w * h < MIN_PIXELS) return null;
      if (raw.length < MIN_COMPRESSED_BYTES && filterStr.includes('DCTDecode')) return null;
      return await sharp(raw).jpeg({ quality: 92 }).toBuffer();
    } catch {}
  }

  const width = readNumericEntry(dict, context, 'Width');
  const height = readNumericEntry(dict, context, 'Height');
  if (width < MIN_DIM || height < MIN_DIM || width * height < MIN_PIXELS) return null;

  let decompressed = raw;
  if (filterStr.includes('FlateDecode')) {
    try {
      decompressed = zlib.inflateSync(raw);
    } catch {
      return null;
    }
  }

  const pixelCount = width * height;
  const declaredChannels = resolveColorChannels(dict, context);
  const candidateChannels = declaredChannels
    ? [declaredChannels]
    : [3, 1, 4].filter((ch) => decompressed.length >= pixelCount * ch);

  for (const ch of candidateChannels) {
    if (decompressed.length >= pixelCount * ch) {
      try {
        return await sharp(decompressed.subarray(0, pixelCount * ch), {
          raw: { width, height, channels: ch as 1 | 3 | 4 },
        })
          .jpeg({ quality: 92 })
          .toBuffer();
      } catch {}
    }
  }

  return null;
}

function collectXObjectsFromDict(
  xObjDict: any,
  context: any,
  seenRefs: Set<string>,
  results: Array<{ obj: any; refKey?: string }>
): void {
  if (!xObjDict || typeof xObjDict.entries !== 'function') return;
  for (const [_name, val] of xObjDict.entries()) {
    const refKey = val instanceof PDFRef ? val.toString() : undefined;
    if (refKey && seenRefs.has(refKey)) continue;
    const resolved = val instanceof PDFRef ? context.lookup(val) : val;
    if (!(resolved instanceof PDFStream)) continue;

    const subtype = resolved.dict?.get(PDFName.of('Subtype'))?.toString();
    if (subtype === '/Image') {
      if (refKey) seenRefs.add(refKey);
      results.push({ obj: resolved, refKey });
    } else if (subtype === '/Form') {
      if (refKey) seenRefs.add(refKey);
      const nestedRes = resolved.dict.lookupMaybe(PDFName.of('Resources'), PDFDict);
      const nestedXObj = nestedRes?.lookupMaybe(PDFName.of('XObject'), PDFDict);
      if (nestedXObj) {
        collectXObjectsFromDict(nestedXObj, context, seenRefs, results);
      }
    }
  }
}

/**
 * Extract page-sized images from a PDF in deterministic page order (Page 1, Page 2, ...),
 * skipping small icons/logos and handling both JPEG and multi-channel Flate streams.
 */
export async function extractPdfImagesInPageOrder(
  pdfBuffer: Buffer
): Promise<Array<{ pageNumber: number; buffer: Buffer }>> {
  const images: Array<{ pageNumber: number; buffer: Buffer }> = [];
  const pdfDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
  const context = pdfDoc.context;
  const pages = pdfDoc.getPages();
  const seenRefs = new Set<string>();

  for (let idx = 0; idx < pages.length; idx++) {
    const page = pages[idx];
    const resources = page.node.Resources?.();
    const xObjectDict = resources?.lookupMaybe(PDFName.of('XObject'), PDFDict);
    if (!xObjectDict) continue;

    const candidates: Array<{ obj: any; refKey?: string }> = [];
    collectXObjectsFromDict(xObjectDict, context, seenRefs, candidates);

    let extractedForPage = false;
    for (const c of candidates) {
      const decoded = await decodePdfImageObject(c.obj, context);
      if (decoded) {
        images.push({ pageNumber: idx + 1, buffer: decoded });
        extractedForPage = true;
      }
    }
    if (!extractedForPage && candidates.length === 0) {
      // Page has no image XObjects (blank/vector-only page)
      continue;
    }
  }

  // Fallback only if structural page XObject walking found zero images
  if (images.length === 0) {
    let fallbackPage = 1;
    for (const [ref, obj] of context.enumerateIndirectObjects()) {
      const refKey = ref?.toString?.();
      if (refKey && seenRefs.has(refKey)) continue;
      const decoded = await decodePdfImageObject(obj, context);
      if (decoded) {
        images.push({ pageNumber: fallbackPage++, buffer: decoded });
      }
    }
  }

  return images;
}

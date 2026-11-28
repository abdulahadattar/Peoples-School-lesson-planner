/**
 * docxZipReader.ts — Cross-platform (Browser + Node) PKZIP reader and OOXML
 * summary extractor for verifying built .docx exam papers before export.
 */

export interface DocxMediaRef {
  mediaPath: string;
  widthPx?: number;
  heightPx?: number;
}

export interface DocxParagraphSummary {
  index: number;
  text: string;
  textWithMedia?: string;
  leftTwips?: number;
  hangingTwips?: number;
  tabStopTwips?: number;
  hasTabChar: boolean;
  imageCount: number;
  mediaRefs: DocxMediaRef[];
  bold: boolean;
  italic: boolean;
  alignment?: string;
}

export interface DocxXmlInspection {
  pageWidthTwips?: number;
  pageHeightTwips?: number;
  margins?: { top?: number; right?: number; bottom?: number; left?: number };
  paragraphs: DocxParagraphSummary[];
  mediaFiles: string[];
  ooxmlDump: string;
}

export function readPngDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (!bytes || bytes.length < 24) return null;
  if (bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47) {
    return null;
  }
  const width = ((bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19]) >>> 0;
  const height = ((bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23]) >>> 0;
  return { width, height };
}

export function parseDocxRels(relsXml: string): Map<string, string> {
  const map = new Map<string, string>();
  if (!relsXml) return map;
  const relRe = /<Relationship\b([^>]+)\/?>/g;
  let m: RegExpExecArray | null;
  while ((m = relRe.exec(relsXml)) !== null) {
    const attrs = m[1];
    const id = attrs.match(/\bId="([^"]+)"/)?.[1];
    const target = attrs.match(/\bTarget="([^"]+)"/)?.[1];
    if (id && target) {
      const normalized = target.startsWith('/') ? target.slice(1) : target.startsWith('word/') ? target : `word/${target.replace(/^\.\//, '')}`;
      map.set(id, normalized);
    }
  }
  return map;
}

function readUint16LE(buf: Uint8Array, offset: number): number {
  return buf[offset] | (buf[offset + 1] << 8);
}

function readUint32LE(buf: Uint8Array, offset: number): number {
  return (buf[offset] | (buf[offset + 1] << 8) | (buf[offset + 2] << 16) | (buf[offset + 3] << 24)) >>> 0;
}

async function inflateRawBytes(compressed: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('DecompressionStream is required to inspect .docx archives.');
  }
  const ds = new DecompressionStream('deflate-raw');
  const copy = new Uint8Array(compressed.byteLength);
  copy.set(compressed);
  const stream = new Blob([copy.buffer]).stream().pipeThrough(ds);
  const ab = await new Response(stream).arrayBuffer();
  return new Uint8Array(ab);
}

/**
 * Extract all entries from a PKZIP archive (.docx) into a Map<entryPath, bytes>.
 * Uses Central Directory headers so entries with data descriptors work reliably.
 */
export async function extractDocxEntries(zipBytes: Uint8Array): Promise<Map<string, Uint8Array>> {
  const entries = new Map<string, Uint8Array>();
  if (zipBytes.length < 22) {
    throw new Error('Invalid .docx archive (too small)');
  }

  // Locate End of Central Directory (PK\x05\x06) scanning backwards
  let eocdOffset = -1;
  const minOffset = Math.max(0, zipBytes.length - 65557);
  for (let i = zipBytes.length - 22; i >= minOffset; i--) {
    if (zipBytes[i] === 0x50 && zipBytes[i + 1] === 0x4b && zipBytes[i + 2] === 0x05 && zipBytes[i + 3] === 0x06) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset < 0) {
    throw new Error('Invalid .docx archive (missing central directory)');
  }

  const totalEntries = readUint16LE(zipBytes, eocdOffset + 10);
  const cdOffset = readUint32LE(zipBytes, eocdOffset + 16);

  let pos = cdOffset;
  const decoder = new TextDecoder('utf-8');

  for (let n = 0; n < totalEntries && pos + 46 <= zipBytes.length; n++) {
    if (zipBytes[pos] !== 0x50 || zipBytes[pos + 1] !== 0x4b || zipBytes[pos + 2] !== 0x01 || zipBytes[pos + 3] !== 0x02) {
      break;
    }
    const method = readUint16LE(zipBytes, pos + 10);
    const compSize = readUint32LE(zipBytes, pos + 20);
    const nameLen = readUint16LE(zipBytes, pos + 28);
    const extraLen = readUint16LE(zipBytes, pos + 30);
    const commentLen = readUint16LE(zipBytes, pos + 32);
    const localHeaderOffset = readUint32LE(zipBytes, pos + 42);
    const name = decoder.decode(zipBytes.subarray(pos + 46, pos + 46 + nameLen));

    pos += 46 + nameLen + extraLen + commentLen;

    if (localHeaderOffset + 30 > zipBytes.length) continue;
    const localNameLen = readUint16LE(zipBytes, localHeaderOffset + 26);
    const localExtraLen = readUint16LE(zipBytes, localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
    const dataEnd = Math.min(zipBytes.length, dataStart + compSize);
    const rawSlice = zipBytes.subarray(dataStart, dataEnd);

    if (name.endsWith('/')) continue;
    if (method === 0) {
      entries.set(name, new Uint8Array(rawSlice));
    } else if (method === 8) {
      entries.set(name, await inflateRawBytes(rawSlice));
    }
  }

  return entries;
}

export function decodeBase64ToUint8Array(base64: string): Uint8Array {
  if (typeof atob === 'function') {
    const bin = atob(base64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  return new Uint8Array(Buffer.from(base64, 'base64'));
}

function decodeXmlEntities(str: string): string {
  return str
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/** Parse word/document.xml into readable paragraphs + layout metadata. */
export function inspectDocumentXml(
  documentXml: string,
  mediaFiles: string[] = [],
  relsMap?: Map<string, string>
): DocxXmlInspection {
  const pgSzMatch = documentXml.match(/<w:pgSz\b[^>]*w:w="(\d+)"[^>]*w:h="(\d+)"/);
  const pgMarMatch = documentXml.match(/<w:pgMar\b([^>]*)\/>/);
  const margins: DocxXmlInspection['margins'] = {};
  if (pgMarMatch) {
    const attrs = pgMarMatch[1];
    const readAttr = (k: string) => {
      const m = attrs.match(new RegExp(`w:${k}="(\\d+)"`));
      return m ? Number(m[1]) : undefined;
    };
    margins.top = readAttr('top');
    margins.right = readAttr('right');
    margins.bottom = readAttr('bottom');
    margins.left = readAttr('left');
  }

  const paragraphs: DocxParagraphSummary[] = [];
  const pRegex = /<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g;
  let m: RegExpExecArray | null;
  let pIdx = 0;

  while ((m = pRegex.exec(documentXml)) !== null) {
    const block = m[1];
    const indMatch = block.match(/<w:ind\b([^>]*)\/>/);
    let leftTwips: number | undefined;
    let hangingTwips: number | undefined;
    if (indMatch) {
      const lm = indMatch[1].match(/w:left="(\d+)"/);
      const hm = indMatch[1].match(/w:hanging="(\d+)"/);
      if (lm) leftTwips = Number(lm[1]);
      if (hm) hangingTwips = Number(hm[1]);
    }
    const tabMatch = block.match(/<w:tab\b[^>]*w:pos="(\d+)"/);
    const alignMatch = block.match(/<w:jc\b[^>]*w:val="([^"]+)"/);

    // Walk inline <w:t>, <w:tab/>, and <w:drawing> tokens in document order
    const tokenRe = /<w:tab\/>|<w:t\b[^>]*>([\s\S]*?)<\/w:t>|<w:drawing\b[\s\S]*?<\/w:drawing>/g;
    let tm: RegExpExecArray | null;
    let text = '';
    let hasTabChar = false;
    const mediaRefs: DocxMediaRef[] = [];
    while ((tm = tokenRe.exec(block)) !== null) {
      if (tm[0] === '<w:tab/>') {
        hasTabChar = true;
        text += '   [TAB]   ';
      } else if (tm[0].startsWith('<w:drawing')) {
        const embedId = tm[0].match(/<a:blip\b[^>]*r:embed="([^"]+)"/)?.[1];
        const extentMatch = tm[0].match(/<wp:extent\b[^>]*cx="(\d+)"[^>]*cy="(\d+)"/);
        const mediaPath = embedId ? relsMap?.get(embedId) || '' : '';
        if (mediaPath) {
          mediaRefs.push({
            mediaPath,
            widthPx: extentMatch ? Math.max(1, Math.round(Number(extentMatch[1]) / 9525)) : undefined,
            heightPx: extentMatch ? Math.max(1, Math.round(Number(extentMatch[2]) / 9525)) : undefined,
          });
          text += ` [[IMG:${mediaRefs.length - 1}]] `;
        }
      } else if (tm[1] !== undefined) {
        text += decodeXmlEntities(tm[1]);
      }
    }

    const imageCount = (block.match(/<w:drawing\b/g) || []).length;
    const bold = /<w:b(?:\s|\/|>)/.test(block);
    const italic = /<w:i(?:\s|\/|>)/.test(block);
    const cleanText = text.replace(/\[\[IMG:\d+\]\]/g, '').replace(/[ \t]+/g, ' ').trim();
    const textWithMedia = text.replace(/[ \t]+/g, ' ').trim();
    if (cleanText || imageCount > 0) {
      paragraphs.push({
        index: pIdx++,
        text: cleanText,
        textWithMedia,
        leftTwips,
        hangingTwips,
        tabStopTwips: tabMatch ? Number(tabMatch[1]) : undefined,
        hasTabChar,
        imageCount,
        mediaRefs,
        bold,
        italic,
        alignment: alignMatch?.[1],
      });
    }
  }

  const dumpLines = paragraphs.map((p) => {
    const tags: string[] = [];
    if (p.alignment === 'center') tags.push('CENTER');
    if (p.leftTwips) tags.push(`indent:${(p.leftTwips / 1440).toFixed(2)}"`);
    if (p.tabStopTwips) tags.push(`tabStop:${(p.tabStopTwips / 1440).toFixed(2)}"`);
    if (p.imageCount > 0) tags.push(`eqImg:${p.imageCount}`);
    const prefix = tags.length > 0 ? `[${tags.join('|')}] ` : '';
    return `${prefix}${p.text || '[IMAGE ONLY]'}`;
  });

  return {
    pageWidthTwips: pgSzMatch ? Number(pgSzMatch[1]) : undefined,
    pageHeightTwips: pgSzMatch ? Number(pgSzMatch[2]) : undefined,
    margins,
    paragraphs,
    mediaFiles,
    ooxmlDump: dumpLines.join('\n'),
  };
}

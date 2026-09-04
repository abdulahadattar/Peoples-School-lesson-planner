#!/usr/bin/env node
/**
 * Re-frame public/logos/phssj.png into a square canvas with the emblem
 * perfectly centered and any stray corner artifacts removed.
 *
 * The emblem (blue seal ring + inner content) is detected by its ink
 * bounding box; a small stray blue triangle in the source top-right corner
 * (y < 40, x > 300) is treated as background.
 *
 * Usage: node scripts/frame-phssj.mjs
 */
import fs from 'fs';
import zlib from 'zlib';

const input = 'public/logos/phssj.png';

function parsePng(buffer) {
  let offset = 8;
  let width = 0, height = 0, colorType = 0;
  const idat = [];
  while (offset < buffer.length) {
    const len = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      colorType = data.readUInt8(9);
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + len;
  }
  if (colorType !== 2 && colorType !== 6) throw new Error(`Unsupported colorType ${colorType}`);
  return { width, height, colorType, pixels: zlib.inflateSync(Buffer.concat(idat)) };
}

function unfilter(pixels, width, height, colorType) {
  const bpp = colorType === 6 ? 4 : 3;
  const stride = width * bpp;
  const out = Buffer.alloc(height * stride);
  const paeth = (a, b, c) => {
    const p = a + b - c;
    const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  for (let y = 0; y < height; y++) {
    const filter = pixels[y * (stride + 1)];
    const row = y * stride;
    const prev = (y - 1) * stride;
    for (let x = 0; x < stride; x++) {
      const raw = pixels[y * (stride + 1) + 1 + x];
      const left = x >= bpp ? out[row + x - bpp] : 0;
      const up = y > 0 ? out[prev + x] : 0;
      const upLeft = x >= bpp && y > 0 ? out[prev + x - bpp] : 0;
      let val;
      switch (filter) {
        case 0: val = raw; break;
        case 1: val = raw + left; break;
        case 2: val = raw + up; break;
        case 3: val = raw + ((left + up) >> 1); break;
        case 4: val = raw + paeth(left, up, upLeft); break;
        default: throw new Error(`Unknown filter ${filter}`);
      }
      out[row + x] = val & 0xff;
    }
  }
  return { bpp, rgb: out };
}

// --- decode ---
const { width, height, colorType, pixels } = parsePng(fs.readFileSync(input));
const { bpp, rgb } = unfilter(pixels, width, height, colorType);
const at = (x, y, out = rgb, bw = width, bbpp = bpp) => {
  const i = (y * bw + x) * bbpp;
  return [out[i], out[i + 1], out[i + 2]];
};
const isWhite = (c) => c[0] > 245 && c[1] > 245 && c[2] > 245;

// --- emblem ink bbox, excluding the stray top-right corner artifact ---
const artifactZone = (x, y) => x > width - 60 && y < 42; // blue triangle noise
let minX = width, minY = height, maxX = -1, maxY = -1;
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    if (artifactZone(x, y)) continue;
    if (!isWhite(at(x, y))) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
}
if (maxX < 0) throw new Error('No emblem content found');
console.log(`Emblem ink bbox: x ${minX}..${maxX}, y ${minY}..${maxY} (${maxX - minX + 1}x${maxY - minY + 1})`);

const contentW = maxX - minX + 1;
const contentH = maxY - minY + 1;
const pad = Math.round(Math.max(contentW, contentH) * 0.07); // breathing room (~7%)
const side = Math.max(contentW, contentH) + pad * 2;
const offX = Math.floor((side - contentW) / 2);
const offY = Math.floor((side - contentH) / 2);

// --- build square, white-canvas output ---
const out = Buffer.alloc(side * side * 3, 255);
for (let y = 0; y < contentH; y++) {
  for (let x = 0; x < contentW; x++) {
    const c = at(minX + x, minY + y);
    const d = ((offY + y) * side + (offX + x)) * 3;
    out[d] = c[0];
    out[d + 1] = c[1];
    out[d + 2] = c[2];
  }
}

// --- write PNG (RGB, filter 0) ---
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (b) => {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = crcTable[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const o = Buffer.alloc(12 + data.length);
  o.writeUInt32BE(data.length, 0);
  o.write(type, 4, 'ascii');
  data.copy(o, 8);
  o.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])), 8 + data.length);
  return o;
};
const raw = Buffer.alloc(side * (1 + side * 3));
for (let y = 0; y < side; y++) {
  raw[y * (1 + side * 3)] = 0;
  for (let x = 0; x < side; x++) {
    const s = (y * side + x) * 3;
    const d = y * (1 + side * 3) + 1 + x * 3;
    raw[d] = out[s];
    raw[d + 1] = out[s + 1];
    raw[d + 2] = out[s + 2];
  }
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(side, 0);
ihdr.writeUInt32BE(side, 4);
ihdr[8] = 8;
ihdr[9] = 2;
fs.writeFileSync(
  input,
  Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
);
console.log(`Wrote square ${side}x${side} → ${input}`);

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
// --- circular restoration & RGBA generation ---
const targetSize = 400;
const targetCenter = targetSize / 2;
const targetRadius = 188;

const srcCx = 174.5;
const srcCy = 177.5;
const srcRx = 150.25;
const srcRy = 129.75;

function getSrcPixel(x, y) {
  x = Math.max(0, Math.min(width - 1, x));
  y = Math.max(0, Math.min(height - 1, y));
  const idx = (y * width + x) * bpp;
  return [rgb[idx], rgb[idx + 1], rgb[idx + 2]];
}

function sampleBilinear(x, y) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = x0 + 1;
  const y1 = y0 + 1;
  const fx = x - x0;
  const fy = y - y0;

  const p00 = getSrcPixel(x0, y0);
  const p10 = getSrcPixel(x1, y0);
  const p01 = getSrcPixel(x0, y1);
  const p11 = getSrcPixel(x1, y1);

  const r = (1 - fx) * (1 - fy) * p00[0] + fx * (1 - fy) * p10[0] + (1 - fx) * fy * p01[0] + fx * fy * p11[0];
  const g = (1 - fx) * (1 - fy) * p00[1] + fx * (1 - fy) * p10[1] + (1 - fx) * fy * p01[1] + fx * fy * p11[1];
  const b = (1 - fx) * (1 - fy) * p00[2] + fx * (1 - fy) * p10[2] + (1 - fx) * fy * p01[2] + fx * fy * p11[2];

  return [Math.round(r), Math.round(g), Math.round(b)];
}

const outRgba = Buffer.alloc(targetSize * targetSize * 4);

for (let ty = 0; ty < targetSize; ty++) {
  for (let tx = 0; tx < targetSize; tx++) {
    const dx = (tx + 0.5) - targetCenter;
    const dy = (ty + 0.5) - targetCenter;
    const dist = Math.hypot(dx, dy);
    const outIdx = (ty * targetSize + tx) * 4;

    if (dist > targetRadius + 1.2) {
      outRgba[outIdx] = 0;
      outRgba[outIdx + 1] = 0;
      outRgba[outIdx + 2] = 0;
      outRgba[outIdx + 3] = 0;
      continue;
    }

    let alpha = 1.0;
    if (dist > targetRadius - 0.8) {
      alpha = Math.max(0, Math.min(1, 0.5 - (dist - targetRadius) / 1.6));
    }

    const norm = dist / targetRadius;
    const clampedNorm = Math.min(norm, 0.992);
    const angle = Math.atan2(dy, dx);

    const u = Math.cos(angle) * clampedNorm;
    const v = Math.sin(angle) * clampedNorm;

    const sx = srcCx + u * srcRx;
    const sy = srcCy + v * srcRy;

    const [r, g, b] = sampleBilinear(sx, sy);

    outRgba[outIdx] = r;
    outRgba[outIdx + 1] = g;
    outRgba[outIdx + 2] = b;
    outRgba[outIdx + 3] = Math.round(alpha * 255);
  }
}

// --- write PNG (RGBA, colorType 6) ---
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
const raw = Buffer.alloc(targetSize * (1 + targetSize * 4));
for (let y = 0; y < targetSize; y++) {
  raw[y * (1 + targetSize * 4)] = 0;
  for (let x = 0; x < targetSize; x++) {
    const s = (y * targetSize + x) * 4;
    const d = y * (1 + targetSize * 4) + 1 + x * 4;
    raw[d] = outRgba[s];
    raw[d + 1] = outRgba[s + 1];
    raw[d + 2] = outRgba[s + 2];
    raw[d + 3] = outRgba[s + 3];
  }
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(targetSize, 0);
ihdr.writeUInt32BE(targetSize, 4);
ihdr[8] = 8;
ihdr[9] = 6;
fs.writeFileSync(
  input,
  Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
);
console.log(`Wrote circular RGBA ${targetSize}x${targetSize} → ${input}`);

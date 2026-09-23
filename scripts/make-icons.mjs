/**
 * Rasterizes the Cortico mark (white C and two ring eyes on the brand green, rounded square) into
 * app/icons: icon.png (512), icon.ico (16–256, PNG-compressed entries), tray.png (32) and
 * tray@2x.png (64). Geometry is the logo's own: C radius 84 stroke 30 opening ±50°, eyes at
 * (113,117) and (163,117) radius 16 stroke 11, drawn at translate(20 12) scale(.84) on a 256 tile
 * with corner radius 56. Each pixel averages a 4×4 grid of samples.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync, crc32 } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('../app/icons/', import.meta.url));
const GREEN = [0x00, 0xa8, 0x70];

function coverage(x, y, { tile }) {
  // tile coordinates 0..256
  if (tile) {
    const r = 56, cx = Math.min(Math.max(x, r), 256 - r), cy = Math.min(Math.max(y, r), 256 - r);
    if (x < 0 || y < 0 || x > 256 || y > 256 || Math.hypot(x - cx, y - cy) > r) return 0;
  }
  return 1;
}

function isMark(x, y) {
  const u = (x - 20) / 0.84, v = (y - 12) / 0.84;
  const d = Math.hypot(u - 128, v - 128);
  const a = Math.atan2(128 - v, u - 128) * 180 / Math.PI;
  if (Math.abs(d - 84) <= 15 && Math.abs(a) >= 50) return true;
  for (const t of [50, -50]) {
    const ex = 128 + 84 * Math.cos(t * Math.PI / 180), ey = 128 - 84 * Math.sin(t * Math.PI / 180);
    if (Math.hypot(u - ex, v - ey) <= 15) return true;
  }
  for (const [cx, cy] of [[113, 117], [163, 117]]) if (Math.abs(Math.hypot(u - cx, v - cy) - 16) <= 5.5) return true;
  return false;
}

function render(size, tile = true) {
  const px = Buffer.alloc(size * size * 4);
  const n = 4;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let inside = 0, white = 0;
    for (let sy = 0; sy < n; sy++) for (let sx = 0; sx < n; sx++) {
      const X = (x + (sx + .5) / n) / size * 256, Y = (y + (sy + .5) / n) / size * 256;
      if (!coverage(X, Y, { tile })) continue;
      inside++;
      if (isMark(X, Y)) white++;
    }
    const i = (y * size + x) * 4, total = n * n;
    if (!inside) continue;
    const w = white / inside;
    px[i] = Math.round(GREEN[0] + (255 - GREEN[0]) * w);
    px[i + 1] = Math.round(GREEN[1] + (255 - GREEN[1]) * w);
    px[i + 2] = Math.round(GREEN[2] + (255 - GREEN[2]) * w);
    px[i + 3] = Math.round(255 * inside / total);
  }
  return px;
}

function png(size, rgba) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) { raw[y * (size * 4 + 1)] = 0; rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4); }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

function ico(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(images.length, 4);
  const dir = Buffer.alloc(16 * images.length);
  let offset = 6 + dir.length;
  images.forEach(({ size, data }, i) => {
    const o = i * 16;
    dir[o] = size >= 256 ? 0 : size; dir[o + 1] = size >= 256 ? 0 : size;
    dir.writeUInt16LE(1, o + 4); dir.writeUInt16LE(32, o + 6);
    dir.writeUInt32LE(data.length, o + 8); dir.writeUInt32LE(offset, o + 12);
    offset += data.length;
  });
  return Buffer.concat([header, dir, ...images.map((im) => im.data)]);
}

mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}icon.png`, png(512, render(512)));
writeFileSync(`${OUT}icon.ico`, ico([16, 24, 32, 48, 64, 128, 256].map((size) => ({ size, data: png(size, render(size)) }))));
writeFileSync(`${OUT}tray.png`, png(32, render(32)));
writeFileSync(`${OUT}tray@2x.png`, png(64, render(64)));
console.log('icons →', OUT);

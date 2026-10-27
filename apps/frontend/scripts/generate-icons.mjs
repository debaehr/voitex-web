import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";

const bars = [[22, 43], [68, 73], [114, 102], [160, 73], [206, 43]];
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const name = Buffer.from(type), length = Buffer.alloc(4), crc = Buffer.alloc(4);
  length.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, crc]);
}
export function renderIcon(size, maskable = false) {
  const samples = 4;
  // Preserve the original's ~83% width for ordinary icons; center its optical bounding box.
  // The maskable width is 63%, so even the bounding-box corners fit the circular safe zone.
  const scale = size * (maskable ? 0.63 / 212 : 1 / 256);
  const pixels = Buffer.alloc((1 + size * 3) * size, 255);
  for (let y = 0; y < size; y++) {
    const row = y * (1 + size * 3); pixels[row] = 0;
    for (let x = 0; x < size; x++) {
      let coverage = 0;
      for (let sy = 0; sy < samples; sy++) for (let sx = 0; sx < samples; sx++) {
        const gx = (x + (sx + 0.5) / samples - size / 2) / scale + 128;
        const gy = (y + (sy + 0.5) / samples - size / 2) / scale + 124.5;
        if (bars.some(([bx, by]) => {
          const cy = Math.max(by + 14, Math.min(by + 90, gy));
          return (gx - bx - 14) ** 2 + (gy - cy) ** 2 <= 14 ** 2;
        })) coverage++;
      }
      const value = Math.round(255 * (1 - coverage / (samples * samples)));
      pixels.fill(value, row + 1 + x * 3, row + 1 + x * 3 + 3);
    }
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(size); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", deflateSync(pixels)), chunk("IEND", Buffer.alloc(0))]);
}
export function generateIcons(directory = fileURLToPath(new URL("../public/", import.meta.url))) {
  mkdirSync(directory, { recursive: true });
  for (const [name, size, maskable] of [
    ["icon-192.png", 192, false], ["icon-512.png", 512, false], ["apple-touch-icon.png", 180, false],
    ["icon-maskable-192.png", 192, true], ["icon-maskable-512.png", 512, true]
  ]) writeFileSync(resolve(directory, name), renderIcon(size, maskable));
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) generateIcons(process.argv[2]);

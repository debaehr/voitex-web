import { expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inflateSync } from "node:zlib";
import { generateIcons } from "../scripts/generate-icons.mjs";

it("reproducibly generates all PNG sizes with opaque white backgrounds and safe maskable bounds", () => {
  const dir = mkdtempSync(join(tmpdir(), "voitex-icons-"));
  try {
    generateIcons(dir);
    for (const [name, size, maskable] of [["icon-192.png", 192, false], ["icon-512.png", 512, false], ["apple-touch-icon.png", 180, false], ["icon-maskable-192.png", 192, true], ["icon-maskable-512.png", 512, true]] as const) {
      const png = readFileSync(join(dir, name));
      expect(png.equals(readFileSync(new URL(`../public/${name}`, import.meta.url)))).toBe(true);
      expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      expect(png.toString("ascii", 12, 16)).toBe("IHDR");
      expect(png.readUInt32BE(16)).toBe(size); expect(png.readUInt32BE(20)).toBe(size);
      expect(png[25]).toBe(2); // RGB has no transparency.
      const chunks: Buffer[] = [];
      for (let offset = 8; offset < png.length;) {
        const length = png.readUInt32BE(offset);
        if (png.toString("ascii", offset + 4, offset + 8) === "IDAT") chunks.push(png.subarray(offset + 8, offset + 8 + length));
        offset += 12 + length;
      }
      const pixels = inflateSync(Buffer.concat(chunks));
      expect(pixels.subarray(1, 4)).toEqual(Buffer.from([255, 255, 255]));
      let left = size, right = 0, top = size, bottom = 0, antialias = false;
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const value = pixels[y * (1 + size * 3) + 1 + x * 3];
        if (value < 255) {
          left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
          if (value > 0) antialias = true;
          if (maskable) expect(Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2)).toBeLessThan(size * 0.4);
        }
      }
      expect(antialias).toBe(true);
      expect(Math.abs((right - left + 1) - size * (maskable ? 0.63 : 212 / 256))).toBeLessThanOrEqual(2);
      expect(Math.abs((top + bottom + 1) / 2 - size / 2)).toBeLessThanOrEqual(0.5);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

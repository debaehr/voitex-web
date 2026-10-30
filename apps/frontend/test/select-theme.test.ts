import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("gives native select popups theme colors and mutes disabled entries", () => {
  const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  expect(css).toMatch(/select option,\s*select optgroup\s*\{\s*background-color: var\(--card\);\s*color: var\(--card-foreground\);\s*\}/);
  expect(css).toMatch(/select option:disabled,\s*select optgroup:disabled,\s*select optgroup:disabled option\s*\{\s*color: var\(--muted-foreground\);\s*\}/);
});

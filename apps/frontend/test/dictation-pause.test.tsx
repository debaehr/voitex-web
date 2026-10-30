import { afterEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { OverlayBar } from "../src/components/OverlayBar";
import { mergeWithDefaults } from "../src/lib/settings";
import type { Settings } from "../src/lib/types";
const props = {
  languages: [{ id: "de", label: "Deutsch" }], language: "de", onLanguageChange: vi.fn(),
  targetLanguage: "source" as const, onTargetLanguageChange: vi.fn(),
  modes: [{ id: "formal", label: "Formal" }], mode: "formal", onModeChange: vi.fn(),
  recording: true, paused: false, pauseSupported: true, dictationSpacePause: true,
  elapsedSeconds: 10, levels: [1], busyText: null, message: null,
  onStart: vi.fn(), onStop: vi.fn(), onPauseToggle: vi.fn(),
  interrupted: false, onDiscard: vi.fn(),
};
afterEach(() => vi.clearAllMocks());
it("shows pause, then frozen clock and resume with locked selectors", () => {
  expect(renderToStaticMarkup(<OverlayBar {...props} />)).toContain("Diktat pausieren");
  const html = renderToStaticMarkup(<OverlayBar {...props} paused />);
  expect(html).toContain("Pausiert"); expect(html).toContain("0:10");
  expect(html).toContain("Diktat fortsetzen"); expect(html).toContain("Aufnahme beenden");
  expect(html).not.toContain("overlay-wave"); expect(html).not.toContain("Modus wählen");
});
it("hides pause without recorder support", () => {
  expect(renderToStaticMarkup(<OverlayBar {...props} pauseSupported={false} />)).not.toContain("Diktat pausieren");
});
it("offers processing and discarding an interrupted recording", () => {
  const html = renderToStaticMarkup(<OverlayBar {...props} recording={false} interrupted />);
  expect(html).toContain("Aufnahme wurde unterbrochen");
  expect(html).toContain("Bisherige Aufnahme verarbeiten"); expect(html).toContain("Verwerfen");
  expect(html).not.toContain("Diktat starten");
});
it("merges legacy, valid and invalid space pause settings", () => {
  const defaults = { providers: {}, prompts: {}, lexicon: [], snippets: [], dictationSpacePause: false } as unknown as Settings;
  expect(mergeWithDefaults({}, defaults).dictationSpacePause).toBe(false);
  expect(mergeWithDefaults({ dictationSpacePause: true }, defaults).dictationSpacePause).toBe(true);
  expect(mergeWithDefaults({ dictationSpacePause: "true" }, defaults).dictationSpacePause).toBe(false);
});

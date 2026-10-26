import { describe, it, expect, vi } from "vitest";
import { runDictation, type DictationApi } from "../src/lib/dictation";
import { normalizeLevel, isLongEnough, recorderError } from "../src/lib/recorder";
import type { Settings } from "../src/lib/types";
const settings = {
  providers: { original: "openai", formal: "groq" },
  prompts: { original: "Clean", formal: "Formal" },
  lexicon: [{ id: "l", spoken: "foitex", correct: "Voitex" }],
  snippets: [{ id: "s", trigger: "Voitex", text: "Snippet content" }],
} as Settings;
const fake = () => ({
  transcribe: vi.fn<DictationApi["transcribe"]>(async () => ({ transcript: "raw", provider: "OpenAI" })),
  process: vi.fn<DictationApi["process"]>(async () => ({ processed: "Final", provider: "OpenAI" })),
});
describe("dictation", () => {
  it("rejects short and invalid durations before requests", async () => {
    for (const durationSeconds of [0, 0.49, NaN, Infinity]) {
      const api = fake();
      await expect(runDictation({ audio: new Blob(), durationSeconds, mode: "original", language: "auto", settings, api })).rejects.toThrow("Aufnahme zu kurz");
      expect(api.transcribe).not.toHaveBeenCalled();
    }
    expect(isLongEnough(0.5)).toBe(true);
  });
  it("uses processed original text, recording metadata, prompt and stages", async () => {
    const api = fake(), onStage = vi.fn();
    const result = await runDictation({ audio: new Blob(), durationSeconds: 2, mode: "original", language: "auto", settings, api, onStage });
    expect(result).toEqual({ text: "Final", raw: "raw", provider: "OpenAI", mode: "original", durationSeconds: 2 });
    expect(api.transcribe).toHaveBeenCalledWith(expect.objectContaining({ prompt: "Voitex", language: "auto", provider: "openai" }));
    expect(api.process).toHaveBeenCalledWith(expect.objectContaining({ instructions: "Clean", mode: "original" }));
    expect(onStage.mock.calls.flat()).toEqual(["Transkribiere …", "Bearbeite …"]);
  });
  it("applies lexicon before whole-transcript snippet matching and skips LLM", async () => {
    const api = fake(); api.transcribe.mockResolvedValue({ transcript: "Foitex!", provider: "OpenAI" });
    const result = await runDictation({ audio: new Blob(), durationSeconds: 1, mode: "original", language: "de", settings, api });
    expect(result.text).toBe("Snippet content"); expect(result.raw).toBe("Foitex!"); expect(api.process).not.toHaveBeenCalled();
  });
  it("processes corrected partial matches and omits prompt for other providers", async () => {
    const api = fake(); api.transcribe.mockResolvedValue({ transcript: "Hallo foitex", provider: "Groq" });
    await runDictation({ audio: new Blob(), durationSeconds: 1, mode: "formal", language: "en", settings, api });
    expect(api.transcribe.mock.calls[0][0]).not.toHaveProperty("prompt");
    expect(api.process).toHaveBeenCalledWith(expect.objectContaining({ transcript: "Hallo Voitex", provider: "groq", instructions: "Formal" }));
  });
  it("limits lexicon prompts to the backend limit", async () => {
    const api = fake();
    await runDictation({ audio: new Blob(), durationSeconds: 1, mode: "original", language: "de",
      settings: { ...settings, lexicon: [{ id: "long", correct: "x".repeat(1200), spoken: "" }] }, api });
    expect(api.transcribe.mock.calls[0][0].prompt).toHaveLength(1000);
  });
  it("rejects empty transcripts and processing results, propagates API errors", async () => {
    const api = fake(); api.transcribe.mockResolvedValue({ transcript: "  ", provider: "OpenAI" });
    const input = { audio: new Blob(), durationSeconds: 1, mode: "original" as const, language: "de", settings, api };
    await expect(runDictation(input)).rejects.toThrow("Kein verwertbarer Text erkannt — bitte erneut versuchen.");
    expect(api.process).not.toHaveBeenCalled();
    api.transcribe.mockRejectedValue(new Error("Network"));
    await expect(runDictation(input)).rejects.toThrow("Network");
    api.transcribe.mockResolvedValue({ transcript: "raw", provider: "OpenAI" });
    api.process.mockRejectedValue(new Error("Provider"));
    await expect(runDictation(input)).rejects.toThrow("Provider");
    api.process.mockResolvedValue({ processed: "", provider: "OpenAI" });
    await expect(runDictation(input)).rejects.toThrow("Kein verwertbarer Text erkannt");
  });
});
it("normalizes silent and loud audio into 0..1 levels", () => {
  expect(normalizeLevel(new Uint8Array([128, 128]))).toBe(0);
  expect(normalizeLevel(new Uint8Array())).toBe(0);
  expect(normalizeLevel(new Uint8Array([0, 255]))).toBe(1);
  expect(normalizeLevel(new Uint8Array([140, 120]))).toBeGreaterThan(0);
});
it("explains permission and device errors", () => {
  expect(recorderError({ name: "NotAllowedError" })).toContain("verweigert");
  expect(recorderError({ name: "NotFoundError" })).toContain("Kein Mikrofon");
});

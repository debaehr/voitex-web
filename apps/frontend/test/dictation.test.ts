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
  translate: vi.fn<DictationApi["translate"]>(async () => ({ translated: "Translated", provider: "Groq", model: "test" })),
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
    expect(result).toEqual({ text: "Final", raw: "raw", provider: "OpenAI", mode: "original", modeLabel: "Original", durationSeconds: 2 });
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

it.each(["de", "en", "hr"] as const)("passes target %s through one process call and retains result metadata", async targetLanguage => {
  const api = fake();
  const result = await runDictation({ audio: new Blob(), durationSeconds: 2, mode: "formal", language: "de", targetLanguage, settings, api });
  expect(api.process).toHaveBeenCalledExactlyOnceWith({ transcript: "raw", mode: "formal", provider: "groq", instructions: "Formal", targetLanguage });
  expect(api.translate).not.toHaveBeenCalled();
  expect(result).toMatchObject({ targetLanguage, mode: "formal", text: "Final" });
});
it("translates corrected snippet hits with the mode provider, preserving snippet input", async () => {
  const api = fake(), onStage = vi.fn();
  api.transcribe.mockResolvedValue({ transcript: "foitex!", provider: "OpenAI" });
  const text = "Ana\nhttps://example.com/{id}\n{{placeholder}}";
  const result = await runDictation({ audio: new Blob(), durationSeconds: 1, mode: "formal", language: "de", targetLanguage: "hr",
    settings: { ...settings, snippets: [{ id: "s", trigger: "Voitex", text }] }, api, onStage });
  expect(api.translate).toHaveBeenCalledExactlyOnceWith({ text, targetLanguage: "hr", provider: "groq" });
  expect(api.process).not.toHaveBeenCalled();
  expect(result).toMatchObject({ text: "Translated", raw: "foitex!", targetLanguage: "hr", provider: "Groq", mode: "formal" });
  expect(onStage.mock.calls.flat()).toEqual(["Transkribiere …", "Übersetze …"]);
});
it("keeps source snippets unchanged without either LLM call", async () => {
  const api = fake(); api.transcribe.mockResolvedValue({ transcript: "foitex", provider: "OpenAI" });
  const result = await runDictation({ audio: new Blob(), durationSeconds: 1, mode: "original", language: "de", targetLanguage: "source", settings, api });
  expect(result.text).toBe("Snippet content");
  expect(api.translate).not.toHaveBeenCalled(); expect(api.process).not.toHaveBeenCalled();
});
it("rejects empty translation and propagates failures without falling back to process", async () => {
  const api = fake(); api.transcribe.mockResolvedValue({ transcript: "foitex", provider: "OpenAI" });
  const input = { audio: new Blob(), durationSeconds: 1, mode: "formal" as const, language: "de", targetLanguage: "en" as const, settings, api };
  api.translate.mockResolvedValue({ translated: " ", provider: "Groq", model: "test" });
  await expect(runDictation(input)).rejects.toThrow("Kein verwertbarer Text erkannt");
  api.translate.mockRejectedValue(new Error("Translation failed"));
  await expect(runDictation(input)).rejects.toThrow("Translation failed");
  expect(api.process).not.toHaveBeenCalled();
});
it("uses the starting target while transcription is in flight", async () => {
  const api = fake();
  let resolve!: (value: { transcript: string; provider: string }) => void;
  api.transcribe.mockImplementation(() => new Promise(done => { resolve = done; }));
  const options = { mode: "formal" as const, language: "de", targetLanguage: "hr" as "hr" | "en", settings };
  const pending = runDictation({ audio: new Blob(), durationSeconds: 1, ...options, api });
  options.targetLanguage = "en";
  resolve({ transcript: "raw", provider: "Groq" });
  expect((await pending).targetLanguage).toBe("hr");
  expect(api.process).toHaveBeenCalledWith(expect.objectContaining({ targetLanguage: "hr" }));
});

it.each([{ sttProviders: ["mistral", "openai"] }, { sttProviders: ["openai"] }])("uses available STT $sttProviders for Claude modes and preserves result model", async ({ sttProviders }) => {
  const api = fake();
  api.process.mockResolvedValue({ processed: "Final", provider: "Claude", model: "actual-model" });
  const result = await runDictation({ audio: new Blob(), durationSeconds: 1, mode: "formal", language: "de", targetLanguage: "hr",
    settings: { ...settings, providers: { ...settings.providers, formal: "anthropic" } }, sttProviders, api });
  const provider = sttProviders.includes("mistral") ? "mistral" : "openai";
  expect(api.transcribe).toHaveBeenCalledWith(expect.objectContaining({ provider }));
  expect(api.process).toHaveBeenCalledWith(expect.objectContaining({ provider: "anthropic", targetLanguage: "hr" }));
  expect(result.provider).toBe("Claude · actual-model");
});
it("uses Claude for custom modes and snippet translation", async () => {
  const api = fake();
  api.transcribe.mockResolvedValue({ transcript: "foitex", provider: "Mistral" });
  api.translate.mockResolvedValue({ translated: "Translated", provider: "Claude", model: "fallback-model" });
  const result = await runDictation({ audio: new Blob(), durationSeconds: 1, mode: "custom-test", language: "de", targetLanguage: "en",
    settings: { ...settings, customModes: [{ id: "custom-test", label: "Custom", prompt: "Custom", provider: "anthropic" }] }, sttProviders: ["mistral"], api });
  expect(api.transcribe).toHaveBeenCalledWith(expect.objectContaining({ provider: "mistral", mode: "original" }));
  expect(api.translate).toHaveBeenCalledWith(expect.objectContaining({ provider: "anthropic" }));
  expect(result.provider).toBe("Claude · fallback-model");
});

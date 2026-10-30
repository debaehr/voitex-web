import { afterEach, expect, it, vi } from "vitest";
import { deriveModelSettings, validModelSettings } from "../src/model-settings.js";
import { defaultModel, modelCatalog, updateModels } from "../src/providers/models.js";
import { KeyStatus } from "../src/providers/key-status.js";

afterEach(() => { vi.unstubAllEnvs(); });
it.each(["mistral", "openai", "groq", "anthropic"])("derives legacy settings for %s without rewriting old fields", provider => {
  vi.stubEnv("MISTRAL_API_KEY", "test");
  const old = { providers: { original: provider, formal: "anthropic", meetings: "mistral" }, meetingFallback: true, extra: "preserved" };
  const result = deriveModelSettings(old);
  expect(result.dictationStt).toEqual({ provider: provider === "anthropic" ? "mistral" : provider, model: defaultModel(provider === "anthropic" ? "mistral" : provider, "stt") });
  if (provider === "groq") expect(result.dictationStt.model).toBe("whisper-large-v3");
  expect(result.dictationFallback).toBeNull();
  expect(result.meetingSttFallback).toEqual({ provider: "assemblyai", model: "universal-3-5-pro" });
  expect(result.models.formal).toBe("claude-sonnet-5-5");
  expect(result).toMatchObject(old); expect(old).not.toHaveProperty("models");
});
it("uses OpenAI for legacy Claude STT without a Mistral key and respects env defaults", () => {
  vi.stubEnv("MISTRAL_API_KEY", ""); vi.stubEnv("ANTHROPIC_CHAT_MODEL", "claude-custom");
  vi.stubEnv("MISTRAL_MEETING_MODEL", "voxtral-custom-transcribe-4"); vi.stubEnv("ASSEMBLYAI_MEETING_MODEL", "universal-2");
  const result = deriveModelSettings({ providers: { original: "anthropic" } });
  expect(result.dictationStt).toEqual({ provider: "openai", model: "gpt-4o-mini-transcribe" });
  expect(result.meetingStt.model).toBe("voxtral-custom-transcribe-4");
  expect(result.meetingSttFallback).toBeNull(); expect(result.models.original).toBe("claude-custom");
});
it("validates additive fields, arbitrary safe IDs, explicit nulls and provider capabilities", () => {
  expect(validModelSettings({})).toBe(true);
  expect(validModelSettings({ models: { formal: "future-model:1" }, dictationFallback: null, meetingSttFallback: null })).toBe(true);
  for (const value of ["", "../secret", "https://evil", "a".repeat(101), 1, null]) {
    expect(validModelSettings({ models: { formal: value } })).toBe(false);
    expect(validModelSettings({ dictationStt: { provider: "mistral", model: value } })).toBe(false);
  }
  for (const fields of [
    { dictationStt: null }, { dictationStt: { provider: "anthropic", model: "x" } },
    { dictationStt: { provider: ["mistral"], model: "x" } },
    { dictationFallback: { provider: "assemblyai", model: "x" } },
    { meetingStt: { provider: "openai", model: "x" } },
    { meetingSttFallback: { provider: "mistral", model: "voxtral-mini-transcribe-3" } },
  ]) expect(validModelSettings(fields)).toBe(false);
});
it("filters live lists by task, retains defaults and never treats audio models as chat", () => {
  vi.stubEnv("OPENAI_API_KEY", "catalog-o"); vi.stubEnv("MISTRAL_API_KEY", "catalog-m"); vi.stubEnv("ANTHROPIC_API_KEY", "catalog-a");
  updateModels("openai", { data: ["gpt-5-mini", "gpt-4o-audio-preview", "gpt-4o-mini-search-preview", "gpt-image-1", "text-embedding-3-small", "gpt-4o-transcribe-next", "whisper-1", "o3"].map(id => ({ id })) });
  updateModels("mistral", { data: [{ id: "mistral-next", capabilities: { completion_chat: true } }, { id: "mistral-embed", capabilities: { completion_chat: false } }, { id: "voxtral-mini-transcribe-4" }, { id: "voxtral-mini-transcribe-realtime-3" }, { id: "voxtral-mini-2507", capabilities: { audio_transcription: true } }, { id: "mistral-ocr" }] });
  updateModels("anthropic", { data: [{ id: "claude-next" }, { id: "other" }] });
  const lists = modelCatalog();
  expect(lists.openai.chat.map(m => m.id)).toEqual(expect.arrayContaining(["gpt-5-mini", "o3", "gpt-4o-mini"]));
  expect(lists.openai.chat.some(m => /audio|search|image|embedding|transcribe/.test(m.id))).toBe(false);
  expect(lists.openai.stt.map(m => m.id)).toContain("gpt-4o-transcribe-next");
  expect(lists.mistral.chat.map(m => m.id)).toEqual(expect.arrayContaining(["mistral-next", "mistral-large-latest"]));
  expect(lists.mistral.chat.some(m => /embed|ocr|voxtral/.test(m.id))).toBe(false);
  expect(lists.mistral.meetings.every(m => m.id.includes("-transcribe-") && !m.id.includes("realtime"))).toBe(true);
  expect(lists.mistral.stt.map(m => m.id)).toContain("voxtral-mini-2507");
  expect(lists.anthropic.chat).toContainEqual({ id: "claude-next" });
  for (const [provider, tasks] of Object.entries(lists)) for (const [task, models] of Object.entries(tasks)) {
    if (models.length) expect(models).toContainEqual({ id: defaultModel(provider, task), default: true });
  }
});
it("refreshes lists during key checks and uses curated fallback after a failed refresh", async () => {
  vi.stubEnv("MISTRAL_API_KEY", "refresh-key");
  const fetch = vi.fn().mockResolvedValueOnce(Response.json({ data: [{ id: "mistral-new", capabilities: { completion_chat: true } }] })).mockRejectedValueOnce(new TypeError("offline"));
  const tracker = new KeyStatus({ keys: () => ({ mistral: "refresh-key" }), fetch });
  await tracker.check(); expect(modelCatalog().mistral.chat.map(m => m.id)).toContain("mistral-new");
  await tracker.check(); expect(modelCatalog().mistral.chat.map(m => m.id)).not.toContain("mistral-new");
  expect(modelCatalog().mistral.chat).toContainEqual({ id: "mistral-large-latest", default: true });
});

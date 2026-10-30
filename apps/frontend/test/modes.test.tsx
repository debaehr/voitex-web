import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { addCustomMode, availableDictationModes, customModeErrors, deleteMode, hasModeErrors, resolveMode, restoreBuiltinModes, updateCustomMode } from "../src/lib/modes";
import { mergeWithDefaults, isDirty } from "../src/lib/settings";
import { SettingsStore } from "../src/lib/settings-store";
import { readPreference } from "../src/lib/device-preferences";
import { api } from "../src/lib/api";
import { runDictation, snapshotDictationOptions, type DictationApi } from "../src/lib/dictation";
import { exportHistory, historyModeLabel, resultMeta } from "../src/lib/history";
import { ModesView } from "../src/views/ModesView";
import { OverlayBar } from "../src/components/OverlayBar";
import { SettingsView } from "../src/views/SettingsView";
import type { CustomMode, HistoryEntry, Settings } from "../src/lib/types";

const context = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
vi.mock("../src/lib/settings-context", () => ({
  useSettings: () => context.current,
  SettingsNotice: () => null,
}));
const providers = { original: "openai", casual: "openai", formal: "openai", coding: "openai", protocol: "openai", summary: "openai" } as const;
const defaults: Settings = { version: 1, providers: { ...providers }, prompts: { ...providers }, lexicon: [], snippets: [], ownSpeakerName: "Ich" };
const custom: CustomMode = { id: "custom-12345678-1234-1234-1234-123456789abc", label: "Kundenmail", description: "Antwort an Kunden", prompt: "Schreibe eine Kundenmail.", provider: "groq" };
const withCustom = (): Settings => mergeWithDefaults({ ...defaults, customModes: [custom] }, defaults);
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("mode drafts and available modes", () => {
  it("normalizes missing additive fields without altering old settings or defaults", () => {
    const before = structuredClone(defaults);
    expect(mergeWithDefaults(defaults, defaults)).toMatchObject({ ...defaults, customModes: [], hiddenModes: [] });
    expect(mergeWithDefaults(null, defaults).customModes).toEqual([]);
    expect(defaults).toEqual(before);
    expect(defaults).not.toHaveProperty("customModes");
  });
  it("creates, edits and removes custom modes only in the draft and detects every change", () => {
    const saved = mergeWithDefaults(defaults, defaults);
    const added = addCustomMode(saved);
    const mode = added.customModes![0];
    expect(mode).toMatchObject({ label: "", prompt: "", provider: "mistral" });
    expect(mode.id).toMatch(/^custom-[0-9a-f-]{36}$/);
    expect(isDirty(saved, added)).toBe(true);
    const edited = updateCustomMode(added, mode.id, { label: "Mail", description: "Customer", prompt: "Write mail", provider: "mistral" });
    expect(edited.customModes![0]).toEqual({ ...mode, label: "Mail", description: "Customer", prompt: "Write mail", provider: "mistral" });
    expect(isDirty(added, edited)).toBe(true);
    expect(saved.customModes).toEqual([]);
    expect(mode.label).toBe("");
    expect(isDirty(saved, deleteMode(edited, mode.id))).toBe(false);
    for (const changes of [{ description: "Other" }, { provider: "openai" as const }, { prompt: "Other" }, { label: "Other" }])
      expect(isDirty(edited, updateCustomMode(edited, mode.id, changes))).toBe(true);
  });
  it("uses fixed visible builtin order followed by creation order everywhere", () => {
    const settings = { ...withCustom(), hiddenModes: ["original", "coding"] as Settings["hiddenModes"],
      customModes: [custom, { ...custom, id: "custom-second", label: "Ticket" }] };
    const modes = availableDictationModes(settings);
    expect(modes.map(mode => mode.id)).toEqual(["casual", "formal", custom.id, "custom-second"]);
    const html = renderToStaticMarkup(<ModesView modes={modes} activeMode={custom.id} onModeChange={() => {}} />);
    expect(html).toContain(custom.description);
    expect(html).toMatch(/aria-pressed="true"[^]*?Kundenmail/);
    expect(html).not.toContain(">Coding<");
  });
  it("hides and restores builtin modes without losing edited prompts or providers", () => {
    const saved = { ...withCustom(), prompts: { ...defaults.prompts, formal: "Last edit" }, providers: { ...defaults.providers, formal: "mistral" as const } };
    const hidden = deleteMode(saved, "formal");
    expect(hidden.hiddenModes).toEqual(["formal"]);
    expect(isDirty(saved, hidden)).toBe(true);
    expect(availableDictationModes(hidden).map(mode => mode.id)).not.toContain("formal");
    expect(restoreBuiltinModes(hidden)).toEqual(saved);
    expect(availableDictationModes(restoreBuiltinModes(hidden)).find(mode => mode.id === "formal"))
      .toMatchObject({ prompt: "Last edit", provider: "mistral" });
  });
  it("protects the last builtin or custom mode and caps custom modes at 20", () => {
    const builtinOnly: Settings = { ...withCustom(), customModes: [], hiddenModes: ["original", "casual", "coding"] };
    expect(deleteMode(builtinOnly, "formal")).toBe(builtinOnly);
    const customOnly: Settings = { ...withCustom(), hiddenModes: ["original", "casual", "formal", "coding"] };
    expect(deleteMode(customOnly, custom.id)).toBe(customOnly);
    const full = { ...withCustom(), customModes: Array.from({ length: 20 }, (_, i) => ({ ...custom, id: `${i}`, label: `${i}` })) };
    expect(addCustomMode(full)).toBe(full);
  });
  it("keeps a saved custom preference and falls back after local or remote deletion", () => {
    const settings = withCustom();
    const modes = availableDictationModes(settings);
    vi.stubGlobal("localStorage", { getItem: () => custom.id });
    expect(readPreference("voitex-mode", modes.map(mode => mode.id), resolveMode("formal", modes))).toBe(custom.id);
    const deleted = deleteMode(settings, custom.id);
    expect(resolveMode(custom.id, availableDictationModes(deleted))).toBe("formal");
    const remotelyReloaded = mergeWithDefaults({ ...deleted, hiddenModes: ["formal", "original"] }, defaults);
    const remaining = availableDictationModes(remotelyReloaded);
    expect(resolveMode(custom.id, remaining)).toBe("casual");
    expect(readPreference("voitex-mode", remaining.map(mode => mode.id), resolveMode("formal", remaining))).toBe("casual");
    expect(resolveMode(custom.id, modes)).toBe(custom.id);
  });
});

describe("mode field validation", () => {
  it.each([
    [{ label: " " }, "label"], [{ label: "x".repeat(41) }, "label"],
    [{ description: "x".repeat(121) }, "description"],
    [{ prompt: " " }, "prompt"], [{ prompt: "x".repeat(8001) }, "prompt"],
  ] as const)("reports invalid %j before save", (changes, field) => {
    const mode = { ...custom, ...changes };
    expect(customModeErrors(mode, [mode])[field]).toBeTruthy();
    expect(hasModeErrors({ ...withCustom(), customModes: [mode] })).toBe(true);
  });
  it("rejects duplicate names ignoring case and surrounding whitespace, but excludes itself", () => {
    expect(customModeErrors(custom, [custom])).toEqual({});
    const duplicate = { ...custom, id: "other", label: " KUNDENMAIL " };
    expect(customModeErrors(duplicate, [custom, duplicate]).label).toContain("bereits verwendet");
    expect(customModeErrors({ ...custom, label: "x".repeat(40), description: "x".repeat(120), prompt: "x".repeat(8000) }, [])).toEqual({});
  });
  it("renders the validation notice and provider rows for available modes plus meetings", () => {
    vi.stubGlobal("window", { matchMedia: () => ({ matches: false }) });
    const invalid: Settings = { ...withCustom(), hiddenModes: ["original", "casual", "formal", "coding"], customModes: [{ ...custom, label: "", prompt: "" }] };
    context.current = { settings: invalid, defaults, providers: { llm: ["openai", "groq"] }, status: "ready", saving: false, save: vi.fn() };
    const html = renderToStaticMarkup(<SettingsView theme="light" onThemeChange={() => {}} onDirtyChange={() => {}} />);
    expect(html).toContain("Bitte die markierten Felder");
    expect(html).toMatch(/disabled=""[^>]*>Einstellungen speichern/);
    expect(html).toContain(`provider-${custom.id}`);
    expect(html).not.toContain('id="provider-formal"');
    expect(html).toContain('id="provider-protocol"');
    expect(html).toContain('id="provider-summary"');
  });
});

it("saves customModes and hiddenModes through the existing settings store and PUT", async () => {
  const fetch = vi.fn(async (_path: string, _init?: RequestInit) => new Response(JSON.stringify({ ok: true })));
  vi.stubGlobal("fetch", fetch);
  const store = new SettingsStore({ getProviders: async () => ({ stt: [], llm: [], meetings: [] }),
    getDefaults: async () => defaults, getSettings: async () => defaults, saveSettings: api.saveSettings });
  await store.load();
  const draft = deleteMode(withCustom(), "original");
  await store.save(draft);
  expect(fetch).toHaveBeenCalledExactlyOnceWith("/api/settings", expect.objectContaining({ method: "PUT" }));
  expect(JSON.parse(fetch.mock.calls[0][1]!.body as string)).toEqual(draft);
  expect(store.snapshot.settings).toEqual(draft);
});

const fake = () => ({
  transcribe: vi.fn<DictationApi["transcribe"]>(async () => ({ transcript: "raw", provider: "Groq" })),
  process: vi.fn<DictationApi["process"]>(async () => ({ processed: "Final", provider: "Groq" })),
  translate: vi.fn<DictationApi["translate"]>(async () => ({ translated: "Translated", provider: "Groq", model: null })),
});
it("uses a recorded custom snapshot despite editing or deletion, preserving target and lexicon", async () => {
  const settings = { ...withCustom(), lexicon: [{ id: "l", spoken: "raw", correct: "Corrected" }] };
  const snapshot = snapshotDictationOptions({ mode: custom.id, language: "de", targetLanguage: "hr", settings });
  settings.customModes![0].label = "Changed";
  settings.customModes![0].prompt = "Changed prompt";
  settings.customModes![0].provider = "mistral";
  settings.customModes = [];
  const api = fake();
  const result = await runDictation({ ...snapshot, audio: new Blob(), durationSeconds: 2, api });
  expect(api.transcribe).toHaveBeenCalledWith(expect.objectContaining({ mode: "original", provider: "openai", language: "de" }));
  expect(api.process).toHaveBeenCalledExactlyOnceWith({ transcript: "Corrected", mode: "original", provider: "groq", instructions: custom.prompt, targetLanguage: "hr", model: "llama-3.3-70b-versatile" });
  expect(result).toMatchObject({ mode: custom.id, modeLabel: "Kundenmail", targetLanguage: "hr", text: "Final" });
});
it("keeps the custom instructions and label stable during an in-flight transcription", async () => {
  const settings = withCustom(), api = fake();
  let finish!: (value: { transcript: string; provider: string }) => void;
  api.transcribe.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const pending = runDictation({ mode: custom.id, language: "de", targetLanguage: "source", settings, audio: new Blob(), durationSeconds: 1, api });
  settings.customModes![0].prompt = "Edited";
  settings.customModes![0].label = "Edited label";
  finish({ transcript: "raw", provider: "Groq" });
  expect((await pending).modeLabel).toBe(custom.label);
  expect(api.process).toHaveBeenCalledWith(expect.objectContaining({ instructions: custom.prompt }));
});
it.each(["source", "en"] as const)("keeps custom snippet handling intact for target %s", async targetLanguage => {
  const settings = { ...withCustom(), snippets: [{ id: "s", trigger: "raw", text: "Snippet\nURL/{id}" }] };
  const api = fake();
  const result = await runDictation({ mode: custom.id, language: "de", targetLanguage, settings, audio: new Blob(), durationSeconds: 1, api });
  expect(api.process).not.toHaveBeenCalled();
  expect(result.modeLabel).toBe(custom.label);
  if (targetLanguage === "source") {
    expect(api.translate).not.toHaveBeenCalled(); expect(result.text).toBe("Snippet\nURL/{id}");
  } else expect(api.translate).toHaveBeenCalledExactlyOnceWith({ text: "Snippet\nURL/{id}", targetLanguage, provider: "groq", model: "llama-3.3-70b-versatile" });
});
it("displays recorded custom labels in metadata and export even after deletion, with legacy fallbacks", () => {
  const entry: HistoryEntry = { id: "h", mode: custom.id, modeLabel: "Recorded name", provider: "Groq", targetLanguage: "hr", text: "Final", raw: "Raw", durationSeconds: 2, createdAt: "2026-10-27" };
  expect(historyModeLabel(entry)).toBe("Recorded name");
  expect(resultMeta(entry)).toBe("Recorded name · → HR · Groq · 2.0 s");
  expect(exportHistory([entry])).toContain("Recorded name · → HR");
  expect(historyModeLabel({ mode: "formal", modeLabel: "Ignored" })).toBe("Formal");
  expect(historyModeLabel({ mode: "unknown" })).toBe("Eigener Modus");
});
it("renders a long custom overlay label inside its truncation span with a full title", () => {
  const label = "K".repeat(40);
  const html = renderToStaticMarkup(<OverlayBar languages={[]} language="de" onLanguageChange={() => {}}
    targetLanguage="source" onTargetLanguageChange={() => {}} modes={[{ id: custom.id, label }]} mode={custom.id} onModeChange={() => {}}
    recording={false} elapsedSeconds={0} levels={[]} busyText={null} message={null} onStart={() => {}} onStop={() => {}} />);
  expect(html).toContain(`title="${label}"`);
  expect(html).toContain(`<span class="overlay-mode-label">${label}</span>`);
});

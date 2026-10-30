import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
const h = vi.hoisted(() => ({ slots: [] as any[], cursor: 0 }));
vi.mock("react", async original => ({ ...await original<any>(),
  useState: (initial: any) => { const i = h.cursor++; if (!(i in h.slots)) h.slots[i] = typeof initial === "function" ? initial() : initial; return [h.slots[i], (value: any) => { h.slots[i] = typeof value === "function" ? value(h.slots[i]) : value; }]; },
  useRef: (initial: any) => { const i = h.cursor++; return h.slots[i] ??= { current: initial }; },
}));
import { ProviderModelsCard } from "../src/components/ProviderModelsCard";
import { Select, Button } from "../src/components/ui";
import { api } from "../src/lib/api";
import { deriveModelSettings, modelRows, uniqueChecks, checkMessage } from "../src/lib/model-settings";
import { runDictation } from "../src/lib/dictation";
import { mergeWithDefaults } from "../src/lib/settings";
import { resultMeta } from "../src/lib/history";
import type { Providers, Settings } from "../src/lib/types";
const base: Settings = { version: 1, providers: { original: "mistral", casual: "mistral", formal: "mistral", coding: "mistral", protocol: "mistral", summary: "mistral" },
  prompts: { original: "Original", casual: "Casual", formal: "Formal", coding: "Coding", protocol: "Protocol", summary: "Summary" }, lexicon: [], snippets: [], ownSpeakerName: "Ich",
  customModes: [{ id: "custom-mail", label: "Mail", provider: "anthropic", prompt: "Mail" }],
};
const providers: Providers = { stt: ["mistral", "openai"], llm: ["mistral", "openai", "anthropic"], meetings: ["mistral", "assemblyai"], models: {
  mistral: { stt: [{ id: "voxtral-mini-latest", default: true }], chat: [{ id: "mistral-large-latest", default: true }], meetings: [{ id: "voxtral-mini-transcribe-3", default: true }] },
  openai: { stt: [{ id: "gpt-4o-mini-transcribe", default: true }, { id: "whisper-1" }], chat: [{ id: "gpt-5", default: true }] },
  anthropic: { chat: [{ id: "claude-sonnet-5-5", default: true }] }, assemblyai: { meetings: [{ id: "universal-3-5-pro", default: true }, { id: "universal-2" }] },
} };
let settings: Settings;
function all(node: any, match: (node: any) => boolean): any[] {
  if (!node || typeof node !== "object") return [];
  return [...(match(node) ? [node] : []), ...[node.props?.children].flat(Infinity).flatMap(child => all(child, match))];
}
function render() { h.cursor = 0; return ProviderModelsCard({ settings, providers, onChange: next => { settings = next; } }); }
function select(id: string) { return all(render(), n => n.type === Select && n.props.id === id)[0].props; }
function change(id: string, value: string) { select(id).onChange({ target: { value } }); }
function texts(node: any): string { return typeof node === "string" || typeof node === "number" ? String(node) : [node?.props?.children].flat(Infinity).filter(v => v != null && v !== false).map(texts).join(" ").replace(/\s+/g, " ").replace(/ +([:.,])/g, "$1"); }
function button() { return all(render(), n => n.type === Button)[0].props; }
beforeEach(() => { h.slots = []; h.cursor = 0; settings = deriveModelSettings(structuredClone(base), providers); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it("renders the approved grouping and every builtin, custom and meeting row with label/provider/model/status", () => {
  const tree = render(), copy = texts(tree);
  for (const title of ["Anbieter und Modelle", "Diktat", "Nachbearbeitung je Modus", "Meetings und Transkript-Upload", "Spracherkennung mit Sprechertrennung", "Protokoll (aufgenommene Meetings)", "Zusammenfassung (hochgeladene Dateien)", "Mail"]) expect(copy).toContain(title);
  const rows = all(tree, n => n.props?.className === "provider-model-row"); expect(rows).toHaveLength(11);
  for (const row of rows) { expect(all(row, n => n.type === Select)).toHaveLength(2); expect(all(row, n => n.props?.role === "status")).toHaveLength(1); }
  for (const row of rows) {
    const label = texts(all(row, n => n.type === "label")[0]);
    for (const control of all(row, n => n.type === Select)) expect(control.props["aria-label"]).toContain(label);
  }
});
it("switches the model list and default with provider and retains removed saved models", () => {
  change("provider-formal", "openai"); expect(select("model-formal").value).toBe("gpt-5");
  expect(texts(all(render(), n => n.type === Select && n.props.id === "model-formal")[0])).toContain("gpt-5");
  settings.models!.formal = "retired-model";
  expect(texts(all(render(), n => n.props?.id === "model-formal")[0])).toContain("retired-model (nicht mehr angeboten)");
});
it("provides explicit fallback selections and shows the US notice only for a US fallback", () => {
  expect(select("provider-dictation-fallback").value).toBe("none");
  expect(select("model-dictation-fallback").disabled).toBe(true);
  change("provider-dictation-fallback", "openai");
  change("provider-meeting-fallback", "assemblyai");
  expect(texts(render()).match(/Bei Ausweiche geht das Audio an einen US-Anbieter./g)).toHaveLength(2);
  expect(settings.meetingFallback).toBe(true);
  change("provider-dictation-fallback", "none"); expect(settings.dictationFallback).toBeNull();
});
it("sends unsaved values once per pair, disables the button and reports status and affected rows", async () => {
  change("provider-formal", "openai"); change("provider-dictation-fallback", "openai");
  let finish!: (value: any) => void;
  const request = vi.fn(() => new Promise(resolve => { finish = resolve; })); vi.stubGlobal("fetch", request);
  button().onClick(); expect(button().disabled).toBe(true); expect(button().children).toBe("Prüfe …");
  const init = request.mock.calls[0][1] as RequestInit;
  const checks = JSON.parse(init.body as string).checks;
  expect(checks).toEqual(uniqueChecks(modelRows(settings, providers))); expect(checks.filter((item: any) => item.model === "mistral-large-latest")).toHaveLength(1);
  expect(checks).toContainEqual({ provider: "openai", model: "gpt-5" });
  finish(Response.json({ results: checks.map((check: any) => ({ ...check, ok: check.model !== "gpt-5", ...(check.model === "gpt-5" ? { reason: "model_unavailable" } : {}) })) }));
  await vi.waitFor(() => expect(button().disabled).toBe(false));
  expect(texts(render())).toContain("1 Probleme"); expect(texts(render())).toContain("OpenAI · gpt-5: Modell nicht verfügbar. Betrifft: Diktat Formal");
  expect(all(render(), n => n.props?.["aria-label"] === "Diktat Formal: Modell nicht verfügbar")).toHaveLength(1);
  change("model-formal", "old-model");
  expect(all(render(), n => n.props?.["aria-label"] === "Diktat Formal: Nicht geprüft")).toHaveLength(1);
  expect(texts(render())).not.toContain("1 Probleme");
});
it("expires changed rows even if their check completes late and they return to the old value", async () => {
  let finish!: (value: any) => void;
  vi.spyOn(api, "checkProviders").mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  button().onClick(); const checks = uniqueChecks(modelRows(settings, providers));
  change("provider-formal", "openai"); change("provider-formal", "mistral");
  finish({ results: checks.map(check => ({ ...check, ok: true })) });
  await vi.waitFor(() => expect(button().disabled).toBe(false));
  expect(all(render(), n => n.props?.["aria-label"] === "Diktat Formal: Nicht geprüft")).toHaveLength(1);
  expect(texts(render())).not.toContain("Alle Anbieter erreichbar");
});
it("reports all green and maps only safe German reasons", async () => {
  vi.spyOn(api, "checkProviders").mockImplementation(async checks => ({ results: checks.map(check => ({ ...check, ok: true })) }));
  button().onClick(); await vi.waitFor(() => expect(button().disabled).toBe(false));
  expect(texts(render())).toMatch(/Alle Anbieter erreichbar · geprüft \d\d:\d\d/);
  for (const [reason, text] of [["invalid_key", "Schlüssel ungültig"], ["timeout", "keine Antwort (Zeitüberschreitung)"], ["network", "nicht erreichbar"], ["http_503", "Fehler HTTP 503"], ["secret", "nicht erreichbar"]]) expect(checkMessage(reason)).toBe(text);
});
it("derives legacy selections with server-provided env model defaults and explicit null wins over old switch", () => {
  const old = { ...base, providers: { ...base.providers, original: "anthropic" as const }, meetingFallback: true };
  const merged = mergeWithDefaults(old, { ...base, dictationStt: { provider: "mistral", model: "wrong-default" } }, { ...providers, stt: ["openai"] });
  expect(merged.dictationStt).toEqual({ provider: "openai", model: "gpt-4o-mini-transcribe" });
  expect(merged.dictationFallback).toBeNull(); expect(merged.meetingSttFallback?.provider).toBe("assemblyai");
  expect(mergeWithDefaults({ ...old, meetingSttFallback: null }, base, providers).meetingSttFallback).toBeNull();
});
it("uses independent STT and chosen text model and retains actual fallback metadata in result/history", async () => {
  settings.dictationStt = { provider: "mistral", model: "voxtral-mini-transcribe-3" };
  settings.dictationFallback = { provider: "openai", model: "whisper-1" };
  settings.models!.formal = "mistral-small-latest";
  const api = { transcribe: vi.fn(async () => ({ transcript: "Text", provider: "OpenAI", model: "whisper-1" })), process: vi.fn(async () => ({ processed: "Final", provider: "Mistral", model: "mistral-small-latest" })), translate: vi.fn() };
  const result = await runDictation({ audio: new Blob(["audio"]), durationSeconds: 2, mode: "formal", language: "de", settings, api });
  expect(api.transcribe.mock.calls[0][0]).toMatchObject({ provider: "mistral", model: "voxtral-mini-transcribe-3", fallback: settings.dictationFallback });
  expect(api.process.mock.calls[0][0]).toMatchObject({ model: "mistral-small-latest" });
  expect(result).toMatchObject({ sttProvider: "OpenAI", sttModel: "whisper-1" });
  expect(resultMeta(result)).toContain("Spracherkennung: OpenAI · whisper-1");
});
it("keeps provider/model/status together below the card container breakpoint", () => {
  const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  expect(css).toContain("container: provider-models / inline-size"); expect(css).toContain("@container provider-models (max-width: 560px)");
  expect(css).toMatch(/\.provider-model-label\s*\{ grid-column: 1 \/ -1;/);
  expect(css).toContain("grid-template-columns: minmax(0, .9fr) minmax(0, 1.4fr) 24px");
});

import { afterEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { OverlayBar } from "../src/components/OverlayBar";
import { targetLanguages, targetLanguageLabel } from "../src/lib/target-languages";
import { readPreference, writePreference } from "../src/lib/device-preferences";
import { resultMeta, exportHistory } from "../src/lib/history";
import { api } from "../src/lib/api";
import type { HistoryEntry } from "../src/lib/types";
afterEach(() => vi.unstubAllGlobals());
const entry: HistoryEntry = { id: "id", text: "Final", raw: "Raw", mode: "formal", provider: "OpenAI", durationSeconds: 2, createdAt: "2026-10-27" };
it.each(targetLanguages)("shows target $id consistently in metadata and export", target => {
  const result = { ...entry, targetLanguage: target.id };
  const expected = target.id === "source" ? "Formal · OpenAI · 2.0 s" : `Formal · ${target.short} · OpenAI · 2.0 s`;
  expect(resultMeta(result)).toBe(expected);
  expect(targetLanguageLabel(target.id)).toBe(target.id === "source" ? "" : target.short);
  if (target.id === "source") expect(exportHistory([result])).not.toContain("→");
  else expect(exportHistory([result])).toContain(target.short);
});
it("keeps old history metadata free of target indicators", () => {
  expect(resultMeta(entry)).toBe("Formal · OpenAI · 2.0 s");
  expect(exportHistory([entry])).not.toContain("→");
});
it("persists the device target and defaults missing, invalid and inaccessible values to source", () => {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (key: string) => values.get(key), setItem: (key: string, value: string) => values.set(key, value) });
  const allowed = targetLanguages.map(item => item.id);
  const read = () => readPreference("voitex-target-language", allowed, "source");
  expect(read()).toBe("source");
  for (const target of allowed) { writePreference("voitex-target-language", target); expect(read()).toBe(target); }
  writePreference("voitex-target-language", "fr"); expect(read()).toBe("source");
  vi.stubGlobal("localStorage", { getItem: () => { throw Error("Denied"); } });
  expect(read()).toBe("source");
});
it("posts target process and pure translation requests to their own endpoints", async () => {
  const fetch = vi.fn(async () => new Response(JSON.stringify({ translated: "Final", provider: "Groq", model: "test" })));
  vi.stubGlobal("fetch", fetch);
  const process = { transcript: "Raw", mode: "formal" as const, provider: "groq" as const, instructions: "Custom", targetLanguage: "hr" as const };
  await api.process(process);
  const translation = { text: "Snippet\nURL", targetLanguage: "en" as const, provider: "groq" as const };
  expect(await api.translate(translation)).toEqual({ translated: "Final", provider: "Groq", model: "test" });
  const calls = fetch.mock.calls as unknown as [string, RequestInit][];
  expect(calls.map(([path]) => path)).toEqual(["/api/process", "/api/translate"]);
  expect(JSON.parse(calls[0][1].body as string)).toEqual(process);
  expect(JSON.parse(calls[1][1].body as string)).toEqual(translation);
});
const props = {
  languages: [{ id: "de", label: "Deutsch", short: "DE" }], language: "de", onLanguageChange: () => {},
  modes: [{ id: "formal", label: "Formal" }], mode: "formal", onModeChange: () => {},
  targetLanguage: "en" as const, onTargetLanguageChange: () => {},
  recording: false, elapsedSeconds: 2, levels: [], busyText: null, message: null, onStart: () => {}, onStop: () => {},
};
it("lays out mode above source, record and target in reading order", () => {
  const html = renderToStaticMarkup(<OverlayBar {...props} />);
  const labels = ["Modus wählen", "Diktatsprache wählen", "Diktat starten", "Zielsprache wählen"];
  const positions = labels.map(label => html.indexOf(`aria-label="${label}"`));
  expect(positions.every(position => position >= 0)).toBe(true);
  expect(positions).toEqual([...positions].sort((a, b) => a - b));
  expect(html).toContain("Formal"); expect(html).toContain("→ EN");
});
it.each([{ recording: true, busyText: null }, { recording: false, busyText: "Bearbeite …" }])("hides chips in active state %j", state => {
  const html = renderToStaticMarkup(<OverlayBar {...props} {...state} />);
  for (const label of ["Modus wählen", "Diktatsprache wählen", "Zielsprache wählen", "Diktat starten"]) expect(html).not.toContain(label);
});

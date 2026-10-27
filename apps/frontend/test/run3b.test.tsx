import { afterEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Markdown } from "../src/components/Markdown";
import { ProviderOptions } from "../src/components/ProviderOptions";
import { SettingsView } from "../src/views/SettingsView";
import type { Settings } from "../src/lib/types";

const context = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
vi.mock("../src/lib/settings-context", () => ({ useSettings: () => context.current, SettingsNotice: () => null }));
afterEach(() => { vi.unstubAllGlobals(); });
const options = (available: string[], invalid: string[], selected: string) => renderToStaticMarkup(<select value={selected} onChange={() => {}}><ProviderOptions available={available} invalid={invalid} selected={selected} /></select>);
it("lists only keyed providers and disables invalid options except the selected one", () => {
  const html = options(["mistral", "openai"], ["openai"], "mistral");
  expect(html).not.toContain("Groq"); expect(html).not.toContain("kein Schlüssel");
  expect(html).toContain('<option value="openai" disabled="">OpenAI (Schlüssel ungültig)</option>');
  expect(options(["mistral", "openai"], ["openai"], "openai")).toContain('<option value="openai" selected="">OpenAI (Schlüssel ungültig)</option>');
});
it("preserves only the current unavailable value without leaking it into other selects", () => {
  expect(options(["mistral"], [], "groq")).toContain('<option value="groq" selected="">Groq (nicht verfügbar)</option>');
  expect(options(["mistral"], [], "mistral")).not.toContain("groq");
  expect(options([], [], "mistral")).toContain('selected="">Mistral (nicht verfügbar)');
});
it("applies the same capability rules to every builtin, custom, protocol, summary and meeting row", () => {
  vi.stubGlobal("window", { matchMedia: () => ({ matches: false }) });
  const modes = { original: "mistral", casual: "mistral", formal: "mistral", coding: "mistral", protocol: "mistral", summary: "mistral" } as const;
  const settings: Settings = { version: 1, providers: { ...modes, meetings: "assemblyai" }, prompts: { ...modes }, lexicon: [], snippets: [], ownSpeakerName: "Ich", customModes: [{ id: "custom-mail", label: "Mail", prompt: "Mail", provider: "groq" }] };
  context.current = { settings, defaults: settings, providers: { stt: ["mistral"], llm: ["mistral", "openai"], meetings: ["mistral"], invalid: ["openai", "mistral"] }, status: "ready", saving: false, save: vi.fn() };
  const html = renderToStaticMarkup(<SettingsView theme="light" onThemeChange={() => {}} onDirtyChange={() => {}} />);
  expect(html).not.toContain("kein Schlüssel");
  for (const id of [...Object.keys(modes), "custom-mail", "meetings"]) {
    const row = html.match(new RegExp(`<select[^>]*id="provider-${id}"[^>]*>([^]*?)</select>`))?.[1];
    expect(row, id).toBeDefined();
    if (id === "meetings") {
      expect(row).toContain('AssemblyAI (nicht verfügbar)'); expect(row).not.toContain("OpenAI");
      expect(row).toContain('value="mistral" disabled="">Mistral (Schlüssel ungültig)');
    } else {
      expect(row).toContain('value="openai" disabled="">OpenAI (Schlüssel ungültig)');
      if (id === "custom-mail") expect(row).toContain('value="groq" selected="">Groq (nicht verfügbar)');
      else { expect(row).not.toContain("Groq"); expect(row).toContain('value="mistral" selected="">Mistral (Schlüssel ungültig)'); }
    }
  }
});
it("renders the supported markdown blocks and inline styles", () => {
  const html = renderToStaticMarkup(<Markdown text={"# Titel\n\nAbsatz **fett** und *kursiv*.\nZweite Zeile\n\n## Abschnitt\n- Eins\n* Zwei **stark**\n\n### Aufgaben\n1. Erstens\n2. Zweitens"} />);
  expect(html).toContain("<h1>Titel</h1>"); expect(html).toContain("<h2>Abschnitt</h2>"); expect(html).toContain("<h3>Aufgaben</h3>");
  expect(html).toContain("<strong>fett</strong>"); expect(html).toContain("<em>kursiv</em>");
  expect(html).toContain("<ul><li>Eins</li><li>Zwei <strong>stark</strong></li></ul>");
  expect(html).toContain('<ol start="1"><li>Erstens</li><li>Zweitens</li></ol>');
  expect(html).toContain("<p>Absatz"); expect(html).toContain("\nZweite Zeile</p>");
});
it("keeps HTML and unsupported syntax as text, including injection payloads", () => {
  const html = renderToStaticMarkup(<Markdown text={'<img src=x onerror="alert(1)">\n<script>alert(2)</script>\n\n[Link](javascript:alert(3))\n#### Kein Titel\n`Code`'} />);
  expect(html).toContain("&lt;img"); expect(html).toContain("onerror=&quot;alert(1)&quot;&gt;");
  expect(html).not.toMatch(/<(img|script|a|h4|code)\b/);
  expect(html).toContain("[Link](javascript:alert(3))"); expect(html).toContain("#### Kein Titel");
});
it("handles empty input, CRLF, adjacent blocks and unmatched asterisks", () => {
  expect(renderToStaticMarkup(<Markdown text="" />)).toBe('<div class="meeting-protocol"></div>');
  const html = renderToStaticMarkup(<Markdown text={"# Titel\r\nText **offen\r\n- Punkt\r\n3. Aufgabe\r\nAbsatz"} />);
  expect(html).toContain('<h1>Titel</h1><p>Text **offen</p><ul><li>Punkt</li></ul><ol start="3"><li>Aufgabe</li></ol><p>Absatz</p>');
});

it.each([{ stt: ["mistral"] }, { stt: ["openai"] }])("shows Claude only in text lists and the actual STT hint for $stt", ({ stt }) => {
  vi.stubGlobal("window", { matchMedia: () => ({ matches: false }) });
  const modes = { original: "anthropic", casual: "anthropic", formal: "anthropic", coding: "anthropic", protocol: "anthropic", summary: "anthropic" } as const;
  const settings: Settings = { version: 1, providers: { ...modes, meetings: "mistral" }, prompts: { ...modes }, lexicon: [], snippets: [], ownSpeakerName: "Ich",
    customModes: [{ id: "custom-test", label: "Custom", prompt: "Custom", provider: "anthropic" }] };
  context.current = { settings, defaults: settings, providers: { stt, llm: ["mistral", "anthropic"], meetings: ["mistral"] }, status: "ready", saving: false, save: vi.fn() };
  const html = renderToStaticMarkup(<SettingsView theme="light" onThemeChange={() => {}} onDirtyChange={() => {}} />);
  expect(html.match(/Spracherkennung über /g)).toHaveLength(5);
  expect(html).toContain(`Spracherkennung über ${stt.includes("mistral") ? "Mistral" : "OpenAI"}`);
  for (const id of [...Object.keys(modes), "custom-test", "meetings"]) {
    const row = html.match(new RegExp(`<select[^>]*id="provider-${id}"[^>]*>([^]*?)</select>`))?.[1];
    if (id === "meetings") expect(row).not.toContain("Claude");
    else expect(row).toContain('value="anthropic" selected="">Claude');
  }
});

it("keeps Claude text providers when merging saved settings with defaults", async () => {
  const { mergeWithDefaults } = await import("../src/lib/settings");
  const modes = { original: "mistral", casual: "mistral", formal: "mistral", coding: "mistral", protocol: "mistral", summary: "mistral" } as const;
  const defaults: Settings = { version: 1, providers: { ...modes, meetings: "mistral" }, prompts: { ...modes }, lexicon: [], snippets: [], ownSpeakerName: "Ich" };
  const providers = Object.fromEntries(Object.keys(modes).map(mode => [mode, "anthropic"]));
  const merged = mergeWithDefaults({ providers: { ...providers, meetings: "anthropic" } }, defaults);
  expect(merged.providers).toEqual({ ...providers, meetings: "mistral" });
});

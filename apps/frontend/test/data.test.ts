import { describe, expect, it, vi, afterEach } from "vitest";
import { mergeWithDefaults, isDirty } from "../src/lib/settings";
import {
  applyLexicon,
  lexiconPromptTerms,
  parseLexiconCsv,
  exportLexiconCsv,
  findDuplicateSpoken,
  mergeImported,
} from "../src/lib/lexicon";
import {
  normalizeTrigger,
  matchSnippet,
  findDuplicateTrigger,
  parseSnippetsJson,
  exportSnippetsJson,
  mergeImported as mergeSnippets,
} from "../src/lib/snippets";
import { api } from "../src/lib/api";
import type { Settings } from "../src/lib/types";
const modes = {
  original: "openai",
  casual: "openai",
  formal: "openai",
  coding: "openai",
  protocol: "openai",
  summary: "openai",
} as const;
const defaults: Settings = {
  version: 1,
  providers: { ...modes },
  prompts: { ...modes },
  lexicon: [],
  snippets: [],
  ownSpeakerName: "Ich",
};
const entries = [
  { id: "1", spoken: "müller", correct: "Müller" },
  { id: "2", spoken: "müller gmbh", correct: "MÜLLER GmbH" },
  { id: "3", spoken: "", correct: "Öko" },
];
describe("settings", () => {
  it("fills missing and invalid fields without mutating defaults", () => {
    const result = mergeWithDefaults(
      {
        providers: { formal: "groq", original: 8, casual: "unknown" },
        prompts: { formal: "", coding: null },
        lexicon: "bad",
        snippets: [{ id: "x", trigger: 4, text: "x" }],
        ownSpeakerName: false,
        unknown: true,
      },
      defaults,
    );
    expect(result).toEqual({
      ...defaults,
      providers: { ...modes, formal: "groq" },
      prompts: { ...modes, formal: "" },
    });
    result.providers.original = "groq";
    expect(defaults.providers.original).toBe("openai");
  });
  it("handles null and arrays as missing settings", () => {
    expect(mergeWithDefaults(null, defaults)).toEqual(defaults);
    expect(mergeWithDefaults([], defaults)).toEqual(defaults);
  });
  it("compares values independently of object key order", () => {
    expect(
      isDirty(defaults, {
        ...defaults,
        providers: {
          summary: "openai",
          protocol: "openai",
          coding: "openai",
          formal: "openai",
          casual: "openai",
          original: "openai",
        },
      }),
    ).toBe(false);
    expect(isDirty(defaults, { ...defaults, ownSpeakerName: "Du" })).toBe(true);
    expect(isDirty(defaults, { ...defaults, lexicon: entries })).toBe(true);
  });
});
describe("lexicon", () => {
  it("replaces whole Unicode words and longest phrases first without cascading", () => {
    expect(applyLexicon("MÜLLER GmbH, müller! Altmüller Öko", entries)).toBe(
      "MÜLLER GmbH, Müller! Altmüller Öko",
    );
    expect(
      applyLexicon("a b", [
        { id: "a", spoken: "a", correct: "b" },
        { id: "b", spoken: "b", correct: "c" },
      ]),
    ).toBe("b c");
  });
  it("prefers longer phrases and leaves hint-only entries untouched", () => {
    expect(
      applyLexicon("alpha beta alpha Öko", [
        { id: "short", spoken: "alpha", correct: "Kurz" },
        { id: "long", spoken: "alpha beta", correct: "Lang" },
        { id: "hint", spoken: "  ", correct: "Hinweis" },
      ]),
    ).toBe("Lang Kurz Öko");
    expect(applyLexicon("Unverändert", [])).toBe("Unverändert");
  });
  it("escapes regex syntax", () =>
    expect(
      applyLexicon("C++ und C++x", [
        { id: "1", spoken: "C++", correct: "CPP" },
      ]),
    ).toBe("CPP und C++x"));
  it("returns unique correct prompt terms", () =>
    expect(
      lexiconPromptTerms([
        ...entries,
        { id: "4", spoken: "o", correct: "Öko" },
      ]),
    ).toEqual(["Müller", "MÜLLER GmbH", "Öko"]));
  it("round trips quotes, semicolons, umlauts and embedded newlines with BOM", () => {
    const rows = [
      { spoken: '"Öko"; neu', correct: "Grüße\nWelt" },
      { spoken: "", correct: "Ä" },
    ];
    expect(parseLexiconCsv("\ufeff" + exportLexiconCsv(rows))).toEqual(rows);
  });
  it("rejects malformed csv and missing correct words", () => {
    expect(() => parseLexiconCsv("wrong;header\na;b")).toThrow();
    expect(() => parseLexiconCsv('spoken;correct\na;"broken')).toThrow();
    expect(() => parseLexiconCsv("spoken;correct\na;")).toThrow();
  });
  it("finds duplicates except empty spoken and current id", () => {
    expect(findDuplicateSpoken(entries, " MÜLLER ")).toBeTruthy();
    expect(findDuplicateSpoken(entries, "müller", "1")).toBeUndefined();
    expect(findDuplicateSpoken(entries, "")).toBeUndefined();
  });
  it("adds imports and counts duplicates within file and existing entries", () => {
    const result = mergeImported(entries, [
      { spoken: "Müller", correct: "x" },
      { spoken: "neu", correct: "Neu" },
      { spoken: "NEU", correct: "Andere" },
      { spoken: "", correct: "Öko" },
    ]);
    expect(result.added).toBe(1);
    expect(result.skipped).toBe(3);
    expect(result.entries).toHaveLength(4);
    expect(result.entries[3].id).toBeTruthy();
  });
});
describe("snippets", () => {
  const rows = [{ id: "1", trigger: "Grüße", text: "  Viele Grüße!\nIch  " }];
  it("normalizes punctuation, whitespace and case at edges", () => {
    expect(normalizeTrigger(" … „GRÜSSE!“ ")).toBe("grüsse");
    expect(normalizeTrigger("A-B")).toBe("a-b");
  });
  it("matches only the entire dictation and keeps snippet text verbatim", () => {
    expect(matchSnippet(" „Grüße!“ ", rows)?.text).toBe(rows[0].text);
    expect(matchSnippet("Bitte Grüße", rows)).toBeUndefined();
    expect(matchSnippet("Grüße bitte", rows)).toBeUndefined();
    expect(matchSnippet("!!!", rows)).toBeUndefined();
  });
  it("finds normalized duplicates with id exclusion", () => {
    expect(findDuplicateTrigger(rows, "Grüße!")).toBeTruthy();
    expect(findDuplicateTrigger(rows, "Grüße", "1")).toBeUndefined();
  });
  it("round trips JSON without ids", () => {
    expect(parseSnippetsJson(exportSnippetsJson(rows))).toEqual([
      { trigger: "Grüße", text: rows[0].text },
    ]);
  });
  it("rejects invalid JSON and invalid fields", () => {
    for (const value of [
      "{}",
      "oops",
      '[{"trigger":"!","text":"x"}]',
      '[{"trigger":"a","text":" "}]',
    ])
      expect(() => parseSnippetsJson(value)).toThrow();
  });
  it("merges without replacing and skips repeated triggers", () => {
    const result = mergeSnippets(rows, [
      { trigger: "Grüße!", text: "x" },
      { trigger: "neu", text: "Neu" },
      { trigger: "NEU", text: "x" },
    ]);
    expect(result.added).toBe(1);
    expect(result.skipped).toBe(2);
    expect(result.entries[0]).toEqual(rows[0]);
  });
});
afterEach(() => vi.unstubAllGlobals());
describe("api", () => {
  it("throws on failed loads, preserving the server message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(
        async () =>
          new Response(JSON.stringify({ error: "Serverfehler" }), {
            status: 500,
          }),
      ),
    );
    await expect(api.getSettings()).rejects.toThrow("Serverfehler");
    await expect(api.getHistory()).rejects.toThrow("Serverfehler");
  });
  it("uses German fallback for non-json and network errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("bad", { status: 502 })),
    );
    await expect(api.getProviders()).rejects.toThrow("Anfrage fehlgeschlagen");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("fetch failed")),
    );
    await expect(api.getDefaults()).rejects.toThrow("Verbindung");
  });
  it("rejects malformed successful responses instead of inventing empty data", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => new Response("not json")),
    );
    await expect(api.getHistory()).rejects.toThrow("Ungültige Antwort");
  });
  it("checks errors for every endpoint", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementation(
          async () => new Response('{"error":"Nein"}', { status: 400 }),
        ),
    );
    for (const action of [
      () => api.getProviders(),
      () => api.getDefaults(),
      () => api.saveSettings(defaults),
      () =>
        api.addHistory({
          id: "x",
          createdAt: "now",
          mode: "formal",
          provider: "OpenAI",
          durationSeconds: 1,
          text: "x",
          raw: "x",
        }),
      () => api.deleteHistory("x"),
      () => api.clearHistory(),
    ])
      await expect(action()).rejects.toThrow("Nein");
  });
  it("sends complete settings and handles successful empty responses", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{"ok":true}'));
    vi.stubGlobal("fetch", fetch);
    await api.saveSettings(defaults);
    expect(fetch.mock.calls[0][0]).toBe("/api/settings");
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual(defaults);
    fetch.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(api.clearHistory()).resolves.toBeUndefined();
  });
});

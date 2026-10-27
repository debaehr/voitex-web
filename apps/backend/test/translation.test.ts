import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "node:http";
import { buildProcessInstructions, buildTranslationInstructions, targetLanguageNames, type TargetLanguage } from "../src/providers/shared.js";
import { modeInstructions } from "../src/prompts.js";

const { processTranscript } = vi.hoisted(() => ({ processTranscript: vi.fn() }));
vi.mock("../src/providers/index.js", async importOriginal => ({
  ...await importOriginal<typeof import("../src/providers/index.js")>(), processTranscript,
}));
import { createApp } from "../src/app.js";

let dir: string, server: Server, base: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "voitex-translation-"));
  processTranscript.mockReset().mockResolvedValue({ text: "Translated", provider: "Groq", model: "test-model" });
  server = createApp({ dataDir: dir, frontendDir: dir }).listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw Error("Missing address");
  base = `http://127.0.0.1:${address.port}`;
});
afterEach(async () => {
  await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); });
  await rm(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});
const post = (path: string, body: unknown, method = "POST") => fetch(base + path, {
  method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});
const input = { transcript: "Hallo", mode: "formal" as const, instructions: "Custom" };

describe("target language prompts", () => {
  it.each(Object.entries(targetLanguageNames))("appends %s to custom and default prompts", (code, name) => {
    for (const instructions of [undefined, "Custom"]) {
      const basePrompt = instructions ?? modeInstructions.formal;
      const prompt = buildProcessInstructions({ ...input, instructions, targetLanguage: code as TargetLanguage }, modeInstructions);
      expect(prompt).toContain(`${basePrompt}\n\nZusatzaufgabe:`);
      expect(prompt).toContain(`auf ${name} aus`);
      expect(buildTranslationInstructions(code as keyof typeof targetLanguageNames)).toContain(name);
    }
  });
  it.each([undefined, "source"] as const)("keeps %s prompts unchanged", targetLanguage => {
    expect(buildProcessInstructions({ ...input, targetLanguage }, modeInstructions)).toBe("Custom");
    expect(buildProcessInstructions({ ...input, instructions: undefined, targetLanguage }, modeInstructions)).toBe(modeInstructions.formal);
  });
  it("keeps the English alias and gives explicit targets precedence", () => {
    expect(buildProcessInstructions({ ...input, translateToEnglish: true }, modeInstructions))
      .toBe(buildProcessInstructions({ ...input, targetLanguage: "en" }, modeInstructions));
    expect(buildProcessInstructions({ ...input, targetLanguage: "source", translateToEnglish: true }, modeInstructions)).toBe("Custom");
  });
});

it.each(["de", "en", "hr", "source", undefined])("passes process target %s to the shared provider input", async targetLanguage => {
  const response = await post("/api/process", { ...input, targetLanguage, provider: "groq" });
  expect(response.status).toBe(200);
  expect(processTranscript).toHaveBeenCalledWith("groq", expect.objectContaining({ targetLanguage }));
});
it("forwards the English alias", async () => {
  expect((await post("/api/process", { ...input, translateToEnglish: true })).status).toBe(200);
  expect(processTranscript).toHaveBeenCalledWith("mistral", expect.objectContaining({ translateToEnglish: true }));
});
it.each(["fr", "", null, 1, {}, "toString"])("rejects unknown process target %j", async targetLanguage => {
  const response = await post("/api/process", { ...input, targetLanguage });
  expect(response.status).toBe(400); expect(await response.json()).toHaveProperty("error");
  expect(processTranscript).not.toHaveBeenCalled();
});
it.each(["de", "en", "hr"] as const)("translates snippets purely to %s using the selected provider", async targetLanguage => {
  const text = "Name: Ana\nhttps://example.com/{id}\n{{placeholder}}";
  const response = await post("/api/translate", { text, targetLanguage, provider: "groq" });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ translated: "Translated", provider: "Groq", model: "test-model" });
  expect(processTranscript).toHaveBeenCalledWith("groq", {
    transcript: text, mode: "original", instructions: buildTranslationInstructions(targetLanguage),
  });
  for (const term of ["Zeilenumbrüche", "URLs", "Namen", "Platzhalter", "keine Erklärung"]) {
    expect(buildTranslationInstructions(targetLanguage)).toContain(term);
  }
});
it.each([
  { text: "" }, { text: "  " }, { text: 12 }, { targetLanguage: "source" },
  { targetLanguage: "fr" }, { targetLanguage: null }, { targetLanguage: "constructor" },
  { provider: "invalid" }, { provider: null }, { provider: "" },
])("validates translation input %j", async override => {
  const response = await post("/api/translate", { text: "Text", targetLanguage: "en", provider: "groq", ...override });
  expect(response.status).toBe(400);
  expect(await response.json()).toHaveProperty("error"); expect(processTranscript).not.toHaveBeenCalled();
});
it("defaults translation to Mistral, requires a target, and returns sanitized provider errors", async () => {
  expect((await post("/api/translate", { text: "Text", targetLanguage: "en" })).status).toBe(200);
  expect(processTranscript).toHaveBeenCalledWith("mistral", expect.any(Object));
  for (const body of [{ text: "Text", provider: "groq" }]) {
    expect((await post("/api/translate", body)).status).toBe(400);
  }
  vi.spyOn(console, "error").mockImplementation(() => {});
  processTranscript.mockRejectedValue(new Error("secret-api-key provider response"));
  const response = await post("/api/translate", { text: "Text", targetLanguage: "en", provider: "groq" });
  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({ error: "Translation failed." });
});
it.each([undefined, "source", "de", "en", "hr"])("round-trips compatible history target %s", async targetLanguage => {
  const entry = { id: "entry", text: "Text", targetLanguage };
  expect((await post("/api/history", entry)).status).toBe(200);
  expect(await (await fetch(base + "/api/history")).json()).toEqual([JSON.parse(JSON.stringify(entry))]);
});
it.each(["fr", null, 1, "toString"])("rejects unknown history target %j on POST and PUT", async targetLanguage => {
  const entry = { id: "entry", text: "Text", targetLanguage };
  expect((await post("/api/history", entry)).status).toBe(400);
  expect((await post("/api/history", [entry], "PUT")).status).toBe(400);
});

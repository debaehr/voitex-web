import Anthropic from "@anthropic-ai/sdk";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const { create } = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@anthropic-ai/sdk", async importOriginal => {
  const actual = await importOriginal<typeof import("@anthropic-ai/sdk")>();
  class MockAnthropic extends actual.default {
    constructor() { super({ apiKey: "dummy" }); }
    beta = { messages: { create } } as unknown as InstanceType<typeof actual.default>["beta"];
  }
  return { ...actual, default: MockAnthropic };
});
import { processTranscript } from "../src/providers/anthropic.js";
import { keyStatus, KeyStatus } from "../src/providers/key-status.js";
import { transcribeAudio } from "../src/providers/index.js";
const input = { transcript: "Text", mode: "formal" as const, instructions: "Custom" };
beforeEach(() => {
  vi.stubEnv("ANTHROPIC_API_KEY", "dummy");
  vi.stubEnv("ANTHROPIC_CHAT_MODEL", "");
  create.mockReset().mockResolvedValue({ stop_reason: "end_turn", model: "fallback-model", content: [
    { type: "thinking", thinking: "hidden" }, { type: "text", text: " First" },
    { type: "fallback", model: "other" }, { type: "text", text: " second " }
  ] });
});
afterEach(() => { vi.unstubAllEnvs(); });
it.each([undefined, "dictation", "protocol", "summary"] as const)("sends the exact beta request for %s and extracts text and actual model", async task => {
  expect(await processTranscript({ ...input, task, targetLanguage: "hr" })).toEqual({ text: "First second", provider: "Claude", model: "fallback-model" });
  expect(create).toHaveBeenCalledExactlyOnceWith({
    model: "claude-sonnet-5-5", max_tokens: 16000,
    system: expect.stringContaining("Custom\n\nZusatzaufgabe:"),
    messages: [{ role: "user", content: "Text" }],
    output_config: { effort: task === "protocol" || task === "summary" ? "medium" : "low" },
    betas: ["server-side-fallback-2026-07-01"], fallbacks: "default"
  });
  expect(create.mock.calls[0][0].system).toContain("Kroatisch");
});
it("trims a configured model and fails lazily without a key", async () => {
  vi.stubEnv("ANTHROPIC_CHAT_MODEL", " custom-model ");
  await processTranscript(input); expect(create.mock.calls[0][0].model).toBe("custom-model");
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  await expect(processTranscript(input)).rejects.toThrow("not configured");
  expect(create).toHaveBeenCalledTimes(1);
});
it.each([
  ["refusal", "Claude hat die Anfrage abgelehnt."],
  ["max_tokens", "abgeschnitten"]
])("rejects %s before returning partial content", async (stop_reason, message) => {
  create.mockResolvedValue({ stop_reason, content: [{ type: "text", text: "Partial" }] });
  await expect(processTranscript(input)).rejects.toThrow(message);
});
it.each([401, 403, 429, 500])("handles typed SDK error %s without disclosing body and tracks validity", async status => {
  const error = Anthropic.APIError.generate(status, { message: "secret request body" }, "secret", new Headers());
  keyStatus.record("anthropic", 200);
  create.mockRejectedValueOnce(error);
  await expect(processTranscript(input)).rejects.toThrow(status === 401 || status === 403 ? "API-Schlüssel" : status === 429 ? "ausgelastet" : "HTTP 500");
  expect(keyStatus.invalid().includes("anthropic")).toBe(status === 401 || status === 403);
  await processTranscript(input); expect(keyStatus.invalid()).not.toContain("anthropic");
});
it("probes Anthropic with its own headers", async () => {
  const fetch = vi.fn(async () => new Response(null, { status: 401 }));
  const tracker = new KeyStatus({ keys: () => ({ anthropic: "dummy" }), fetch });
  await tracker.check();
  expect(fetch).toHaveBeenCalledExactlyOnceWith("https://api.anthropic.com/v1/models", expect.objectContaining({
    headers: { "x-api-key": "dummy", "anthropic-version": "2023-06-01" }
  }));
  expect(tracker.invalid()).toEqual(["anthropic"]);
});
it("rejects Claude as a transcription provider", () => {
  expect(() => transcribeAudio("anthropic", { buffer: Buffer.from("audio"), filename: "a.webm", mimetype: "audio/webm" })).toThrow("keine Spracherkennung");
});

it("uses Claude through HTTP processing and translation, returns safe refusal errors, and rejects STT", async () => {
  const { mkdtemp, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { createApp } = await import("../src/app.js");
  const dir = await mkdtemp(join(tmpdir(), "voitex-claude-"));
  const server = createApp({ dataDir: dir, frontendDir: dir }).listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address(); if (!address || typeof address === "string") throw new Error("address");
  const base = `http://127.0.0.1:${address.port}/api`;
  const post = (path: string, body: unknown) => fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  try {
    for (const path of ["/process", "/translate"]) {
      const response = await post(path, { provider: "anthropic", transcript: "Text", text: "Text", mode: "formal", instructions: "Custom", targetLanguage: "hr" });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ provider: "Claude", model: "fallback-model" });
      expect(create.mock.calls.at(-1)?.[0]).toMatchObject({ output_config: { effort: "low" }, system: expect.stringContaining("Kroatisch") });
      create.mockResolvedValueOnce({ stop_reason: "refusal", content: [] });
      const error = await post(path, { provider: "anthropic", transcript: "Text", text: "Text", mode: "formal", targetLanguage: "hr" });
      expect(error.status).toBe(500);
      expect(await error.json()).toEqual({ error: "Claude hat die Anfrage abgelehnt." });
    }
    const form = new FormData(); form.append("audio", new Blob(["audio"]), "a.webm"); form.append("provider", "anthropic");
    expect((await fetch(base + "/transcribe", { method: "POST", body: form })).status).toBe(400);
  } finally {
    await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); });
    await rm(dir, { recursive: true, force: true });
  }
});

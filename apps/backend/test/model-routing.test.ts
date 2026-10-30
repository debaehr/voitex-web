import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "node:http";
vi.mock("../src/providers/meeting-http.js", () => ({ meetingRequest: (url: string, init: RequestInit) => fetch(url, init) }));
import { createApp } from "../src/app.js";
import { processTranscript } from "../src/providers/index.js";
import { transcribeMeeting } from "../src/providers/meetings.js";
import { keyStatus } from "../src/providers/key-status.js";
const nativeFetch = globalThis.fetch;
let dir: string, server: Server, base: string;
let fail: number | "network" | "timeout" | undefined;
let failOpenai: boolean;
let calls: Array<{ url: string; init?: RequestInit }>;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "voitex-models-")); calls = []; fail = undefined; failOpenai = false;
  for (const provider of ["MISTRAL", "OPENAI", "ANTHROPIC", "ASSEMBLYAI"]) vi.stubEnv(`${provider}_API_KEY`, "private-key");
  vi.stubGlobal("fetch", vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const address = String(url);
    if (address.startsWith("http://127.0.0.1:")) return nativeFetch(url, init);
    if (address === "data:,") return nativeFetch(url, init);
    calls.push({ url: address, init });
    if (address.includes("api.mistral.ai/v1/audio/")) {
      if (!failOpenai && fail === "network") throw new TypeError("private-key");
      if (!failOpenai && fail === "timeout") throw new DOMException("private-key", "TimeoutError");
      if (!failOpenai && fail) return new Response("private-key raw failure", { status: fail });
      return Response.json({ text: "Dictated", segments: [{ speaker_id: "A", start: 0, end: 1, text: "Meeting" }] });
    }
    if (address.includes("api.openai.com/v1/audio/")) {
      if (failOpenai && fail === "network") throw new TypeError("private-key");
      if (failOpenai && fail === "timeout") throw new DOMException("private-key", "TimeoutError");
      if (failOpenai && fail) return new Response("private-key", { status: fail });
      return Response.json({ text: "Fallback" });
    }
    if (address.includes("/responses")) return Response.json({ id: "resp_test", object: "response", output: [{ type: "message", content: [{ type: "output_text", text: "Result" }] }] });
    if (address.includes("/chat/completions")) return Response.json({ choices: [{ message: { content: "Result" } }] });
    if (address.includes("/messages")) return Response.json({ model: "claude-selected", stop_reason: "end_turn", content: [{ type: "text", text: "Result" }] });
    if (address.endsWith("/v2/upload")) return Response.json({ upload_url: "https://cdn.assemblyai.com/audio" });
    if (address.endsWith("/v2/transcript")) return Response.json({ id: "test" });
    if (address.endsWith("/v2/transcript/test")) return Response.json({ status: "completed", utterances: [{ speaker: "A", text: "Meeting", start: 0, end: 1000 }] });
    if (address.includes("/models/")) return new Response("private-key");
    throw new Error(`Unexpected endpoint ${address}`);
  }));
  server = createApp({ dataDir: dir, frontendDir: dir, resumeMeetingJobs: false, meetingRetentionTimer: false }).listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address(); if (!address || typeof address === "string") throw new Error("address");
  base = `http://127.0.0.1:${address.port}/api`;
});
afterEach(async () => {
  await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); });
  vi.unstubAllEnvs(); vi.unstubAllGlobals(); await rm(dir, { recursive: true, force: true });
});
async function json(path: string, body: unknown, method = "POST") {
  return fetch(base + path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}
async function dictate(extra: Record<string, string> = {}) {
  const form = new FormData(); form.append("audio", new Blob(["audio"]), "recording.webm");
  for (const [key, value] of Object.entries(extra)) form.append(key, value);
  return fetch(base + "/transcribe", { method: "POST", body: form });
}
it.each([500, 503, 429, 401, 403, "network", "timeout"] as const)("falls back on %s and reports the actual model/provider and lexicon to history", async error => {
  fail = error;
  await writeFile(join(dir, "settings.json"), JSON.stringify({
    dictationStt: { provider: "mistral", model: "voxtral-selected" }, dictationFallback: { provider: "openai", model: "whisper-1" },
    lexicon: [{ correct: "Voitex", spoken: "wrong" }],
  }));
  const response = await dictate(); expect(response.status).toBe(200);
  const result = await response.json(); expect(result).toEqual({ transcript: "Fallback", provider: "OpenAI", model: "whisper-1" });
  expect(calls).toHaveLength(2); expect((calls[0].init!.body as FormData).get("model")).toBe("voxtral-selected");
  expect((calls[0].init!.body as FormData).getAll("context_bias")).toEqual(["Voitex"]);
  const form = calls[1].init!.body as FormData; expect(form.get("model")).toBe("whisper-1"); expect(form.get("prompt")).toBe("Voitex");
  const history = { id: "test", text: result.transcript, provider: "Mistral", sttProvider: result.provider, sttModel: result.model };
  expect((await json("/history", history)).status).toBe(200);
  expect(JSON.parse(await readFile(join(dir, "history.json"), "utf8"))).toEqual([history]);
  if (error === 401 || error === 403) expect(keyStatus.invalid()).toContain("mistral");
});
it.each([400, 413, 415])("does not fall back on rejected audio (%s) or expose errors", async status => {
  fail = status;
  const response = await dictate({ provider: "mistral", fallback: JSON.stringify({ provider: "openai", model: "whisper-1" }) });
  expect(response.status).toBe(500); expect(calls).toHaveLength(1); expect(await response.text()).not.toContain("private-key");
});
it.each([503, 429, 401, "network", "timeout", 400] as const)("uses the same fallback policy for OpenAI SDK errors (%s)", async status => {
  failOpenai = true; fail = status;
  const response = await dictate({ provider: "openai", model: "whisper-1", fallback: JSON.stringify({ provider: "mistral", model: "voxtral-mini-latest" }) });
  expect(response.status).toBe(status === 400 ? 500 : 200);
  expect(calls).toHaveLength(status === 400 ? 1 : 2);
  if (status !== 400) expect(await response.json()).toEqual({ transcript: "Dictated", provider: "Mistral", model: "voxtral-mini-latest" });
});
it("uses an unsaved STT/model/fallback snapshot and respects explicit no-fallback", async () => {
  await writeFile(join(dir, "settings.json"), JSON.stringify({ dictationFallback: { provider: "openai", model: "whisper-1" } }));
  fail = 500;
  expect((await dictate({ provider: "mistral", model: "voxtral-new", fallback: "null" })).status).toBe(500);
  expect(calls).toHaveLength(1); expect((calls[0].init!.body as FormData).get("model")).toBe("voxtral-new");
});
it.each(["mistral", "openai", "anthropic"] as const)("passes the selected chat model through the real %s adapter (fetch mocked)", async provider => {
  const model = provider === "openai" ? "gpt-5-mini" : provider === "anthropic" ? "claude-selected" : "mistral-selected";
  await processTranscript(provider, { model, transcript: "Text", mode: "formal" });
  const body = JSON.parse(calls[0].init!.body as string); expect(body.model).toBe(model);
  expect(body).not.toHaveProperty("temperature");
  if (provider === "openai") expect(calls[0].url).toContain("/responses");
});
it.each(["gpt-4o", "gpt-4.1", "gpt-5", "gpt-5.1", "o1", "o3", "o4-mini"])("uses Responses-compatible parameters for offered family %s", async model => {
  await processTranscript("openai", { model, transcript: "Text", mode: "formal" });
  expect(JSON.parse(calls[0].init!.body as string)).toEqual({ model, instructions: expect.any(String), input: "Text", max_output_tokens: 4000 });
});
it.each(["claude-3-haiku", "claude-sonnet-4-6"])("omits unsupported newer options for selected Claude model %s", async model => {
  await processTranscript("anthropic", { model, transcript: "Text", mode: "formal" });
  const body = JSON.parse(calls[0].init!.body as string);
  expect(body).toMatchObject({ model, max_tokens: model === "claude-3-haiku" ? 4096 : 16000 });
  expect(body).not.toHaveProperty("output_config"); expect(body).not.toHaveProperty("fallbacks");
});
it.each(["mistral", "assemblyai"] as const)("passes the chosen meeting model to %s", async provider => {
  const file = join(dir, "audio.webm"); await writeFile(file, "audio");
  const model = provider === "mistral" ? "voxtral-mini-transcribe-new" : "universal-2";
  const result = await transcribeMeeting(file, { provider, model }); expect(result.model).toBe(model);
  const body = calls.find(call => call.url.includes(provider === "mistral" ? "/audio/" : "/v2/transcript"))!.init!.body!;
  if (provider === "mistral") expect((body as FormData).get("model")).toBe(model);
  else expect(JSON.parse(body as string).speech_models).toEqual([model]);
});
it("uses the selected meeting fallback model", async () => {
  fail = 500; const file = join(dir, "audio.webm"); await writeFile(file, "audio");
  const result = await transcribeMeeting(file, { provider: "mistral", model: "voxtral-mini-transcribe-new", fallback: { provider: "assemblyai", model: "universal-2" } });
  expect(result).toMatchObject({ provider: "assemblyai", model: "universal-2" });
});
it("validates HTTP model selections/checks before calling providers and atomically preserves settings", async () => {
  const defaults = await (await fetch(base + "/settings/defaults")).json();
  expect((await json("/settings", { ...defaults, models: { formal: "future:1" } }, "PUT")).status).toBe(200);
  for (const patch of [{ models: { formal: "../secret" } }, { dictationStt: { provider: "evil", model: "valid" } }, { meetingSttFallback: { provider: "openai", model: "valid" } }]) {
    expect((await json("/settings", { ...defaults, ...patch }, "PUT")).status).toBe(400);
  }
  expect(JSON.parse(await readFile(join(dir, "settings.json"), "utf8")).models.formal).toBe("future:1");
  for (const checks of [[{ provider: "evil", model: "valid" }], [{ provider: "openai", model: "../secret" }], Array(31).fill({ provider: "mistral", model: "valid" })]) expect((await json("/providers/check", { checks })).status).toBe(400);
  expect((await dictate({ model: "../secret" })).status).toBe(400);
  for (const path of ["/process", "/translate"]) expect((await json(path, { transcript: "Text", text: "Text", targetLanguage: "en", model: "bad/id" })).status).toBe(400);
  expect(calls).toHaveLength(0);
  const response = await json("/providers/check", { checks: [{ provider: "mistral", model: "mistral-large-latest" }] });
  expect(await response.json()).toEqual({ results: [{ provider: "mistral", model: "mistral-large-latest", ok: true }] });
});


it.each([false, true])("preserves multi-word lexicon phrases in the OpenAI prompt (fallback=%s)", async fallback => {
  fail = fallback ? 503 : undefined;
  await writeFile(join(dir, "settings.json"), JSON.stringify({
    dictationStt: { provider: fallback ? "mistral" : "openai", model: fallback ? "voxtral-mini-latest" : "whisper-1" },
    dictationFallback: fallback ? { provider: "openai", model: "whisper-1" } : null,
    lexicon: [{ correct: " Marcus Hinzen ", spoken: "" }, { correct: "MARCUS HINZEN", spoken: "" }, { correct: "Anna,Müller", spoken: "" }]
  }));
  const response = await dictate();
  expect(response.status).toBe(200);
  expect((await response.json()).provider).toBe("OpenAI");
  const openaiCall = calls.find(call => call.url.includes("api.openai.com/v1/audio/"))!;
  expect((openaiCall.init!.body as FormData).get("prompt")).toBe("Marcus Hinzen, Anna,Müller");
  if (fallback) expect((calls[0].init!.body as FormData).getAll("context_bias")).toEqual(["Marcus", "Hinzen", "Anna", "Müller"]);
});

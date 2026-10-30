import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "node:http";
import { createApp } from "../src/app.js";
import { defaultPrompts } from "../src/prompts.js";
import type { MeetingService } from "../src/meetings.js";

let dir: string, server: Server, base: string, service: MeetingService;
const nativeFetch = globalThis.fetch;
let upstream: Array<{ url: string; init?: RequestInit }>, fail: boolean;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "voitex-privacy-")); upstream = []; fail = false;
  vi.stubEnv("MISTRAL_API_KEY", "private-mistral-key"); vi.stubEnv("OPENAI_API_KEY", "private-openai-key");
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (String(url).startsWith("http://127.0.0.1:")) return nativeFetch(url, init);
    upstream.push({ url: String(url), init });
    if (!String(url).startsWith("https://api.mistral.ai/")) throw new Error("Unexpected provider");
    return new Response(JSON.stringify(fail ? { error: "private-mistral-key" } :
      String(url).includes("/audio/") ? { text: "Transcript" } : { choices: [{ message: { content: "Result" } }] }), { status: fail ? 500 : 200 });
  }));
  const app = createApp({ dataDir: dir, frontendDir: dir, resumeMeetingJobs: false, meetingRetentionTimer: false });
  service = app.locals.meetings; await app.locals.meetingsReady;
  server = app.listen(0, "127.0.0.1"); await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address(); if (!address || typeof address === "string") throw new Error("address");
  base = `http://127.0.0.1:${address.port}/api`;
});
afterEach(async () => {
  await service.dispose();
  await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); });
  vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); await rm(dir, { recursive: true, force: true });
});
async function call(task: "transcribe" | "process" | "translate") {
  if (task === "transcribe") {
    const form = new FormData(); form.append("audio", new Blob(["audio"]), "test.webm");
    return fetch(base + "/transcribe", { method: "POST", body: form });
  }
  return fetch(base + "/" + task, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(task === "process" ? { transcript: "Text" } : { text: "Text", targetLanguage: "en" }) });
}

it("defaults every built-in task and meetings to Mistral, with fallback off and version 1", async () => {
  const defaults = await (await fetch(base + "/settings/defaults")).json();
  expect(defaults.providers).toEqual(Object.fromEntries([...Object.keys(defaultPrompts), "meetings"].map(key => [key, "mistral"])));
  expect(defaults.meetingFallback).toBe(false); expect(defaults.version).toBe(1);
});
it.each(["transcribe", "process", "translate"] as const)("uses Mistral for %s without an explicit provider and never falls back to OpenAI", async task => {
  let response = await call(task); expect(response.status).toBe(200); expect(await response.text()).toContain('"provider":"Mistral"');
  expect(upstream).toHaveLength(1); expect(upstream[0].url).toContain("api.mistral.ai");
  fail = true; response = await call(task); expect(response.status).toBe(500);
  const body = await response.text(); expect(body).not.toContain("private-");
  expect(upstream).toHaveLength(2); expect(upstream.every(call => call.url.includes("api.mistral.ai"))).toBe(true);
});
it("loads dictation context from server-side lexicon, with no change for an empty lexicon", async () => {
  await call("transcribe"); expect((upstream[0].init!.body as FormData).getAll("context_bias")).toEqual([]);
  await writeFile(join(dir, "settings.json"), JSON.stringify({ lexicon: [
    { spoken: "wrong", correct: " Voitex " }, { spoken: "other", correct: "voitex" }, { spoken: "", correct: "Anna" },
    ...Array.from({ length: 110 }, (_, n) => ({ spoken: "", correct: `Term${n}` }))
  ] }));
  await call("transcribe"); const terms = (upstream[1].init!.body as FormData).getAll("context_bias");
  expect(terms).toHaveLength(100); expect(terms.slice(0, 2)).toEqual(["Voitex", "Anna"]);
});

it("defaults space pause off and validates both booleans and legacy settings", async () => {
  const defaults = await (await fetch(base + "/settings/defaults")).json();
  expect(defaults.dictationSpacePause).toBe(false);
  for (const value of [false, true, "true", 1, null]) {
    const response = await fetch(base + "/settings", { method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...defaults, dictationSpacePause: value }) });
    expect(response.status).toBe(typeof value === "boolean" ? 200 : 400);
    if (typeof value === "boolean") expect((await (await fetch(base + "/settings")).json()).dictationSpacePause).toBe(value);
  }
  delete defaults.dictationSpacePause;
  await writeFile(join(dir, "settings.json"), JSON.stringify(defaults));
  const legacy = await (await fetch(base + "/settings")).json();
  expect(legacy.dictationSpacePause ?? false).toBe(false);
  expect(await (await fetch(base + "/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(legacy) })).json()).toEqual({ ok: true });
});

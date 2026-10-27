import { afterEach, expect, it, vi } from "vitest";
import { KeyStatus, keyStatus, trackProviderCall } from "../src/providers/key-status.js";
import { postJson, postMultipart } from "../src/providers/shared.js";
import { meetingRequest } from "../src/providers/meeting-http.js";
import { createServer } from "node:http";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers(); });
it.each([401, 403])("marks rejected checks invalid (%s) and clears after a successful check", async status => {
  const fetch = vi.fn().mockResolvedValueOnce(new Response(null, { status })).mockResolvedValueOnce(new Response("{}"));
  const tracker = new KeyStatus({ keys: () => ({ mistral: "dummy" }), fetch });
  expect(tracker.invalid()).toEqual([]);
  await tracker.check(); expect(tracker.invalid()).toEqual(["mistral"]);
  await tracker.check(); expect(tracker.invalid()).toEqual([]);
});
it("checks only configured keys using the specified endpoints and authorization formats", async () => {
  const fetch = vi.fn(async () => new Response("{}"));
  const tracker = new KeyStatus({ keys: () => ({ openai: "o", mistral: "m", groq: "g", assemblyai: "a" }), fetch });
  await tracker.check();
  expect(fetch.mock.calls).toEqual([
    ["https://api.openai.com/v1/models", expect.objectContaining({ headers: { Authorization: "Bearer o" } })],
    ["https://api.mistral.ai/v1/models", expect.objectContaining({ headers: { Authorization: "Bearer m" } })],
    ["https://api.groq.com/openai/v1/models", expect.objectContaining({ headers: { Authorization: "Bearer g" } })],
    ["https://api.assemblyai.com/v2/transcript?limit=1", expect.objectContaining({ headers: { Authorization: "a" } })]
  ]);
});
it("retains unknown/invalid/valid state after network errors and 5xx", async () => {
  const fetch = vi.fn().mockRejectedValue(new Error("offline"));
  const tracker = new KeyStatus({ keys: () => ({ groq: "dummy" }), fetch });
  await tracker.check(); expect(tracker.invalid()).toEqual([]);
  tracker.record("groq", 401); await tracker.check(); expect(tracker.invalid()).toEqual(["groq"]);
  fetch.mockResolvedValue(new Response(null, { status: 503 }));
  await tracker.check(); expect(tracker.invalid()).toEqual(["groq"]);
  tracker.record("groq", 200); await tracker.check(); expect(tracker.invalid()).toEqual([]);
});
it("starts without waiting, repeats every six hours, times out at ten seconds and stops", async () => {
  vi.useFakeTimers();
  const fetch = vi.fn((_url: unknown, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new Error("timeout")), { once: true });
  }));
  const setInterval = vi.fn(globalThis.setInterval), setTimeout = vi.fn(globalThis.setTimeout);
  const tracker = new KeyStatus({ keys: () => ({ openai: "dummy" }), fetch, setInterval, setTimeout, clearInterval, clearTimeout });
  tracker.record("openai", 403); tracker.start(); tracker.start();
  expect(fetch).toHaveBeenCalledTimes(1); expect(setInterval).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(10_000); expect(tracker.invalid()).toEqual(["openai"]);
  await vi.advanceTimersByTimeAsync(6 * 60 * 60 * 1000 - 10_000); expect(fetch).toHaveBeenCalledTimes(2);
  tracker.stop(); await vi.advanceTimersByTimeAsync(6 * 60 * 60 * 1000); expect(fetch).toHaveBeenCalledTimes(2);
});
it("lets newer real requests win over a delayed background check and resets changed keys", async () => {
  let finish!: (response: Response) => void;
  let key = "first";
  const tracker = new KeyStatus({ keys: () => ({ mistral: key }), fetch: vi.fn(() => new Promise(resolve => { finish = resolve; })) });
  const pending = tracker.check(); tracker.record("mistral", 403); finish(new Response("{}")); await pending;
  expect(tracker.invalid()).toEqual(["mistral"]);
  key = "replacement"; expect(tracker.invalid()).toEqual([]);
  tracker.record("mistral", 401); key = ""; expect(tracker.invalid()).toEqual([]);
});
it.each(["json", "multipart"])("marks real %s HTTP rejection immediately and clears on success", async kind => {
  vi.stubEnv("GROQ_API_KEY", "dummy");
  const fetch = vi.fn().mockResolvedValueOnce(new Response("rejected", { status: 401 })).mockResolvedValueOnce(new Response("{}"));
  vi.stubGlobal("fetch", fetch);
  const call = () => kind === "json" ? postJson("https://api.groq.com/openai/v1/chat/completions", "dummy", {}) : postMultipart("https://api.groq.com/openai/v1/audio/transcriptions", "dummy", new FormData());
  await expect(call()).rejects.toThrow(); expect(keyStatus.invalid()).toContain("groq");
  await call(); expect(keyStatus.invalid()).not.toContain("groq");
});
it("tracks SDK failures without exposing keys and clears a successful SDK call", async () => {
  vi.stubEnv("OPENAI_API_KEY", "dummy");
  const error = Object.assign(new Error("rejected"), { status: 403 });
  await expect(trackProviderCall("openai", async () => { throw error; })).rejects.toBe(error);
  expect(keyStatus.invalid()).toContain("openai");
  await expect(trackProviderCall("openai", async () => "done")).resolves.toBe("done");
  expect(keyStatus.invalid()).not.toContain("openai");
});
it("does not attribute native meeting responses to unrelated hosts", async () => {
  vi.stubEnv("ASSEMBLYAI_API_KEY", "dummy");
  keyStatus.record("assemblyai", 401);
  const server = createServer((_req, res) => { res.writeHead(200); res.end("{}"); }).listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address(); if (!address || typeof address === "string") throw new Error("address");
  try { await meetingRequest(`http://127.0.0.1:${address.port}`, {}); expect(keyStatus.invalid()).toContain("assemblyai"); }
  finally { await new Promise<void>(resolve => server.close(() => resolve())); keyStatus.record("assemblyai", 200); }
});

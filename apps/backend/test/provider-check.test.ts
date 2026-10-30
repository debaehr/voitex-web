import { afterEach, expect, it, vi } from "vitest";
import { checkProviders, validChecks } from "../src/providers/check.js";
import { keyStatus } from "../src/providers/key-status.js";
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers(); });
it.each([[200, undefined], [401, "invalid_key"], [403, "invalid_key"], [404, "model_unavailable"], [429, "http_429"], [503, "http_503"]])("checks models for HTTP %s without leaking keys or raw errors", async (status, reason) => {
  vi.stubEnv("MISTRAL_API_KEY", "secret-key");
  const fetch = vi.fn(async () => new Response("secret-key raw error", { status: status as number })); vi.stubGlobal("fetch", fetch);
  const results = await checkProviders([{ provider: "mistral", model: "future-model:1" }]);
  expect(results).toEqual([{ provider: "mistral", model: "future-model:1", ok: status === 200, ...(reason ? { reason } : {}) }]);
  expect(fetch).toHaveBeenCalledWith("https://api.mistral.ai/v1/models/future-model%3A1", expect.objectContaining({ method: "GET", redirect: "error" }));
  expect(JSON.stringify(results)).not.toContain("secret-key");
  if (status === 401 || status === 403) expect(keyStatus.invalid()).toContain("mistral");
});
it("reports network errors and starts all requests in parallel", async () => {
  vi.stubEnv("OPENAI_API_KEY", "secret"); vi.stubEnv("ANTHROPIC_API_KEY", "secret");
  const pending: Array<() => void> = [];
  const fetch = vi.fn(() => new Promise<Response>((_, reject) => pending.push(() => reject(new TypeError("secret"))))); vi.stubGlobal("fetch", fetch);
  const result = checkProviders([{ provider: "openai", model: "gpt-5" }, { provider: "anthropic", model: "claude-next" }]);
  expect(fetch).toHaveBeenCalledTimes(2); pending.forEach(done => done());
  expect((await result).every(item => item.reason === "network")).toBe(true);
});
it("aborts each check at ten seconds", async () => {
  vi.useFakeTimers(); vi.stubEnv("OPENAI_API_KEY", "secret");
  vi.stubGlobal("fetch", vi.fn((_, init) => new Promise<Response>((_, reject) => init.signal.addEventListener("abort", () => reject(new Error("abort"))))));
  const result = checkProviders([{ provider: "openai", model: "gpt-5" }]);
  await vi.advanceTimersByTimeAsync(9999); await vi.advanceTimersByTimeAsync(1);
  expect(await result).toEqual([{ provider: "openai", model: "gpt-5", ok: false, reason: "timeout" }]);
});
it("checks AssemblyAI auth and its fixed list and handles missing keys locally", async () => {
  vi.stubEnv("ASSEMBLYAI_API_KEY", "secret"); vi.stubEnv("OPENAI_API_KEY", "");
  const fetch = vi.fn(async () => new Response("{}")); vi.stubGlobal("fetch", fetch);
  const results = await checkProviders([{ provider: "assemblyai", model: "universal-2" }, { provider: "assemblyai", model: "unknown" }, { provider: "openai", model: "gpt-5" }]);
  expect(results.map(r => r.reason ?? "ok")).toEqual(["ok", "model_unavailable", "invalid_key"]);
  expect(fetch.mock.calls.every(call => call[0] === "https://api.assemblyai.com/v2/transcript?limit=1")).toBe(true);
});
it("validates all checks before any request, including max 30", () => {
  const item = { provider: "mistral", model: "valid-model:1" };
  expect(validChecks({ checks: Array(30).fill(item) })).toBe(true);
  for (const checks of [Array(31).fill(item), [{ provider: "evil", model: "x" }], [{ ...item, model: "../secret" }], [{ ...item, model: "x".repeat(101) }], null]) expect(validChecks({ checks })).toBe(false);
});

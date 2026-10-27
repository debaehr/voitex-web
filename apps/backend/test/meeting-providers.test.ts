import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { transcribeMeeting, availableMeetingProviders } from "../src/providers/meetings.js";

// Mock the upstream transport, never the local application HTTP requests.
vi.mock("../src/providers/meeting-http.js", () => ({ meetingRequest: (url: string, init: RequestInit) => fetch(url, init) }));
let dir: string, file: string;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const mistralResult = { segments: [{ speaker_id: "spk_2", start: 0.5, end: 1.5, text: "Hello" }] };
let calls: Array<{ url: string; init?: RequestInit }>;
let mistralError = false, assemblyError = false;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "voitex-provider-")); file = join(dir, "test.webm");
  await writeFile(file, "audio");
  for (const key of ["MISTRAL_API_KEY", "ASSEMBLYAI_API_KEY", "MISTRAL_MEETING_MODEL", "ASSEMBLYAI_MEETING_MODEL"]) vi.stubEnv(key, "");
  vi.stubEnv("MISTRAL_API_KEY", "dummy-mistral"); vi.stubEnv("ASSEMBLYAI_API_KEY", "dummy-assembly");
  calls = []; mistralError = false; assemblyError = false;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    if (url.includes("mistral.ai")) return json(mistralResult, mistralError ? 500 : 200);
    if (assemblyError) throw new Error("secret-dummy-assembly");
    if (url.endsWith("/upload")) return json({ upload_url: "https://mock/upload" });
    if (url.endsWith("/transcript")) return json({ id: "job" });
    if (url.endsWith("/transcript/job")) return json({ status: "completed", utterances: [{ speaker: "B", start: 500, end: 1500, text: "Hello" }] });
    throw new Error(`Unexpected request: ${url}`);
  }));
});
afterEach(async () => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); await rm(dir, { recursive: true, force: true }); });

it("sends diarization, segment timestamps, explicit language, bounded correct lexicon terms and a long timeout", async () => {
  const timeout = vi.spyOn(AbortSignal, "timeout");
  const result = await transcribeMeeting(file, { language: "hr", contentType: "audio/webm", contextBias: ["  Voitex  ", "Voitex", "", ...Array.from({ length: 110 }, (_, n) => `Term${n}`)] });
  expect(result).toEqual({ provider: "mistral", model: "voxtral-mini-transcribe-3", attempts: [{ provider: "mistral", ok: true }], segments: [{ speaker: "spk_2", start: 0.5, end: 1.5, text: "Hello" }] });
  const form = calls[0].init!.body as FormData;
  expect(form.get("model")).toBe("voxtral-mini-transcribe-3"); expect(form.get("diarize")).toBe("true");
  expect(form.get("timestamp_granularities")).toBe("segment"); expect(form.get("language")).toBe("hr");
  expect(form.getAll("context_bias")).toHaveLength(100); expect(form.getAll("context_bias")[0]).toBe("Voitex");
  expect(form.get("file")).toMatchObject({ name: "test.webm", type: "audio/webm" });
  expect(timeout).toHaveBeenCalledWith(30 * 60 * 1000);
});
it.each([undefined, "auto"])("omits Mistral language for %s and supports the configured model", async language => {
  vi.stubEnv("MISTRAL_MEETING_MODEL", "custom-model");
  const result = await transcribeMeeting(file, { language });
  expect((calls[0].init!.body as FormData).has("language")).toBe(false); expect(result.model).toBe("custom-model");
});
it.each(["error", "missing-key", "over-three-hours"])("falls back to AssemblyAI for %s", async reason => {
  if (reason === "error") mistralError = true;
  if (reason === "missing-key") vi.stubEnv("MISTRAL_API_KEY", "");
  const result = await transcribeMeeting(file, { language: "en", durationSeconds: reason === "over-three-hours" ? 10801 : 3 });
  expect(result).toMatchObject({ provider: "assemblyai", model: "universal-2", segments: [{ speaker: "B", start: 0.5, end: 1.5, text: "Hello" }] });
  expect(result.attempts?.[0]).toEqual({ provider: "mistral", ok: false, reason: reason === "error" ? "Mistral: HTTP 500" : reason === "missing-key" ? "Mistral: no API key configured" : "Mistral: duration exceeds 3 hours" });
  expect(calls.some(call => call.url.includes("mistral.ai"))).toBe(reason === "error");
  const body = JSON.parse(calls.find(call => call.url.endsWith("/transcript"))!.init!.body as string);
  expect(body).toMatchObject({ speaker_labels: true, language_code: "en", speech_models: ["universal-2"] });
});
it("prefers AssemblyAI when selected and falls back in the reverse direction", async () => {
  expect((await transcribeMeeting(file, { provider: "assemblyai", language: "auto" })).provider).toBe("assemblyai");
  expect(calls.every(call => !call.url.includes("mistral.ai"))).toBe(true);
  expect(JSON.parse(calls.find(call => call.url.endsWith("/transcript"))!.init!.body as string)).toMatchObject({ language_detection: true });
  calls = []; assemblyError = true;
  expect((await transcribeMeeting(file, { provider: "assemblyai" })).provider).toBe("mistral");
});
it("never falls back to Mistral above three hours, or exposes upstream secrets", async () => {
  assemblyError = true;
  await expect(transcribeMeeting(file, { provider: "assemblyai", durationSeconds: 10801 })).rejects.toThrow("no available provider succeeded");
  expect(calls.some(call => call.url.includes("mistral.ai"))).toBe(false);
});
it("reports only providers with nonblank keys", () => {
  expect(availableMeetingProviders()).toEqual(["mistral", "assemblyai"]);
  vi.stubEnv("MISTRAL_API_KEY", "  "); expect(availableMeetingProviders()).toEqual(["assemblyai"]);
});
it("polls queued/processing AssemblyAI results until completed", async () => {
  vi.useFakeTimers();
  let polls = 0;
  vi.mocked(fetch).mockImplementation(async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith("/upload")) return json({ upload_url: "https://mock/upload" });
    if (String(url).endsWith("/transcript")) return json({ id: "job" });
    polls++; return polls < 3 ? json({ status: "processing" }) : json({ status: "completed", utterances: [{ speaker: "A", text: "Done", start: 0, end: 1000 }] });
  });
  const promise = transcribeMeeting(file, { provider: "assemblyai" });
  // File I/O is real; allow it to complete before advancing the polling timers.
  await vi.waitFor(() => expect(calls.length).toBeGreaterThanOrEqual(3));
  await vi.advanceTimersByTimeAsync(6000);
  expect((await promise).provider).toBe("assemblyai"); expect(polls).toBe(3);
});
it("allows a three-hour polling window then fails without disclosing provider errors", async () => {
  vi.useFakeTimers(); vi.stubEnv("MISTRAL_API_KEY", "");
  vi.mocked(fetch).mockImplementation(async url => {
    if (String(url).endsWith("/upload")) return json({ upload_url: "https://mock/upload" });
    if (String(url).endsWith("/transcript")) return json({ id: "job" });
    vi.setSystemTime(Date.now() + 3 * 60 * 60 * 1000 - 1000);
    calls.push({ url: String(url) }); return json({ status: "processing" });
  });
  const result = transcribeMeeting(file, { provider: "assemblyai" }).catch(error => error);
  await vi.waitFor(() => expect(calls).toHaveLength(1));
  await vi.advanceTimersByTimeAsync(1000);
  expect((await result).message).toContain("AssemblyAI: transcription timed out");
});

it("records safe HTTP reasons and logs one line for every failed attempt", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.mocked(fetch).mockImplementation(async url => String(url).includes("mistral.ai")
    ? json({ error: { type: "invalid_request" }, raw: "never expose this" }, 422)
    : json({ message: "Bearer dummy-assembly api_key=dummy-mistral sk-fake-secret" }, 401));
  const error = await transcribeMeeting(file).catch(error => error);
  expect(error.attempts).toHaveLength(2);
  expect(error.message).toContain("Mistral: HTTP 422 (invalid_request)");
  expect(error.message).toContain("AssemblyAI: HTTP 401");
  expect(log).toHaveBeenCalledTimes(2);
  const exposed = JSON.stringify([error.message, error.attempts, log.mock.calls]);
  for (const secret of ["dummy-assembly", "dummy-mistral", "sk-fake-secret", "never expose this"]) expect(exposed).not.toContain(secret);
});
it("retains the failed Mistral reason on a successful fallback", async () => {
  mistralError = true;
  const result = await transcribeMeeting(file);
  expect(result.attempts).toEqual([{ provider: "mistral", ok: false, reason: "Mistral: HTTP 500" }, { provider: "assemblyai", ok: true }]);
});
it.each(["upload", "transcript", "poll"])("diagnoses AssemblyAI failures during %s", async stage => {
  vi.stubEnv("MISTRAL_API_KEY", "");
  vi.mocked(fetch).mockImplementation(async url => {
    const path = String(url);
    if (stage === "upload" || (stage === "transcript" && path.endsWith("/transcript"))) return json({ code: "invalid_request" }, 422);
    if (path.endsWith("/upload")) return json({ upload_url: "https://mock/upload" });
    if (path.endsWith("/transcript")) return json({ id: "job" });
    return json({ status: "error", error: "invalid_audio" });
  });
  await expect(transcribeMeeting(file, { provider: "assemblyai" })).rejects.toThrow(stage === "poll" ? "HTTP 200 (invalid_audio)" : "HTTP 422 (invalid_request)");
});

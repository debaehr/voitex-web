import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, writeFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "node:http";
const { transcribeMeeting, processTranscript } = vi.hoisted(() => ({ transcribeMeeting: vi.fn(), processTranscript: vi.fn() }));
vi.mock("../src/providers/meetings.js", async original => ({ ...await original<typeof import("../src/providers/meetings.js")>(), transcribeMeeting }));
vi.mock("../src/providers/index.js", async original => ({ ...await original<typeof import("../src/providers/index.js")>(), processTranscript }));
import { createApp } from "../src/app.js";
import { AUDIO_RETENTION_MS, MeetingService } from "../src/meetings.js";
import { MeetingTranscriptionError } from "../src/providers/meetings.js";
import { providerError } from "../src/providers/meeting-diagnostics.js";
import { defaultPrompts } from "../src/prompts.js";
import * as persistence from "../src/persistence.js";

let dir: string;
const servers: Server[] = [], services: MeetingService[] = [], releases: Array<() => void> = [];
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "voitex-meeting-"));
  transcribeMeeting.mockReset().mockResolvedValue({ provider: "mistral", model: "mock-stt", segments: [
    { speaker: "raw-B", start: 0, end: 1, text: "Hello" },
    { speaker: "raw-A", start: 1, end: 2, text: "World" },
    { speaker: "raw-B", start: 2, end: 3, text: "Again" }
  ] });
  processTranscript.mockReset().mockResolvedValue({ text: "Protocol", provider: "Groq", model: "mock-llm" });
});
afterEach(async () => {
  releases.splice(0).forEach(release => release());
  for (const service of services.splice(0)) await service.dispose();
  for (const server of servers.splice(0)) await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); });
  vi.restoreAllMocks(); vi.unstubAllEnvs();
  await rm(dir, { recursive: true, force: true });
});
async function start(options: { resumeMeetingJobs?: boolean; meetingRetentionTimer?: boolean } = {}) {
  const app = createApp({ dataDir: dir, frontendDir: join(dir, "frontend"), resumeMeetingJobs: false, meetingRetentionTimer: false, ...options });
  const service = app.locals.meetings as MeetingService; services.push(service);
  await app.locals.meetingsReady;
  const server = app.listen(0, "127.0.0.1"); servers.push(server);
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address(); if (!address || typeof address === "string") throw Error("address");
  const base = `http://127.0.0.1:${address.port}`;
  const request = (path: string, method = "GET", body?: unknown, headers: Record<string, string> = {}) => fetch(base + "/api" + path, {
    method, headers: { ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const chunk = (id: string, part = 1, n = 0, body: BodyInit = "audio", type = "audio/webm") => fetch(`${base}/api/meetings/${id}/parts/${part}/chunks/${n}`, {
    method: "PUT", headers: { "Content-Type": type }, body
  });
  const create = async (source = "recording", fields = {}) => {
    const response = await request("/meetings", "POST", { source, language: "de", title: "Meeting", ...fields });
    expect(response.status).toBe(201); return (await response.json()).id as string;
  };
  const finish = async (id: string, body: unknown = {}) => { expect((await request(`/meetings/${id}/finish`, "POST", body)).status).toBe(202); await service.idle(); return await service.get(id); };
  return { request, chunk, create, finish, service };
}
async function saveSettings(providers = {}, fields = {}) {
  await writeFile(join(dir, "settings.json"), JSON.stringify({ version: 1,
    providers: { ...Object.fromEntries(Object.keys(defaultPrompts).map(key => [key, "openai"])), protocol: "groq", summary: "mistral", ...providers },
    prompts: { ...defaultPrompts, protocol: "Custom protocol", summary: "Custom summary" },
    lexicon: [{ spoken: "Voi Tex", correct: "Voitex" }], snippets: [], ownSpeakerName: "Ich", ...fields }));
}

describe("meeting HTTP contract and storage", () => {
  it("uploads idempotently and out of order, concatenates by index, and returns summary-only lists", async () => {
    const { create, chunk, finish, request, service } = await start(); const id = await create();
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    await Promise.all([chunk(id, 1, 2, "C"), chunk(id, 1, 0, "old"), chunk(id, 1, 1, "B")]);
    expect((await chunk(id, 1, 0, "A")).status).toBe(200);
    const meeting = await finish(id, { parts: [{ part: 1, chunkCount: 3 }] });
    expect(meeting.status).toBe("naming");
    const audio = await request(`/meetings/${id}/audio?part=1`);
    expect(audio.headers.get("content-type")).toBe("audio/webm"); expect(await audio.text()).toBe("ABC");
    expect((await chunk(id, 1, 3, "late")).status).toBe(409);
    const detail = await (await request(`/meetings/${id}`)).json(); expect(detail.protocol).toBe("");
    const list = await (await request("/meetings")).json(); expect(list).toHaveLength(1);
    for (const field of ["parts", "segments", "speakerNames", "protocol", "transcript"]) expect(list[0]).not.toHaveProperty(field);
    expect(JSON.parse(await readFile(join(dir, "meetings", id, "meeting.json"), "utf8"))).toEqual(await service.get(id));
    expect((await readdir(join(dir, "meetings", id))).some(name => name.endsWith(".tmp"))).toBe(false);
    expect((await request(`/meetings/${id}/finish`, "POST", {})).status).toBe(409);
  });
  it("parses binary chunks before JSON middleware and enforces the real 10 MB raw limit", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { create, chunk } = await start(); const id = await create();
    expect((await chunk(id, 1, 0, "invalid json", "application/json")).status).toBe(200);
    const response = await chunk(id, 1, 1, new Uint8Array(10 * 1024 * 1024 + 1));
    expect(response.status).toBe(413); expect(await response.json()).toEqual({ error: "Payload too large." });
    expect((await chunk(id, 1, 1, "")).status).toBe(400);
  });
  it("sniffs MP4 content types for binary upload chunks", async () => {
    const { create, chunk, finish, request } = await start(); const id = await create("upload");
    await chunk(id, 1, 0, new Uint8Array([0, 0, 0, 16, 102, 116, 121, 112, 77, 52, 65, 32]), "application/octet-stream");
    await finish(id); expect((await request(`/meetings/${id}/audio`)).headers.get("content-type")).toBe("audio/mp4");
  });
  it.each(["not-a-uuid", "..%2F..%2Fsettings.json", "%2e%2e%5csettings.json", "00000000-0000-0000-0000-000000000000"])("rejects unsafe ids %s", async id => {
    const { request } = await start();
    for (const suffix of ["", "/audio", "/parts/1/chunks/0"]) {
      const response = await request(`/meetings/${id}${suffix}`, suffix.includes("chunks") ? "PUT" : "GET", suffix.includes("chunks") ? {} : undefined);
      expect(response.status).toBe(400); expect(await response.json()).toHaveProperty("error");
    }
  });
  it.each(["-1", "01", "1.5", "100001", "1e2", "..%2F0"])("rejects invalid indices %s", async value => {
    const { create, request } = await start(); const id = await create();
    for (const path of [`/parts/1/chunks/${value}`, `/parts/${value}/chunks/0`]) expect((await request(`/meetings/${id}${path}`, "PUT", {})).status).toBe(400);
    expect((await request(`/meetings/${id}/audio?part=${value}`)).status).toBe(400);
  });
  it.each([{}, null, { source: "other", language: "de" }, { source: "recording", language: "../de" }, { source: "upload", language: "de", title: 3 }])("validates create payload %#", async body => {
    const { request } = await start(); expect((await request("/meetings", "POST", body)).status).toBe(400);
  });
  it.each([
    { durationSeconds: -1 }, { durationSeconds: "1" }, { parts: [{ part: 1, chunkCount: 0 }] },
    { parts: [{ part: 1, chunkCount: 2 }, { part: 1 }] }, { parts: [{ part: 0 }] },
    { parts: [{ part: 1, contentType: "text/html" }] }, { parts: [{ part: 1, startedAt: "bad" }] },
    { parts: [{ part: 1, startedAt: "2026-10-27T10:00:00Z", endedAt: "2026-10-27T09:00:00Z" }] },
  ])("validates finish metadata without closing the upload %#", async body => {
    const { request, create, chunk } = await start(); const id = await create();
    expect((await request(`/meetings/${id}/finish`, "POST", body)).status).toBe(400);
    expect((await chunk(id)).status).toBe(200);
  });
  it("detects missing indices including a missing final chunk declared in chunkCount", async () => {
    const { create, chunk, finish } = await start(); const id = await create();
    await chunk(id, 1, 2); const meeting = await finish(id, { parts: [{ part: 1, chunkCount: 4 }] });
    expect(meeting.status).toBe("error"); expect(meeting.error).toBe("missing chunk: part 1 [0, 1, 3]");
    expect(transcribeMeeting).not.toHaveBeenCalled(); expect(processTranscript).not.toHaveBeenCalled();
  });
  it("detects chunks absent on disk, missing entire parts and an empty recording", async () => {
    const { create, chunk, finish } = await start();
    let id = await create(); await chunk(id); await rm(join(dir, "meetings", id, "audio/part-1/chunk-0"));
    expect((await finish(id)).error).toContain("missing chunk");
    id = await create(); await chunk(id, 2); expect((await finish(id)).error).toContain("missing parts [1]");
    id = await create(); expect((await finish(id)).error).toContain("missing chunk");
  });
  it("returns JSON 404 for absent meetings and removes both obsolete synchronous endpoints", async () => {
    const { request } = await start();
    for (const path of ["/transcribe-meeting", "/summarize"]) expect((await request(path, "POST", {})).status).toBe(404);
    expect((await request("/meetings/12345678-1234-4234-8234-123456789abc")).status).toBe(404);
  });
});

describe("meeting jobs", () => {
  it.each(["recording", "upload"])("persists the complete status sequence and uses the configured %s prompt/provider", async source => {
    await saveSettings({ meetings: "assemblyai" });
    const statuses: string[] = []; const write = persistence.writeJsonFile;
    vi.spyOn(persistence, "writeJsonFile").mockImplementation(async (path, data) => {
      if (path.endsWith("meeting.json")) statuses.push((data as { status: string }).status);
      return write(path, data);
    });
    const { create, chunk, finish, request, service } = await start(); const id = await create(source); await chunk(id);
    let meeting = await finish(id, { durationSeconds: 10801 });
    expect(meeting.status).toBe("naming"); expect(meeting.progress).toBe(100);
    expect(processTranscript).not.toHaveBeenCalled();
    expect((await request(`/meetings/${id}/protocol`, "POST")).status).toBe(202);
    await service.idle(); meeting = await service.get(id);
    expect(meeting.durationSeconds).toBe(10801);
    expect(statuses.filter((status, n) => n === 0 || statuses[n - 1] !== status)).toEqual(["queued", "transcribing", "naming", "queued", "summarizing", "done"]);
    const task = source === "recording" ? "protocol" : "summary";
    expect(processTranscript).toHaveBeenCalledWith(task === "protocol" ? "groq" : "mistral", expect.objectContaining({ task, instructions: `Custom ${task}` }));
    expect(transcribeMeeting).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ language: "de", contextBias: ["Voitex"], durationSeconds: 10801, provider: "assemblyai" }));
    expect(meeting).toMatchObject({ progress: 100, provider: "mistral", model: "mock-stt", protocolProvider: "Groq", protocolModel: "mock-llm" });
  });
  it("defaults legacy settings to Mistral and maps speakers independently per part with interruption markers", async () => {
    await saveSettings();
    const { create, chunk, finish, request, service } = await start(); const id = await create();
    await chunk(id, 2); await chunk(id, 1);
    let meeting = await finish(id, { parts: [
      { part: 1, startedAt: "2026-10-27T10:00:00Z", endedAt: "2026-10-27T10:00:03Z" },
      { part: 2, startedAt: "2026-10-27T10:02:00Z", endedAt: "2026-10-27T10:02:03Z" }
    ] });
    expect(transcribeMeeting).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ provider: "mistral" }));
    expect(meeting.segments.map(segment => segment.speakerLabel)).toEqual(["Sprecher 1", "Sprecher 2", "Sprecher 1", "Teil 2 · Sprecher 1", "Teil 2 · Sprecher 2", "Teil 2 · Sprecher 1"]);
    expect(meeting.segments[0]).toMatchObject({ speaker: "raw-B", speakerId: "1:raw-B" });
    expect(meeting.transcript).toContain("[Unterbrechung 11:00–11:02]"); expect(meeting.durationSeconds).toBe(6);
    expect((await request(`/meetings/${id}`, "PATCH", { title: "Renamed", speakerNames: { "1:raw-B": "Anna", "2:raw-A": "Anna" } })).status).toBe(200);
    meeting = await service.get(id); expect(meeting.title).toBe("Renamed"); expect(meeting.transcript.match(/Anna:/g)).toHaveLength(3);
    expect(meeting.segments[0].speaker).toBe("raw-B");
    expect((await request(`/meetings/${id}/protocol`, "POST", {})).status).toBe(202); await service.idle();
    expect(processTranscript.mock.calls.at(-1)![1].transcript).toContain("Anna: Hello"); expect(transcribeMeeting).toHaveBeenCalledTimes(2);
    expect((await request(`/meetings/${id}`, "PATCH", { speakerNames: { "unknown": "Name" } })).status).toBe(400);
    expect((await request(`/meetings/${id}`, "PATCH", { speakerNames: { "1:raw-B": "" } })).status).toBe(400);
  });
  it("does not generate a protocol from an incomplete multipart transcription", async () => {
    const result = await transcribeMeeting(); transcribeMeeting.mockClear();
    transcribeMeeting.mockResolvedValueOnce(result).mockRejectedValueOnce(new Error("Failed part 2"));
    const { create, chunk, finish, request } = await start(); const id = await create();
    await chunk(id, 1); await chunk(id, 2); const meeting = await finish(id);
    expect(meeting.status).toBe("error"); expect(meeting.segments).toHaveLength(3);
    expect((await request(`/meetings/${id}/protocol`, "POST", {})).status).toBe(409);
    expect(processTranscript).not.toHaveBeenCalled();
  });
  it("uses the default prompts when settings are absent", async () => {
    const { create, chunk, finish, request, service } = await start(); const id = await create(); await chunk(id); await finish(id);
    expect((await request(`/meetings/${id}/protocol`, "POST")).status).toBe(202); await service.idle();
    expect(processTranscript).toHaveBeenCalledWith("mistral", expect.objectContaining({ instructions: defaultPrompts.protocol }));
  });
  it("sanitizes errors, retries with the other provider, and reuses transcription for a failed protocol", async () => {
    transcribeMeeting.mockRejectedValueOnce(new Error("secret-upstream-key"));
    const { create, chunk, finish, request, service } = await start(); const id = await create(); await chunk(id);
    expect((await finish(id)).error).toBe("Meeting transcription failed.");
    expect((await request(`/meetings/${id}/retry`, "POST", { provider: "invalid" })).status).toBe(400);
    expect((await request(`/meetings/${id}/retry`, "POST", { provider: "assemblyai" })).status).toBe(202); await service.idle();
    expect(transcribeMeeting.mock.calls.at(-1)![1].provider).toBe("assemblyai");
    processTranscript.mockRejectedValueOnce(new Error("secret-llm-key"));
    await request(`/meetings/${id}/protocol`, "POST", {}); await service.idle();
    expect((await service.get(id)).error).toBe("Meeting protocol generation failed.");
    const count = transcribeMeeting.mock.calls.length;
    await request(`/meetings/${id}/retry`, "POST", {}); await service.idle();
    expect((await service.get(id)).status).toBe("done"); expect(transcribeMeeting).toHaveBeenCalledTimes(count);
    const responses = [await (await request(`/meetings/${id}`)).text(), await (await request("/meetings")).text(), await (await request("/providers")).text()];
    expect(responses.join("")).not.toContain("secret-");
  });
  it("limits parallel jobs to two and refuses duplicate work for the same meeting", async () => {
    let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; }); releases.push(release);
    const result = await transcribeMeeting(); transcribeMeeting.mockClear();
    transcribeMeeting.mockImplementation(async () => { await gate; return result; });
    const { create, chunk, request, service } = await start(); const ids: string[] = [];
    for (let n = 0; n < 4; n++) { const id = await create(); ids.push(id); await chunk(id); await request(`/meetings/${id}/finish`, "POST", {}); }
    await vi.waitFor(() => expect(transcribeMeeting).toHaveBeenCalledTimes(2));
    expect((await request(`/meetings/${ids[0]}/finish`, "POST", {})).status).toBe(409);
    expect((await request(`/meetings/${ids[0]}/protocol`, "POST", {})).status).toBe(409);
    expect((await request(`/meetings/${ids[0]}/retry`, "POST", {})).status).toBe(409);
    release(); await service.idle(); expect(transcribeMeeting).toHaveBeenCalledTimes(4);
    for (const id of ids) expect((await service.get(id)).status).toBe("naming");
  });
  it.each(["queued", "transcribing", "summarizing"])("resumes a persisted %s job only when enabled", async status => {
    const first = await start(); const id = await first.create(); await first.chunk(id);
    const stored = await first.service.get(id); stored.finishedAt = stored.createdAt; stored.status = status as typeof stored.status; stored.job = "transcribe";
    if (status === "summarizing") { stored.job = "protocol"; stored.parts[0].durationSeconds = 1;
      stored.segments = [{ speaker: "A", speakerId: "1:A", speakerLabel: "Sprecher 1", part: 1, start: 0, end: 1, text: "Persisted" }]; }
    await first.service.dispose(); await writeFile(join(dir, "meetings", id, "meeting.json"), JSON.stringify(stored));
    const disabled = await start(); await disabled.service.idle(); expect(transcribeMeeting).not.toHaveBeenCalled(); expect(processTranscript).not.toHaveBeenCalled();
    const second = await start({ resumeMeetingJobs: true }); await second.service.idle();
    expect((await second.service.get(id)).status).toBe(status === "summarizing" ? "done" : "naming"); expect(transcribeMeeting).toHaveBeenCalledTimes(status === "summarizing" ? 0 : 1);
  });
  it("leaves unfinished recordings open on restart", async () => {
    const first = await start(); const id = await first.create(); await first.chunk(id); await first.service.dispose();
    const second = await start({ resumeMeetingJobs: true }); await second.service.idle();
    expect((await second.chunk(id, 1, 1)).status).toBe(200); expect(transcribeMeeting).not.toHaveBeenCalled();
  });
  it("does not recreate a meeting deleted during an upstream request", async () => {
    let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; }); releases.push(release);
    const result = await transcribeMeeting(); transcribeMeeting.mockClear(); transcribeMeeting.mockImplementation(async () => { await gate; return result; });
    const { create, chunk, request, service } = await start(); const id = await create(); await chunk(id); await request(`/meetings/${id}/finish`, "POST", {});
    await vi.waitFor(() => expect(transcribeMeeting).toHaveBeenCalledTimes(1));
    expect((await request(`/meetings/${id}`, "DELETE")).status).toBe(200); release(); await service.idle();
    expect((await request(`/meetings/${id}`)).status).toBe(404); expect(await readdir(join(dir, "meetings"))).toEqual([]);
  });
});

describe("audio retention", () => {
  it("retains audio for 24 hours after naming, removes it after expiry and keeps the transcript", async () => {
    const { create, chunk, finish, request, service } = await start(); const id = await create(); await chunk(id); const done = await finish(id);
    expect(Date.parse(done.audioExpiresAt!) - Date.parse(done.transcribedAt!)).toBeCloseTo(AUDIO_RETENTION_MS, -2);
    await service.cleanup(Date.parse(done.audioExpiresAt!) - 1); expect((await request(`/meetings/${id}/audio`)).status).toBe(200);
    await service.cleanup(Date.parse(done.audioExpiresAt!)); expect((await request(`/meetings/${id}/audio`)).status).toBe(404);
    expect(await service.get(id)).toMatchObject({ transcript: done.transcript, protocol: done.protocol, audioDeletedAt: expect.any(String) });
    expect((await request(`/meetings/${id}/protocol`, "POST", {})).status).toBe(202); await service.idle(); expect((await service.get(id)).status).toBe("done");
  });
  it("deletes audio immediately and deletes an entire meeting including backups and audio", async () => {
    const { create, chunk, finish, request, service } = await start(); const id = await create(); await chunk(id); await finish(id);
    expect((await request(`/meetings/${id}/audio`, "DELETE")).status).toBe(200);
    expect((await request(`/meetings/${id}/audio`, "DELETE")).status).toBe(200);
    expect((await request(`/meetings/${id}/audio`)).status).toBe(404); expect((await service.get(id)).audioDeletedAt).toBeTruthy();
    const another = await create(); await chunk(another); await finish(another);
    expect((await request(`/meetings/${another}`, "DELETE")).status).toBe(200);
    expect((await request(`/meetings/${another}/audio`)).status).toBe(404);
    expect((await readdir(join(dir, "meetings"))).includes(another)).toBe(false);
  });
  it("checks expiry on startup and does not extend it when regenerating", async () => {
    const first = await start(); const id = await first.create(); await first.chunk(id); const done = await first.finish(id);
    await first.request(`/meetings/${id}/protocol`, "POST", {}); await first.service.idle();
    expect((await first.service.get(id)).audioExpiresAt).toBe(done.audioExpiresAt);
    await first.service.dispose(); done.audioExpiresAt = new Date(Date.now() - 1).toISOString();
    await writeFile(join(dir, "meetings", id, "meeting.json"), JSON.stringify(done));
    const second = await start({ resumeMeetingJobs: true }); expect((await second.request(`/meetings/${id}/audio`)).status).toBe(404);
  });
  it("uses an unref'd hourly timer and disables it in ordinary unit tests", async () => {
    const interval = vi.spyOn(globalThis, "setInterval");
    await start(); expect(interval).not.toHaveBeenCalled();
    await start({ meetingRetentionTimer: true });
    expect(interval).toHaveBeenCalledWith(expect.any(Function), 60 * 60 * 1000);
    const timer = interval.mock.results.at(-1)!.value as NodeJS.Timeout; expect(timer.hasRef()).toBe(false);
  });
});

it.each([undefined, "mistral", "assemblyai", "openai", null])("validates the optional settings meeting provider %s while preserving old settings", async provider => {
  await saveSettings(); const { request } = await start(); const settings = JSON.parse(await readFile(join(dir, "settings.json"), "utf8"));
  if (provider !== undefined) settings.providers.meetings = provider;
  const response = await request("/settings", "PUT", settings);
  expect(response.status).toBe(provider === "openai" || provider === null ? 400 : 200);
  if (response.ok) expect(await (await request("/settings")).json()).toEqual(settings);
});

it.each([true, false])("persists safe provider attempts and exposes them through the API (success=%s)", async success => {
  const secret = "fake-provider-key-123456789";
  vi.stubEnv("MISTRAL_API_KEY", secret);
  const attempts = [{ provider: "mistral" as const, ok: false, reason: providerError("Mistral", 422, { message: `invalid_request Bearer ${secret}` }).message },
    { provider: "assemblyai" as const, ok: success, ...(success ? {} : { reason: "AssemblyAI: no API key configured" }) }];
  if (success) transcribeMeeting.mockResolvedValue({ provider: "assemblyai", model: "test", segments: [{ speaker: "A", start: 0, end: 1, text: "Hello" }], attempts });
  else transcribeMeeting.mockRejectedValue(new MeetingTranscriptionError(attempts));
  const { create, chunk, finish, request } = await start(); const id = await create(); await chunk(id);
  const meeting = await finish(id);
  expect(meeting.providerAttempts).toEqual(attempts);
  expect(meeting.status).toBe(success ? "naming" : "error");
  if (!success) { expect(meeting.error).toContain("Mistral: HTTP 422"); expect(meeting.error).toContain("AssemblyAI: no API key configured"); }
  const stored = await readFile(join(dir, "meetings", id, "meeting.json"), "utf8");
  const response = await (await request(`/meetings/${id}`)).text();
  expect(JSON.parse(stored).providerAttempts).toEqual(attempts);
  expect(response).toContain("providerAttempts"); expect(stored + response).not.toContain(secret);
});

describe("speaker naming before the protocol", () => {
  it.each(["recording", "upload"])("persists participants and stops at naming for %s, then generates and regenerates with names", async source => {
    await saveSettings();
    const { create, chunk, finish, request, service } = await start();
    const id = await create(source, { participants: [" Anna ", "BEN", "anna"] }); await chunk(id);
    const naming = await finish(id);
    expect(naming).toMatchObject({ participants: ["Anna", "BEN"], status: "naming", progress: 100, protocol: "", job: "protocol" });
    expect(processTranscript).not.toHaveBeenCalled();
    expect(transcribeMeeting).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ contextBias: ["Voitex", "Anna", "BEN"], meetingFallback: false }));
    const response = await request(`/meetings/${id}/protocol`, "POST", { speakerNames: { "1:raw-B": " Anna ", "1:raw-A": "Ben" } });
    expect(response.status).toBe(202); expect(await response.json()).toEqual({ status: "queued" }); await service.idle();
    const done = await service.get(id); expect(done.status).toBe("done"); expect(done.speakerNames).toEqual({ "1:raw-B": "Anna", "1:raw-A": "Ben" });
    const task = source === "recording" ? "protocol" : "summary";
    expect(processTranscript).toHaveBeenCalledWith(source === "recording" ? "groq" : "mistral", expect.objectContaining({ task, instructions: `Custom ${task}`,
      transcript: expect.stringContaining("Teilnehmende: Anna, BEN\n\n[00:00:00] Anna: Hello") }));
    expect((await request(`/meetings/${id}/protocol`, "POST", { speakerNames: { "1:raw-B": "Carla" } })).status).toBe(202); await service.idle();
    expect(processTranscript.mock.calls.at(-1)![1].transcript).toContain("Carla: Hello");
    expect((await service.get(id)).audioExpiresAt).toBe(naming.audioExpiresAt);
    expect(transcribeMeeting).toHaveBeenCalledTimes(1);
  });
  it("supports body-less protocol creation without assigning names", async () => {
    const { create, chunk, finish, request, service } = await start(); const id = await create(); await chunk(id); await finish(id);
    expect((await request(`/meetings/${id}/protocol`, "POST")).status).toBe(202); await service.idle();
    expect((await service.get(id)).speakerNames).toEqual({});
    expect(processTranscript).toHaveBeenCalledWith("mistral", expect.objectContaining({ transcript: expect.stringContaining("Sprecher 1: Hello") }));
  });
  it.each([null, "Anna", [""], ["   "], [42], ["x".repeat(61)], Array(21).fill("Anna")])("rejects invalid participants on create and PATCH (%j)", async participants => {
    const { create, request, service } = await start();
    expect((await request("/meetings", "POST", { source: "upload", language: "de", participants })).status).toBe(400);
    const id = await create();
    expect((await request(`/meetings/${id}`, "PATCH", { participants, title: "Should not persist" })).status).toBe(400);
    expect((await service.get(id)).title).toBe("Meeting"); expect((await service.get(id)).participants).toBeUndefined();
  });
  it("accepts boundary participant sizes, deduplicates and allows clearing via PATCH", async () => {
    const { create, request, service } = await start(); const id = await create("upload", { participants: [] });
    const names = [" x".trim().repeat(60), ...Array.from({ length: 19 }, (_, n) => `Name ${n}`)];
    expect((await request(`/meetings/${id}`, "PATCH", { participants: names })).status).toBe(200);
    expect((await service.get(id)).participants).toEqual(names);
    expect((await request(`/meetings/${id}`, "PATCH", { participants: [" Müller ", "MÜLLER", "Ben"] })).status).toBe(200);
    expect((await service.get(id)).participants).toEqual(["Müller", "Ben"]);
    expect((await request(`/meetings/${id}`, "PATCH", { participants: [] })).status).toBe(200);
    expect((await service.get(id)).participants).toEqual([]);
  });
  it.each([null, [], { speakerNames: null }, { speakerNames: [] }, { speakerNames: { "1:raw-B": "" } },
    { speakerNames: { "1:raw-B": "x".repeat(101) } }, { speakerNames: { "unknown": "Anna" } }, { participants: ["Anna"] }
  ])("validates protocol payload without changing naming state (%j)", async body => {
    const { create, chunk, finish, request, service } = await start(); const id = await create(); await chunk(id); await finish(id);
    expect((await request(`/meetings/${id}/protocol`, "POST", body)).status).toBe(400);
    expect((await service.get(id)).status).toBe("naming"); expect(processTranscript).not.toHaveBeenCalled();
  });
  it.each(["queued", "transcribing", "summarizing", "error"])("rejects protocol creation from %s", async status => {
    const { create, chunk, finish, request, service } = await start(); const id = await create(); await chunk(id);
    const meeting = await finish(id); meeting.status = status as typeof meeting.status;
    await writeFile(join(dir, "meetings", id, "meeting.json"), JSON.stringify(meeting));
    expect((await request(`/meetings/${id}/protocol`, "POST")).status).toBe(409);
    expect((await service.get(id)).status).toBe(status); expect(processTranscript).not.toHaveBeenCalled();
  });
  it.each([undefined, false, true])("passes only the explicit meetingFallback opt-in from persisted settings (%s)", async meetingFallback => {
    await saveSettings({}, meetingFallback === undefined ? {} : { meetingFallback });
    const { create, chunk, finish } = await start(); const id = await create(); await chunk(id); await finish(id);
    expect(transcribeMeeting).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ meetingFallback: meetingFallback === true }));
  });
  it("caps combined lexicon and participant terms with case-insensitive deduplication", async () => {
    await saveSettings({}, { lexicon: [{ spoken: "", correct: "Anna" }, { correct: "ANNA" }, ...Array.from({ length: 98 }, (_, n) => ({ correct: `Term${n}` }))] });
    const { create, chunk, finish } = await start(); const id = await create("upload", { participants: ["anna", " Ben ", "Carla"] }); await chunk(id); await finish(id);
    const terms = transcribeMeeting.mock.calls[0][1].contextBias;
    expect(terms).toHaveLength(100); expect(terms[0]).toBe("Anna"); expect(terms.at(-1)).toBe("Ben"); expect(terms).not.toContain("Carla");
  });
  it("retries transcription to naming and retries protocol errors without retranscription even with a provider", async () => {
    transcribeMeeting.mockRejectedValueOnce(new Error("private-transcription-key"));
    const { create, chunk, finish, request, service } = await start(); const id = await create(); await chunk(id); await finish(id);
    expect((await service.get(id)).job).toBe("transcribe");
    expect((await request(`/meetings/${id}/retry`, "POST", { provider: "assemblyai" })).status).toBe(202); await service.idle();
    expect((await service.get(id)).status).toBe("naming");
    expect(transcribeMeeting.mock.calls.at(-1)![1]).toMatchObject({ provider: "assemblyai", meetingFallback: false });
    processTranscript.mockRejectedValueOnce(new Error("private-protocol-key"));
    expect((await request(`/meetings/${id}/protocol`, "POST")).status).toBe(202); await service.idle();
    expect(await service.get(id)).toMatchObject({ status: "error", job: "protocol", error: "Meeting protocol generation failed." });
    await request(`/meetings/${id}/audio`, "DELETE");
    expect((await request(`/meetings/${id}/retry`, "POST", { provider: "mistral" })).status).toBe(202); await service.idle();
    expect((await service.get(id)).status).toBe("done"); expect(transcribeMeeting).toHaveBeenCalledTimes(2);
  });
  it.each(["naming", "done", "error"])("leaves persisted %s records untouched on restart, including legacy done records", async status => {
    const first = await start(); const id = await first.create(); await first.chunk(id); const stored = await first.finish(id);
    stored.status = status as typeof stored.status;
    if (status === "done") { delete stored.participants; delete stored.transcribedAt; delete stored.job; stored.protocol = "Old protocol"; }
    const serialized = JSON.stringify(stored);
    await first.service.dispose(); await writeFile(join(dir, "meetings", id, "meeting.json"), serialized);
    transcribeMeeting.mockClear(); processTranscript.mockClear();
    const second = await start({ resumeMeetingJobs: true }); await second.service.idle();
    expect(transcribeMeeting).not.toHaveBeenCalled(); expect(processTranscript).not.toHaveBeenCalled();
    expect(await readFile(join(dir, "meetings", id, "meeting.json"), "utf8")).toBe(serialized);
    if (status === "done") {
      expect((await second.request(`/meetings/${id}/protocol`, "POST")).status).toBe(202); await second.service.idle();
      expect((await second.service.get(id)).status).toBe("done");
    }
  });
});

it("applies lexicon rules and trims raw segments, merges only consecutive same-speaker paragraphs within a part, and uses Berlin summer time", async () => {
  await saveSettings();
  transcribeMeeting.mockResolvedValue({ provider: "mistral", model: "test", segments: [
    { speaker: "A", start: 0, end: 1, text: " Voi Tex " }, { speaker: "A", start: 1, end: 2, text: " again " },
    { speaker: "B", start: 2, end: 3, text: " Hi " }, { speaker: "A", start: 3, end: 4, text: " Bye " }
  ] });
  const { create, chunk, finish, request, service } = await start(); const id = await create(); await chunk(id, 1); await chunk(id, 2);
  const meeting = await finish(id, { parts: [
    { part: 1, startedAt: "2026-06-27T10:00:00Z", endedAt: "2026-06-27T10:00:04Z" },
    { part: 2, startedAt: "2026-06-27T10:02:00Z", endedAt: "2026-06-27T10:02:04Z" }
  ] });
  expect(meeting.segments).toHaveLength(8); expect(meeting.segments.map(segment => segment.text)).toEqual(["Voitex", "again", "Hi", "Bye", "Voitex", "again", "Hi", "Bye"]);
  expect(meeting.transcript.split("\n")).toEqual([
    "[00:00:00] Sprecher 1: Voitex again", "[00:00:02] Sprecher 2: Hi", "[00:00:03] Sprecher 1: Bye",
    "[Unterbrechung 12:00–12:02]", "[00:00:00] Teil 2 · Sprecher 1: Voitex again", "[00:00:02] Teil 2 · Sprecher 2: Hi", "[00:00:03] Teil 2 · Sprecher 1: Bye"
  ]);
  await request(`/meetings/${id}/protocol`, "POST"); await service.idle();
  expect(processTranscript.mock.calls[0][1].transcript).toBe(meeting.transcript);
});

it("serves HTTP byte ranges with the correct audio content type for seeking during naming", async () => {
  const { create, chunk, finish, request } = await start(); const id = await create(); await chunk(id, 1, 0, "0123456789"); await finish(id);
  const response = await request(`/meetings/${id}/audio?part=1`, "GET", undefined, { Range: "bytes=3-6" });
  expect(response.status).toBe(206); expect(response.headers.get("accept-ranges")).toBe("bytes");
  expect(response.headers.get("content-range")).toBe("bytes 3-6/10"); expect(response.headers.get("content-length")).toBe("4");
  expect(response.headers.get("content-type")).toBe("audio/webm"); expect(await response.text()).toBe("3456");
  expect((await request(`/meetings/${id}/audio`, "GET", undefined, { Range: "bytes=20-" })).status).toBe(416);
});

it("expires audio after naming even while protocol generation is running", async () => {
  const { create, chunk, finish, request, service } = await start(); const id = await create(); await chunk(id); const meeting = await finish(id);
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; }); releases.push(release);
  processTranscript.mockImplementationOnce(async () => { await gate; return { text: "Protocol", provider: "Mistral", model: "test" }; });
  await request(`/meetings/${id}/protocol`, "POST"); await vi.waitFor(() => expect(processTranscript).toHaveBeenCalledTimes(1));
  await service.cleanup(Date.parse(meeting.audioExpiresAt!));
  expect((await request(`/meetings/${id}/audio`)).status).toBe(404);
  release(); await service.idle(); expect((await service.get(id)).status).toBe("done");
  expect((await service.get(id)).audioExpiresAt).toBe(meeting.audioExpiresAt);
});

it.each([undefined, false, true, null, "false", 1])("validates additive meetingFallback settings (%j)", async meetingFallback => {
  await saveSettings(); const { request } = await start(); const settings = JSON.parse(await readFile(join(dir, "settings.json"), "utf8"));
  if (meetingFallback !== undefined) settings.meetingFallback = meetingFallback;
  const response = await request("/settings", "PUT", settings);
  expect(response.status).toBe(meetingFallback === undefined || typeof meetingFallback === "boolean" ? 200 : 400);
  if (response.ok) { expect(await (await request("/settings")).json()).toEqual(settings); expect(settings.version).toBe(1); }
});

it.each(["recording", "upload"])("routes %s text generation to Claude while keeping meeting STT separate", async source => {
  await saveSettings({ protocol: "anthropic", summary: "anthropic", meetings: "mistral" });
  processTranscript.mockResolvedValue({ text: "Claude protocol", provider: "Claude", model: "fallback-model" });
  const { create, chunk, finish, request, service } = await start();
  const id = await create(source); await chunk(id); await finish(id);
  expect((await request(`/meetings/${id}/protocol`, "POST")).status).toBe(202); await service.idle();
  const task = source === "recording" ? "protocol" : "summary";
  expect(processTranscript).toHaveBeenCalledWith("anthropic", expect.objectContaining({ task, instructions: `Custom ${task}` }));
  expect(transcribeMeeting).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ provider: "mistral" }));
  expect(await service.get(id)).toMatchObject({ status: "done", protocol: "Claude protocol", protocolProvider: "Claude", protocolModel: "fallback-model" });
});

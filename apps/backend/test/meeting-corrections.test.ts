import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "node:http";
const { transcribeMeeting, processTranscript } = vi.hoisted(() => ({ transcribeMeeting: vi.fn(), processTranscript: vi.fn() }));
vi.mock("../src/providers/meetings.js", async original => ({ ...await original<typeof import("../src/providers/meetings.js")>(), transcribeMeeting }));
vi.mock("../src/providers/index.js", async original => ({ ...await original<typeof import("../src/providers/index.js")>(), processTranscript }));
import { createApp } from "../src/app.js";
import { AUDIO_RETENTION_MS, MeetingService, type Meeting } from "../src/meetings.js";
import { defaultPrompts } from "../src/prompts.js";

let dir: string, server: Server, service: MeetingService;
let request: (path: string, method?: string, body?: unknown) => Promise<Response>;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "voitex-corrections-"));
  transcribeMeeting.mockReset().mockResolvedValue({ provider: "mistral", model: "mock", segments: [
    { speaker: "B", start: 0, end: 1, text: "First." },
    { speaker: "B", start: 1, end: 2, text: "Second." },
    { speaker: "A", start: 2, end: 3, text: "Third." }
  ] });
  processTranscript.mockReset().mockResolvedValue({ text: "Protocol", provider: "Mistral", model: "mock" });
  const app = createApp({ dataDir: dir, frontendDir: join(dir, "frontend"), resumeMeetingJobs: false, meetingRetentionTimer: false });
  service = app.locals.meetings; await app.locals.meetingsReady;
  server = app.listen(0, "127.0.0.1"); await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address(); if (!address || typeof address === "string") throw Error("address");
  request = (path, method = "GET", body) => fetch(`http://127.0.0.1:${address.port}/api${path}`, {
    method, ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
  });
});
afterEach(async () => {
  await service.dispose();
  await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); });
  await rm(dir, { recursive: true, force: true });
});
async function transcribed(source: "recording" | "upload" = "recording", parts = 1) {
  const id = await service.create({ source, title: "Review", language: "de" });
  for (let part = 1; part <= parts; part++) await service.upload(id, part, 0, Buffer.from("audio"), "audio/webm");
  await service.finish(id, []); await service.idle(); return await service.get(id);
}
const patch = (id: string, body: unknown) => request(`/meetings/${id}`, "PATCH", body);
const storedPath = (id: string) => join(dir, "meetings", id, "meeting.json");
async function store(meeting: Meeting) { await writeFile(storedPath(meeting.id), JSON.stringify(meeting)); }

describe("manual speaker corrections", () => {
  it("reassigns existing and new speakers, preserves raw ids and names, and rebuilds transcript and prompt", async () => {
    const meeting = await transcribed();
    await patch(meeting.id, { speakerNames: { "1:B": "Anna", "1:A": "Ben" } });
    const response = await patch(meeting.id, { segmentSpeakers: { "0": "1:A", "1": "1:manual-1" } });
    expect(response.status).toBe(200);
    const changed = await response.json() as Meeting;
    expect(changed.segments.map(segment => segment.speaker)).toEqual(["B", "B", "A"]);
    expect(changed.segments.map(segment => segment.speakerId)).toEqual(["1:A", "1:manual-1", "1:A"]);
    expect(changed.segments[1].speakerLabel).toBe("Sprecher 3");
    expect(changed.speakerNames["1:B"]).toBe("Anna");
    expect(changed.transcript).toBe("[00:00:00] Ben: First.\n[00:00:01] Sprecher 3: Second.\n[00:00:02] Ben: Third.");
    expect((await request(`/meetings/${meeting.id}/protocol`, "POST", { speakerNames: { "1:manual-1": "Carla" } })).status).toBe(202);
    await service.idle();
    expect(processTranscript.mock.calls[0][1].transcript).toContain("Carla: Second.");
    expect(processTranscript.mock.calls[0][1].transcript).toContain("Ben: First.");
    const result = await patch(meeting.id, { segmentSpeakers: { "0": "1:manual-2", "2": "1:manual-2" } });
    expect(result.status).toBe(200);
    expect((await result.json()).segments[0].speakerLabel).toBe("Sprecher 1");
    expect(processTranscript).toHaveBeenCalledTimes(1);
  });
  it("reuses one new speaker for multiple segments and supports names in the same atomic PATCH", async () => {
    const meeting = await transcribed();
    expect((await patch(meeting.id, { segmentSpeakers: { "0": "1:manual-1", "1": "1:manual-1" }, speakerNames: { "1:manual-1": "Carla" } })).status).toBe(200);
    const changed = await service.get(meeting.id);
    expect(changed.transcript).toContain("Carla: First. Second.");
    expect(changed.segments[0].speakerLabel).toBe(changed.segments[1].speakerLabel);
  });
  it.each([
    { segmentSpeakers: null }, { segmentSpeakers: [] }, { segmentSpeakers: { "-1": "1:A" } },
    { segmentSpeakers: { "01": "1:A" } }, { segmentSpeakers: { "1.0": "1:A" } },
    { segmentSpeakers: { "3": "1:A" } }, { segmentSpeakers: { "99999999999999999999": "1:A" } },
    { segmentSpeakers: { "0": 3 } }, { segmentSpeakers: { "0": "1:unknown" } },
    { segmentSpeakers: { "0": "1:manual-0" } }, { segmentSpeakers: { "0": "1:manual-01" } },
    { segmentSpeakers: { "0": "1:manual-1", "1": "1:unknown" }, title: "Must not persist" },
    JSON.parse('{"segmentSpeakers":{"__proto__":"1:A"}}'), { resetSpeakers: false }, { resetSpeakers: "true" },
    { resetSpeakers: true, segmentSpeakers: { "0": "1:A" } }, { unexpected: true }
  ])("rejects invalid corrections without changing persisted bytes (%j)", async input => {
    const meeting = await transcribed(); const before = await readFile(storedPath(meeting.id), "utf8");
    expect((await patch(meeting.id, input)).status).toBe(400);
    expect(await readFile(storedPath(meeting.id), "utf8")).toBe(before);
  });
  it.each(["2:A", "2:manual-1"])("rejects a speaker from another part (%s)", async target => {
    const meeting = await transcribed("recording", 2);
    expect((await patch(meeting.id, { segmentSpeakers: { "0": target } })).status).toBe(400);
  });
  it.each(["queued", "transcribing", "summarizing", "error"] as const)("rejects corrections and resets in %s", async status => {
    const meeting = await transcribed(); meeting.status = status; await store(meeting);
    for (const body of [{ segmentSpeakers: { "0": "1:A" } }, { resetSpeakers: true }]) expect((await patch(meeting.id, body)).status).toBe(409);
  });
  it("resets each part exactly to the provider order and labels, keeping raw text and old names", async () => {
    const meeting = await transcribed("recording", 2);
    expect((await patch(meeting.id, { segmentSpeakers: { "0": "1:manual-1", "3": "2:manual-1" }, speakerNames: { "1:manual-1": "Carla" } })).status).toBe(200);
    expect((await service.get(meeting.id)).segments[3]).toMatchObject({ speakerId: "2:manual-1", speakerLabel: "Teil 2 · Sprecher 3" });
    const response = await patch(meeting.id, { resetSpeakers: true }); expect(response.status).toBe(200);
    const restored = await response.json() as Meeting;
    expect(restored.segments).toEqual(meeting.segments); expect(restored.transcript).toBe(meeting.transcript);
    expect(restored.speakerNames["1:manual-1"]).toBe("Carla");
  });
});

describe("protocol language", () => {
  it.each(["recording", "upload"] as const)("persists a target and extends the %s prompt without translating the transcript", async source => {
    const meeting = await transcribed(source);
    expect((await request(`/meetings/${meeting.id}/protocol`, "POST", { protocolLanguage: "en" })).status).toBe(202); await service.idle();
    const input = processTranscript.mock.calls[0][1];
    expect(input.task).toBe(source === "recording" ? "protocol" : "summary");
    expect(input.instructions).toContain("Englisch"); expect(input.instructions).toContain("Zitate");
    expect(input.instructions).toContain("Lexikon"); expect(input.instructions).toContain("Produktnamen");
    const stored = JSON.parse(await readFile(storedPath(meeting.id), "utf8"));
    expect(stored.protocolLanguage).toBe("en"); expect(stored.transcript).toBe(meeting.transcript);
    expect((await request(`/meetings/${meeting.id}/protocol`, "POST")).status).toBe(202); await service.idle();
    expect(processTranscript.mock.calls[1][1].instructions).toBe(defaultPrompts[input.task as "protocol" | "summary"]);
    expect(await service.get(meeting.id)).not.toHaveProperty("protocolLanguage");
  });
  it("leaves both default and custom prompts unchanged for absent or matching language", async () => {
    const meeting = await transcribed();
    await writeFile(join(dir, "settings.json"), JSON.stringify({ prompts: { protocol: "Custom protocol" } }));
    for (const body of [{}, { protocolLanguage: "de" }]) {
      expect((await request(`/meetings/${meeting.id}/protocol`, "POST", body)).status).toBe(202); await service.idle();
      expect(processTranscript.mock.calls.at(-1)![1].instructions).toBe("Custom protocol");
    }
  });
  it.each([null, 42, "", "../en", "EN", "en_US", "english", "en-US-extra"])("rejects invalid protocolLanguage %j", async protocolLanguage => {
    const meeting = await transcribed();
    expect((await request(`/meetings/${meeting.id}/protocol`, "POST", { protocolLanguage })).status).toBe(400);
    expect(processTranscript).not.toHaveBeenCalled();
  });
  it.each(["hr", "en-US", "fil", "auto"])("accepts the meeting language code pattern (%s)", async protocolLanguage => {
    const meeting = await transcribed();
    expect((await request(`/meetings/${meeting.id}/protocol`, "POST", { protocolLanguage })).status).toBe(202); await service.idle();
    expect((await service.get(meeting.id)).status).toBe("done");
  });
  it("loads legacy meeting.json unchanged and still permits correction and protocol generation", async () => {
    const meeting = await transcribed(); delete meeting.transcribedAt; delete meeting.job; delete meeting.participants;
    await store(meeting); const before = await readFile(storedPath(meeting.id), "utf8");
    expect(await service.get(meeting.id)).toEqual(meeting);
    expect(await readFile(storedPath(meeting.id), "utf8")).toBe(before);
    expect((await patch(meeting.id, { segmentSpeakers: { "0": "1:manual-1" } })).status).toBe(200);
    expect((await request(`/meetings/${meeting.id}/protocol`, "POST")).status).toBe(202); await service.idle();
    expect((await service.get(meeting.id)).status).toBe("done");
  });
});

describe("seven day audio retention", () => {
  it("uses exactly seven days after transcription", async () => {
    const meeting = await transcribed(); expect(AUDIO_RETENTION_MS).toBe(7 * 24 * 60 * 60 * 1000);
    expect(Date.parse(meeting.audioExpiresAt!) - Date.parse(meeting.transcribedAt!)).toBe(AUDIO_RETENTION_MS);
  });
  it.each(["extend", "preserve-later", "missing-expiry", "deleted", "missing-audio"])("extends only existing audio before startup cleanup (%s)", async variant => {
    const meeting = await transcribed();
    meeting.transcribedAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    meeting.audioExpiresAt = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    if (variant === "preserve-later") meeting.audioExpiresAt = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
    if (variant === "missing-expiry") delete meeting.audioExpiresAt;
    if (variant === "deleted") meeting.audioDeletedAt = new Date().toISOString();
    if (variant === "missing-audio") await rm(join(dir, "meetings", meeting.id, "audio"), { recursive: true });
    await store(meeting); const before = await readFile(storedPath(meeting.id), "utf8");
    const restarted = new MeetingService(dir);
    try {
      await restarted.start({ resume: true, retentionTimer: false });
      const result = await restarted.get(meeting.id);
      if (["extend", "missing-expiry"].includes(variant)) expect(result.audioExpiresAt).toBe(new Date(Date.parse(meeting.transcribedAt) + AUDIO_RETENTION_MS).toISOString());
      if (variant === "preserve-later") expect(await readFile(storedPath(meeting.id), "utf8")).toBe(before);
      if (variant === "deleted") expect(await readFile(storedPath(meeting.id), "utf8")).toBe(before);
      if (variant === "missing-audio") expect(result.audioExpiresAt).toBe(meeting.audioExpiresAt);
    } finally { await restarted.dispose(); }
  });
});

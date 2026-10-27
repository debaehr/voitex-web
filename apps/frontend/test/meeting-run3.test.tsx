import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MeetingDetail } from "../src/components/MeetingDetail";
import { api } from "../src/lib/api";
import { audioAvailable, meetingTranscript, meetingsBySource, nonEmptyNames, parseParticipants } from "../src/lib/meeting-presentation";
import { MEETING_MAX_BYTES, MEETING_SLICE_BYTES, readMeetingDuration, uploadMeetingFile, validateMeetingFile } from "../src/lib/meeting-file-upload";
import { mergeWithDefaults } from "../src/lib/settings";
import { SettingsStore } from "../src/lib/settings-store";
import { addCustomMode, availableDictationModes } from "../src/lib/modes";
import type { MeetingDetailData } from "../src/lib/meeting-types";
import type { Settings } from "../src/lib/types";
import { fixture, settle } from "./meeting-fixture";
const base: MeetingDetailData = {
  id: "review", source: "recording", title: "Review", language: "de", createdAt: "2026-10-27T08:00:00Z", status: "naming", progress: 100,
  protocol: "# Protokoll\n<script>unsafe()</script>", transcript: "", speakerNames: {}, participants: ["Anna", "Torsten"],
  parts: [{ part: 1, contentType: "audio/mp4" }, { part: 2, contentType: "audio/mp4" }],
  segments: [
    { speakerId: "1:A", speakerLabel: "Sprecher 1", part: 1, start: 4, end: 7, text: " Erster Satz. " },
    { speakerId: "1:A", speakerLabel: "Sprecher 1", part: 1, start: 7, end: 9, text: " Zweiter Satz. " },
    { speakerId: "1:B", speakerLabel: "Sprecher 2", part: 1, start: 10, end: 12, text: " Antwort. " },
    { speakerId: "2:A", speakerLabel: "Teil 2 · Sprecher 1", part: 2, start: 0, end: 2, text: "Fortsetzung." },
  ],
  interruptions: [{ afterPart: 1, start: "", end: "", text: "[Unterbrechung 10:00–10:05]" }],
  audioExpiresAt: "2099-01-01T00:00:00Z",
};
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
it("stops recorder polling at naming, clears local metadata and audio, and forwards participants", async () => {
  vi.useFakeTimers();
  const f = fixture(); await f.controller.initialize(); await f.controller.start("Review", "de", ["Anna", "Torsten"]);
  expect(f.api.createMeeting).toHaveBeenCalledWith({ title: "Review", source: "recording", language: "de", participants: ["Anna", "Torsten"] });
  await f.controller.finish(); await settle(); expect(await f.store.listChunks("meeting-1")).not.toEqual([]);
  f.setServer({ status: "naming", progress: 100 }); await vi.advanceTimersByTimeAsync(5000);
  expect(f.state()).toMatchObject({ phase: "done", result: { status: "naming" } });
  expect(await f.store.listMeetings()).toEqual([]); expect(await f.store.listChunks("meeting-1")).toEqual([]);
  const calls = f.api.getMeeting.mock.calls.length; await vi.advanceTimersByTimeAsync(15000);
  expect(f.api.getMeeting).toHaveBeenCalledTimes(calls); await f.controller.dispose();
});
it("clears an errored recording deleted from the detail and permits a fresh start, without clearing unrelated recordings", async () => {
  vi.useFakeTimers();
  const f = fixture(); await f.controller.initialize(); await f.controller.start("Review", "de"); await f.controller.finish(); await settle();
  f.setServer({ status: "error", error: "Provider failed" }); await vi.advanceTimersByTimeAsync(5000);
  await f.controller.forgetDeleted("other"); expect(f.state().phase).toBe("error"); expect(await f.store.listChunks("meeting-1")).not.toEqual([]);
  await f.controller.forgetDeleted("meeting-1"); expect(f.state().phase).toBe("idle"); expect(await f.store.listMeetings()).toEqual([]); expect(await f.store.listChunks("meeting-1")).toEqual([]);
  await f.controller.start("New session", "de"); expect(f.state().phase).toBe("recording"); await f.controller.dispose();
});
it("clears local error recovery after a provider-specific retry finishes in the detail", async () => {
  vi.useFakeTimers();
  const f = fixture(); await f.controller.initialize(); await f.controller.start("Review", "de"); await f.controller.finish(); await settle();
  f.setServer({ status: "error" }); await vi.advanceTimersByTimeAsync(5000);
  await f.controller.acceptResult({ id: "meeting-1", title: "Review", language: "de", status: "naming", progress: 100, protocol: "" });
  expect(f.state().phase).toBe("done"); expect(await f.store.listMeetings()).toEqual([]); expect(await f.store.listChunks("meeting-1")).toEqual([]);
  await f.controller.dispose();
});
it("applies edited names immediately, merges consecutive speakers and preserves part boundaries and gaps", () => {
  expect(meetingTranscript(base, {})).toContain("Sprecher 1: Erster Satz. Zweiter Satz.");
  const text = meetingTranscript(base, { "1:A": "Anna", "1:B": "Anna", "2:A": "Anna" });
  expect(text).toBe("[00:00:04] Anna: Erster Satz. Zweiter Satz. Antwort.\n\n[Unterbrechung 10:00–10:05]\n\n[00:00:00] Anna: Fortsetzung.");
  expect(meetingTranscript(base, { "1:A": "Torsten" })).toContain("Torsten: Erster Satz.");
  expect(nonEmptyNames({ A: " Anna ", B: " " })).toEqual({ A: "Anna" });
});
it("renders speaker rows, quotes, own-name suggestions and the transcript already at naming", () => {
  const html = renderToStaticMarkup(<MeetingDetail id={base.id} initial={base} ownSpeakerName="Ich" />);
  for (const label of ["Teil 1 · Sprecher 1", "Teil 2 · Sprecher 1", "Erster Satz.", "Transkript", "Protokoll erstellen", "Ohne Namen erstellen", 'value="Ich"', 'value="Anna"']) expect(html).toContain(label);
  expect(html).toContain("anhören");
});
it.each([{ audioDeletedAt: "2026-10-27T10:00:00Z" }, { audioExpiresAt: "2000-01-01T00:00:00Z" }])("hides all audio playback and download controls after deletion or expiry (%j)", state => {
  const meeting = { ...base, ...state }; expect(audioAvailable(meeting)).toBe(false);
  const html = renderToStaticMarkup(<MeetingDetail id={base.id} initial={meeting} />);
  expect(html).not.toContain("anhören"); expect(html).not.toContain("Audio herunterladen"); expect(html).not.toContain("<audio");
});
it("renders completed output safely with export and rename actions", () => {
  const html = renderToStaticMarkup(<MeetingDetail id={base.id} initial={{ ...base, status: "done" }} />);
  expect(html).toContain("&lt;script&gt;"); expect(html).not.toContain("<script>");
  for (const label of ["Protokoll kopieren", "Markdown herunterladen", "TXT herunterladen", "Sprecher umbenennen", "Audio herunterladen", "Jetzt löschen", "Sitzung löschen"]) expect(html).toContain(label);
});
it("summarizes provider attempts and exposes explicit provider retry controls", () => {
  const html = renderToStaticMarkup(<MeetingDetail id={base.id} initial={{ ...base, status: "error", error: "HTTP 401", providerAttempts: [{ provider: "mistral", ok: false, reason: "Kein Schlüssel" }] }} />);
  for (const label of ["HTTP 401", "Kein Schlüssel", "Erneut versuchen", "Erneut mit AssemblyAI", "Erneut mit Mistral"]) expect(html).toContain(label);
});
it("filters both lists by their source", () => {
  const upload = { ...base, id: "upload", source: "upload" as const };
  expect(meetingsBySource([base, upload], "recording").map(item => item.id)).toEqual(["review"]);
  expect(meetingsBySource([base, upload], "upload").map(item => item.id)).toEqual(["upload"]);
});
it("sends only non-empty speakerNames for protocol creation, omits the body when skipping names, and retries with the chosen provider", async () => {
  const fetch = vi.fn(async () => new Response(JSON.stringify({ status: "queued" })));
  vi.stubGlobal("fetch", fetch);
  await api.protocolMeeting("id", nonEmptyNames({ A: " Anna ", B: "" })); await api.protocolMeeting("id"); await api.retryMeeting("id", "assemblyai"); await api.retryMeeting("id", "mistral");
  const calls = fetch.mock.calls as unknown as Array<[string, RequestInit]>;
  expect(JSON.parse(calls[0][1].body as string)).toEqual({ speakerNames: { A: "Anna" } });
  expect(calls[1][1].method).toBe("POST"); expect(calls[1][1].body).toBeUndefined(); expect(calls[1][1].headers).toBeUndefined();
  expect(JSON.parse(calls[2][1].body as string)).toEqual({ provider: "assemblyai" });
  expect(JSON.parse(calls[3][1].body as string)).toEqual({ provider: "mistral" });
});
it("uses PATCH for title/names and DELETE for audio and sessions", async () => {
  const fetch = vi.fn(async () => new Response(JSON.stringify({ ok: true }))); vi.stubGlobal("fetch", fetch);
  await api.patchMeeting("id", { title: "Neu", speakerNames: { A: "Anna" } }); await api.deleteMeetingAudio("id"); await api.deleteMeeting("id");
  const calls = fetch.mock.calls as unknown as Array<[string, RequestInit]>;
  expect(calls.map(([url, init]) => [url, init.method])).toEqual([["/api/meetings/id", "PATCH"], ["/api/meetings/id/audio", "DELETE"], ["/api/meetings/id", "DELETE"]]);
});
it("validates participant limits before creating a session", () => {
  expect(parseParticipants(" Anna, Torsten, ,Anna ")).toEqual(["Anna", "Torsten"]);
  expect(() => parseParticipants(Array(21).fill("Name").join(","))).toThrow("höchstens 20");
  expect(() => parseParticipants("x".repeat(61))).toThrow("60 Zeichen");
});
describe("chunked uploads", () => {
  const file = (size: number, name = "meeting.mp3", type = "") => Object.assign(new Blob([new Uint8Array(size)], { type }), { name }) as File;
  it.each(["mp3", "m4a", "mp4", "wav", "webm", "ogg", "flac"])("accepts %s with content type inferred from extension", extension => {
    expect(validateMeetingFile({ name: `meeting.${extension}`, size: 1, type: "" })).toMatch(/^(audio|video)\//);
  });
  it("rejects unknown formats, empty files and files over 200 MB before creating anything", async () => {
    for (const value of [{ name: "text.txt", size: 10 }, { name: "a.mp3", size: 0 }, { name: "a.wav", size: MEETING_MAX_BYTES + 1 }]) expect(() => validateMeetingFile({ ...value, type: "" })).toThrow();
    expect(validateMeetingFile({ name: "A.MP3", size: MEETING_MAX_BYTES, type: "audio/mpeg" })).toBe("audio/mpeg");
  });
  it("slices 5 MB chunks, retries only the failed chunk, reports byte progress and sends the finish metadata", async () => {
    const client = { createMeeting: vi.fn(async () => ({ id: "upload" })), putMeetingChunk: vi.fn(async () => {}), finishMeeting: vi.fn(async () => {}) };
    client.putMeetingChunk.mockRejectedValueOnce(new Error("network"));
    const progress = vi.fn(), wait = vi.fn(async () => {});
    const selected = file(MEETING_SLICE_BYTES * 2 + 123);
    const id = await uploadMeetingFile(selected, { title: "Review", language: "hr", participants: ["Anna"], durationSeconds: 61 }, progress, client, wait);
    expect(id).toBe("upload"); expect(client.createMeeting).toHaveBeenCalledWith({ title: "Review", language: "hr", participants: ["Anna"], source: "upload" });
    const chunks = client.putMeetingChunk.mock.calls.map(args => args[0]) as any[];
    expect(chunks.map(chunk => chunk.index)).toEqual([0, 0, 1, 2]);
    expect(chunks.map(chunk => chunk.blob.size)).toEqual([MEETING_SLICE_BYTES, MEETING_SLICE_BYTES, MEETING_SLICE_BYTES, 123]);
    expect(chunks.every(chunk => chunk.part === 1 && chunk.contentType === "audio/mpeg")).toBe(true);
    expect(progress.mock.calls.map(args => args[0])).toEqual([0, 49, 99, 100]);
    expect(wait).toHaveBeenCalledWith(1000);
    expect(client.finishMeeting).toHaveBeenCalledWith("upload", { durationSeconds: 61, parts: [{ part: 1, chunkCount: 3, contentType: "audio/mpeg" }] });
  });
  it("caps retries and never finishes an incomplete upload", async () => {
    const client = { createMeeting: vi.fn(async () => ({ id: "upload" })), putMeetingChunk: vi.fn(async () => { throw new Error("offline"); }), finishMeeting: vi.fn() };
    await expect(uploadMeetingFile(file(10), { title: "", language: "de", participants: [] }, vi.fn(), client, async () => {})).rejects.toThrow("offline");
    expect(client.putMeetingChunk).toHaveBeenCalledTimes(3); expect(client.finishMeeting).not.toHaveBeenCalled();
  });
  it("omits unknown duration from finish and preserves the supplied MIME type", async () => {
    const client = { createMeeting: vi.fn(async () => ({ id: "upload" })), putMeetingChunk: vi.fn(async () => {}), finishMeeting: vi.fn(async () => {}) };
    await uploadMeetingFile(file(1, "a.webm", "audio/webm"), { title: "", language: "de", participants: [] }, vi.fn(), client);
    expect(client.finishMeeting).toHaveBeenCalledWith("upload", { parts: [{ part: 1, chunkCount: 1, contentType: "audio/webm" }] });
  });
  it.each([10, Infinity, NaN])("reads audio metadata best effort (%s) and revokes the object URL", async duration => {
    let audio: any;
    vi.stubGlobal("document", { createElement: () => (audio = { duration, removeAttribute: vi.fn(), load: vi.fn() }) });
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:audio"); const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const pending = readMeetingDuration(file(1)); audio.onloadedmetadata();
    expect(await pending).toBe(Number.isFinite(duration) ? duration : undefined); expect(revoke).toHaveBeenCalledWith("blob:audio");
  });
  it("times out metadata probing without blocking uploads", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("document", { createElement: () => ({ duration: NaN, removeAttribute: vi.fn(), load: vi.fn() }) });
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:audio"); vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const pending = readMeetingDuration(file(1)); await vi.advanceTimersByTimeAsync(4000); expect(await pending).toBeUndefined();
  });
});
it("keeps meeting provider and fallback through settings load/save and uses Mistral for new modes and missing providers", async () => {
  const modes = { original: "mistral", casual: "mistral", formal: "mistral", coding: "mistral", protocol: "mistral", summary: "mistral" } as const;
  const defaults: Settings = { version: 1, providers: { ...modes, meetings: "mistral" }, meetingFallback: false, prompts: { ...modes }, lexicon: [], snippets: [], ownSpeakerName: "Ich" };
  const partial = { providers: { meetings: "assemblyai" }, meetingFallback: true };
  const merged = mergeWithDefaults(partial, defaults);
  expect(merged.providers.meetings).toBe("assemblyai"); expect(merged.meetingFallback).toBe(true);
  expect(mergeWithDefaults({}, defaults).meetingFallback).toBe(false);
  const saveSettings = vi.fn(async () => ({ ok: true as const }));
  const store = new SettingsStore({ getDefaults: async () => defaults, getSettings: async () => partial, getProviders: async () => ({ stt: [], llm: [], meetings: ["mistral", "assemblyai"] }), saveSettings });
  await store.load(); await store.save(store.getSnapshot().settings!);
  expect(saveSettings).toHaveBeenCalledWith(expect.objectContaining({ providers: expect.objectContaining({ meetings: "assemblyai" }), meetingFallback: true }));
  expect(addCustomMode(merged).customModes?.[0].provider).toBe("mistral");
  expect(availableDictationModes(null).every(mode => mode.provider === "mistral")).toBe(true);
});

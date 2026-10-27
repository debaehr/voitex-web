import { SystemAudioChoice } from "../src/lib/meeting-browser";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MAX_MEETING_SECONDS } from "../src/lib/meeting-recorder";
import { MemoryMeetingStore } from "../src/lib/meeting-store";
import { fixture, localChunk, localMeeting, settle } from "./meeting-fixture";
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-27T08:00:00.000Z")); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

it("creates a meeting in the selected language and stores every chunk before uploading", async () => {
  const f = fixture(); const saved = vi.spyOn(f.store, "saveChunk");
  await f.controller.initialize(); await f.controller.start(" Planning ", "hr");
  expect(f.api.createMeeting).toHaveBeenCalledWith({ title: "Planning", source: "recording", language: "hr" });
  await vi.advanceTimersByTimeAsync(5000); f.captures[0].emit(); await settle();
  expect(saved).toHaveBeenCalledTimes(1);
  expect(saved.mock.invocationCallOrder[0]).toBeLessThan(f.api.putMeetingChunk.mock.invocationCallOrder[0]);
  expect(f.state()).toMatchObject({ phase: "recording", elapsed: 5, secured: 5 });
  expect((await f.store.listChunks("meeting-1"))[0]).toMatchObject({ part: 1, index: 0, endSeconds: 5, uploaded: true });
  await f.controller.dispose();
});
it("pauses within the same part, excludes pause time and flushes the final chunk before finish", async () => {
  const f = fixture(); await f.controller.initialize(); await f.controller.start("", "de");
  await vi.advanceTimersByTimeAsync(5000); f.captures[0].emit(); await settle(); await f.controller.pause();
  await vi.advanceTimersByTimeAsync(12000); expect(f.state().elapsed).toBe(5);
  await f.controller.resume(); await vi.advanceTimersByTimeAsync(3000); await f.controller.finish();
  expect(f.captures).toHaveLength(1); expect(f.captures[0].pause).toHaveBeenCalledOnce(); expect(f.captures[0].resume).toHaveBeenCalledOnce();
  expect(f.api.finishMeeting).toHaveBeenCalledWith("meeting-1", { durationSeconds: 8, parts: [{ part: 1, chunkCount: 2,
    contentType: "audio/webm;codecs=opus", startedAt: "2026-10-27T08:00:00.000Z", endedAt: "2026-10-27T08:00:20.000Z", durationSeconds: 8 }] });
  expect(f.api.putMeetingChunk).toHaveBeenCalledTimes(2); expect(f.state().phase).toBe("processing"); await f.controller.dispose();
});
it("ends the interrupted part and starts a new recorder/stream with ISO gap timestamps", async () => {
  const f = fixture(); await f.controller.initialize(); await f.controller.start("", "de");
  await vi.advanceTimersByTimeAsync(6000); f.captures[0].interrupted!("Mikrofon unterbrochen"); await settle();
  expect(f.state()).toMatchObject({ phase: "interrupted", hint: "Mikrofon unterbrochen" });
  await vi.advanceTimersByTimeAsync(10000); await f.controller.resume();
  expect(f.captures).toHaveLength(2); await vi.advanceTimersByTimeAsync(2000); await f.controller.finish();
  const payload = f.api.finishMeeting.mock.calls[0][1];
  expect(payload.durationSeconds).toBe(8); expect(payload.parts.map(part => part.part)).toEqual([1, 2]);
  expect(payload.parts[0].endedAt).toBe("2026-10-27T08:00:06.000Z"); expect(payload.parts[1].startedAt).toBe("2026-10-27T08:00:16.000Z");
  expect(f.api.putMeetingChunk.mock.calls.map(([chunk]) => [chunk.part, chunk.index])).toEqual([[1, 0], [2, 0]]);
  await f.controller.dispose();
});
it("detects iOS backgrounding, re-requests wake lock on return, and leaves Android recording", async () => {
  const f = fixture(); await f.controller.initialize(); await f.controller.start("", "de"); await settle();
  f.visibility(true); expect(f.state().phase).toBe("recording");
  f.visibility(false); await settle(); expect(f.environment.wake).toHaveBeenCalledTimes(2);
  f.environment.isIOS = true; f.visibility(true); await settle(); expect(f.state().phase).toBe("interrupted");
  expect(f.state().hint).toContain("Homescreen"); await f.controller.dispose();
});
it("shows a hint when wake lock is unavailable or denied", async () => {
  const f = fixture(); f.environment.wakeSupported = false; await f.controller.initialize(); await f.controller.start("", "de");
  expect(f.state().wakeHint).toContain("nicht unterstützt");
  f.environment.wakeSupported = true; vi.mocked(f.environment.wake).mockRejectedValue(new Error("denied"));
  f.visibility(false); await settle(); expect(f.state().wakeHint).toContain("nicht wach"); await f.controller.dispose();
});
it("automatically finishes at three hours and never includes excess time", async () => {
  const f = fixture(); await f.controller.initialize(); await f.controller.start("", "de");
  vi.setSystemTime(Date.now() + (MAX_MEETING_SECONDS + 10) * 1000); await vi.advanceTimersByTimeAsync(250); await settle();
  expect(f.api.finishMeeting).toHaveBeenCalledOnce(); expect(f.api.finishMeeting.mock.calls[0][1].durationSeconds).toBe(MAX_MEETING_SECONDS);
  expect(f.captures[0].stop).toHaveBeenCalledOnce(); await f.controller.dispose();
});
it("waits offline at finish and uploads all chunks before submitting metadata on reconnect", async () => {
  const f = fixture(); await f.controller.initialize(); await f.controller.start("", "de"); f.setOnline(false);
  await vi.advanceTimersByTimeAsync(5000); f.captures[0].emit(); const finished = f.controller.finish(); await settle();
  expect(f.state()).toMatchObject({ phase: "finishing", offline: true, pending: 2 }); expect(f.api.finishMeeting).not.toHaveBeenCalled();
  f.setOnline(true); await finished;
  expect(f.api.putMeetingChunk).toHaveBeenCalledTimes(2); expect(f.api.finishMeeting).toHaveBeenCalledOnce(); await f.controller.dispose();
});
it("recovers missing chunks after reload and sends the exact preserved finish payload", async () => {
  const store = new MemoryMeetingStore(); const meeting = localMeeting();
  await store.saveChunk(meeting, localChunk(0, true)); await store.saveChunk(meeting, localChunk(1));
  const f = fixture(store); await f.controller.initialize(); await settle();
  expect(f.state()).toMatchObject({ phase: "recovery", elapsed: 10 });
  expect(f.api.putMeetingChunk.mock.calls.map(([chunk]) => chunk.index)).toEqual([1]);
  await f.controller.finish(); expect(f.api.finishMeeting).toHaveBeenCalledWith("meeting-1", { durationSeconds: 10, parts: meeting.parts });
  await f.controller.dispose();
});
it("resumes recovery as a new part and restores only duration backed by audio after a crash", async () => {
  const store = new MemoryMeetingStore(); const meeting = localMeeting();
  meeting.status = "recording"; meeting.parts[0].endedAt = undefined; meeting.parts[0].durationSeconds = 18;
  meeting.parts[0].lastChunkAt = "2026-10-27T08:00:20.000Z";
  await store.saveChunk(meeting, localChunk(0));
  const f = fixture(store); await f.controller.initialize();
  expect(f.state().elapsed).toBe(5); expect(f.state().meeting!.parts[0].endedAt).toBe("2026-10-27T08:00:20.000Z");
  await f.controller.resume(); expect(f.state().meeting!.parts[1].part).toBe(2); await f.controller.dispose();
});
it("polls queued/transcribing/summarizing until done and removes all local audio only after done", async () => {
  const f = fixture(); await f.controller.initialize(); await f.controller.start("", "de"); await vi.advanceTimersByTimeAsync(5000);
  await f.controller.finish(); await settle(); expect(await f.store.listMeetings()).toHaveLength(1);
  f.setServer({ status: "transcribing", progress: 40 }); await vi.advanceTimersByTimeAsync(4999); expect(f.state().result?.status).toBe("queued");
  await vi.advanceTimersByTimeAsync(1); expect(f.state().result).toMatchObject({ status: "transcribing", progress: 40 });
  f.setServer({ status: "summarizing", progress: 85 }); await vi.advanceTimersByTimeAsync(5000); expect(f.state().result?.status).toBe("summarizing");
  f.setServer({ status: "done", progress: 100, protocol: "# Protokoll" }); await vi.advanceTimersByTimeAsync(5000);
  expect(f.state()).toMatchObject({ phase: "done", result: { protocol: "# Protokoll" } });
  expect(await f.store.listMeetings()).toEqual([]); expect(await f.store.listChunks("meeting-1")).toEqual([]);
  const calls = f.api.getMeeting.mock.calls.length; await vi.advanceTimersByTimeAsync(10000); expect(f.api.getMeeting).toHaveBeenCalledTimes(calls); await f.controller.dispose();
});
it("stops polling on processing error, retains audio and retries the job", async () => {
  const f = fixture(); await f.controller.initialize(); await f.controller.start("", "de"); await f.controller.finish(); await settle();
  f.setServer({ status: "error", error: "Provider unavailable" }); await vi.advanceTimersByTimeAsync(5000);
  expect(f.state()).toMatchObject({ phase: "error", error: "Provider unavailable" }); expect(await f.store.listChunks("meeting-1")).toHaveLength(1);
  const calls = f.api.getMeeting.mock.calls.length; await vi.advanceTimersByTimeAsync(10000); expect(f.api.getMeeting).toHaveBeenCalledTimes(calls);
  await f.controller.retry(); expect(f.api.retryMeeting).toHaveBeenCalledWith("meeting-1"); expect(f.state().phase).toBe("processing"); await f.controller.dispose();
});
it("survives a transient polling failure and resumes after reload during processing", async () => {
  const store = new MemoryMeetingStore(); const meeting = localMeeting(); meeting.status = "processing"; await store.saveChunk(meeting, localChunk(0, true));
  const f = fixture(store); f.api.getMeeting.mockRejectedValueOnce(new Error("network")); await f.controller.initialize(); await settle();
  expect(f.state().error).toContain("fünf Sekunden"); f.setServer({ status: "done", protocol: "Done" }); await vi.advanceTimersByTimeAsync(5000);
  expect(f.state().phase).toBe("done"); expect(f.api.finishMeeting).not.toHaveBeenCalled(); await f.controller.dispose();
});
it("handles a lost finish response by probing finishedAt instead of submitting twice", async () => {
  const f = fixture(); await f.controller.initialize(); await f.controller.start("", "de");
  f.api.finishMeeting.mockImplementationOnce(async () => { f.setServer({ finishedAt: new Date().toISOString() }); throw new Error("response lost"); });
  await f.controller.finish(); expect(f.state().phase).toBe("recovery"); await f.controller.finish();
  expect(f.api.finishMeeting).toHaveBeenCalledTimes(1); expect(f.state().phase).toBe("processing"); await f.controller.dispose();
});
it("mutually locks dictation and meeting starts, including pending microphone permission and pauses", async () => {
  const f = fixture(); await f.controller.initialize(); expect(f.microphone.acquire("dictation")).toBe(true);
  await f.controller.start("", "de"); expect(f.environment.openCapture).not.toHaveBeenCalled(); f.microphone.release("dictation");
  const starting = f.controller.start("", "de"); expect(f.microphone.acquire("dictation")).toBe(false); await starting;
  await f.controller.pause(); expect(f.microphone.acquire("dictation")).toBe(false);
  await f.controller.finish(); expect(f.microphone.acquire("dictation")).toBe(true); await f.controller.dispose();
});
it("keeps the microphone reserved through interruption and releases it after discard", async () => {
  const f = fixture(); await f.controller.initialize(); await f.controller.start("", "de"); await f.controller.interrupt("interrupted");
  expect(f.microphone.acquire("dictation")).toBe(false); await f.controller.discard();
  expect(f.api.deleteMeeting).toHaveBeenCalledWith("meeting-1"); expect(await f.store.listMeetings()).toEqual([]);
  expect(f.microphone.acquire("dictation")).toBe(true); await f.controller.dispose();
});
it("unlocks when microphone access fails and does not create an empty server meeting", async () => {
  const f = fixture(); vi.mocked(f.environment.openCapture).mockRejectedValue(new Error("Mikrofonzugriff verweigert."));
  await f.controller.initialize(); await f.controller.start("", "de"); expect(f.state().error).toContain("verweigert");
  expect(f.api.createMeeting).not.toHaveBeenCalled(); expect(f.microphone.acquire("dictation")).toBe(true); await f.controller.dispose();
});
it("retains a chunk after local persistence fails, interrupts and retries saving before finish", async () => {
  const f = fixture(); await f.controller.initialize(); await f.controller.start("", "de");
  vi.spyOn(f.store, "saveChunk").mockRejectedValueOnce(new Error("quota")); f.captures[0].emit(); await settle();
  expect(f.state().phase).toBe("interrupted"); expect(f.state().error).toContain("Lokale Sicherung"); expect(f.api.putMeetingChunk).toHaveBeenCalled();
  await f.controller.finish(); expect(f.state().phase).toBe("processing"); expect(await f.store.listChunks("meeting-1")).toHaveLength(2); await f.controller.dispose();
});
it("splits deferred large browser blobs into API-sized pieces without changing their bytes", async () => {
  const f = fixture(); await f.controller.initialize(); await f.controller.start("", "de");
  const audio = new Blob([new Uint8Array(10 * 1024 * 1024 + 23).fill(7)]);
  f.captures[0].chunk!(audio); await settle();
  const chunks = await f.store.listChunks("meeting-1"); expect(chunks).toHaveLength(2);
  expect(chunks[0].blob.size).toBe(10 * 1024 * 1024); expect(chunks[1].blob.size).toBe(23);
  expect(chunks.map(chunk => chunk.index)).toEqual([0, 1]);
  expect(await new Blob(chunks.map(chunk => chunk.blob)).arrayBuffer()).toEqual(await audio.arrayBuffer());
  await f.controller.dispose();
});
it("measures elapsed recording time independently of wall-clock changes", async () => {
  const f = fixture(); let monotonic = 0; f.environment.monotonic = () => monotonic;
  await f.controller.initialize(); await f.controller.start("", "de");
  vi.setSystemTime(Date.now() + 3600_000); monotonic = 5000; await vi.advanceTimersByTimeAsync(250);
  expect(f.state().elapsed).toBe(5); await f.controller.finish();
  expect(f.api.finishMeeting.mock.calls[0][1].durationSeconds).toBe(5); await f.controller.dispose();
});
it("cleans up a late microphone permission grant after the App unmounts", async () => {
  const f = fixture(); const capture = { addSystemAudio: vi.fn(async () => {}), contentType: "audio/mp4", start: vi.fn(), pause: vi.fn(), resume: vi.fn(), stop: vi.fn(async () => {}) };
  let grant!: (value: typeof capture) => void;
  vi.mocked(f.environment.openCapture).mockImplementationOnce(() => new Promise(resolve => { grant = resolve; }));
  await f.controller.initialize(); const starting = f.controller.start("", "de"); await f.controller.dispose(); grant(capture); await starting;
  expect(capture.stop).toHaveBeenCalledOnce(); expect(capture.start).not.toHaveBeenCalled(); expect(f.api.createMeeting).not.toHaveBeenCalled();
});
it("resumes an unfinished offline finish after reload without reopening the microphone", async () => {
  const store = new MemoryMeetingStore(); const meeting = localMeeting(); meeting.status = "finishing";
  await store.saveChunk(meeting, localChunk(0)); await store.saveChunk(meeting, localChunk(1));
  const f = fixture(store); f.setOnline(false); await f.controller.initialize(); await settle();
  expect(f.state().phase).toBe("finishing"); expect(f.api.finishMeeting).not.toHaveBeenCalled();
  f.setOnline(true); await settle(); expect(f.state().phase).toBe("processing"); expect(f.environment.openCapture).not.toHaveBeenCalled(); await f.controller.dispose();
});

it("persists system audio and reattaches ended audio without interrupting or adding a part", async () => {
  const f = fixture(); await f.controller.initialize(); await f.controller.start("Review", "de", [], true);
  expect(f.environment.openCapture).toHaveBeenCalledWith({ systemAudio: true });
  expect((await f.store.listMeetings())[0].systemAudio).toBe(true);
  f.captures[0].systemAudioEnded!(); expect(f.state()).toMatchObject({ phase: "recording", systemAudioEnded: true });
  await f.controller.addSystemAudio(); expect(f.captures[0].addSystemAudio).toHaveBeenCalledOnce();
  expect(f.state().systemAudioEnded).toBe(false); expect(f.state().meeting!.parts).toHaveLength(1);
  await f.controller.finish(); expect(f.captures[0].stop).toHaveBeenCalledOnce(); await f.controller.dispose();
});
it("offers a choice after cancelled start and only starts microphone audio after explicit selection", async () => {
  const f = fixture(); await f.controller.initialize(); vi.mocked(f.environment.openCapture).mockRejectedValueOnce(new SystemAudioChoice("Abgebrochen"));
  await f.controller.start("", "de", [], true);
  expect(f.state()).toMatchObject({ phase: "idle", systemAudioChoice: "Abgebrochen", error: null });
  expect(f.api.createMeeting).not.toHaveBeenCalled();
  await f.controller.start("", "de", [], false); expect(f.state()).toMatchObject({ phase: "recording", systemAudioChoice: null, systemAudio: false });
  await f.controller.dispose();
});
it("re-requests system audio after interruption, keeps the gap and supports explicit microphone fallback", async () => {
  const f = fixture(); await f.controller.initialize(); await f.controller.start("", "de", [], true);
  await vi.advanceTimersByTimeAsync(5000); await f.controller.interrupt("Mikrofon unterbrochen");
  vi.mocked(f.environment.openCapture).mockRejectedValueOnce(new SystemAudioChoice("Abgebrochen")); await f.controller.resume();
  expect(f.environment.openCapture).toHaveBeenLastCalledWith({ systemAudio: true });
  expect(f.state()).toMatchObject({ phase: "interrupted", systemAudioChoice: "Abgebrochen" });
  expect(f.state().meeting!.parts).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(5000); await f.controller.resume(false);
  expect(f.environment.openCapture).toHaveBeenLastCalledWith({ systemAudio: false });
  expect(f.state().meeting!.parts).toHaveLength(2); expect((await f.store.listMeetings())[0].systemAudio).toBe(false);
  await f.controller.dispose();
});
it.each([true, undefined])("recovers the saved system audio preference %s, treating legacy records as microphone only", async systemAudio => {
  const store = new MemoryMeetingStore(); const meeting = { ...localMeeting(), systemAudio }; await store.saveChunk(meeting, localChunk(0));
  const f = fixture(store); await f.controller.initialize(); await f.controller.resume();
  expect(f.environment.openCapture).toHaveBeenCalledWith({ systemAudio: systemAudio ?? false }); await f.controller.dispose();
});
it("offers retry on cancelled recovery and requests display again on retry", async () => {
  const store = new MemoryMeetingStore(); await store.saveChunk({ ...localMeeting(), systemAudio: true }, localChunk(0));
  const f = fixture(store); await f.controller.initialize();
  vi.mocked(f.environment.openCapture).mockRejectedValueOnce(new SystemAudioChoice("Abgebrochen")); await f.controller.resume();
  expect(f.state().systemAudioChoice).toBe("Abgebrochen"); await f.controller.resume(true);
  expect(f.environment.openCapture).toHaveBeenLastCalledWith({ systemAudio: true }); expect(f.state().phase).toBe("recording"); await f.controller.dispose();
});
it("stops the mixed capture at the three-hour limit", async () => {
  const f = fixture(); await f.controller.initialize(); await f.controller.start("", "de", [], true);
  vi.setSystemTime(Date.now() + MAX_MEETING_SECONDS * 1000); await vi.advanceTimersByTimeAsync(250); await settle();
  expect(f.captures[0].stop).toHaveBeenCalledOnce(); expect(f.api.finishMeeting).toHaveBeenCalledOnce(); await f.controller.dispose();
});

it("keeps recording on a cancelled regrant and still allows Stop while a regrant dialog is pending", async () => {
  const f = fixture(); await f.controller.initialize(); await f.controller.start("", "de", [], true);
  f.captures[0].systemAudioEnded!();
  f.captures[0].addSystemAudio.mockRejectedValueOnce(new SystemAudioChoice("Abgebrochen")); await f.controller.addSystemAudio();
  expect(f.state()).toMatchObject({ phase: "recording", systemAudioEnded: true });
  let grant!: () => void;
  f.captures[0].addSystemAudio.mockImplementationOnce(() => new Promise(resolve => { grant = resolve; }));
  const adding = f.controller.addSystemAudio(); await f.controller.finish();
  expect(f.captures[0].stop).toHaveBeenCalledOnce(); expect(f.state().phase).toBe("processing");
  grant(); await adding; await f.controller.dispose();
});

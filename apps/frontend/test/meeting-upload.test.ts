import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MeetingUploadQueue } from "../src/lib/meeting-upload";
import { fixture, localChunk, localMeeting, settle } from "./meeting-fixture";
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

it("uploads sequentially, keeps blobs locally and persists acknowledgements", async () => {
  const f = fixture(); const meeting = localMeeting();
  await f.store.saveChunk(meeting, localChunk(0)); await f.store.saveChunk(meeting, localChunk(1));
  let complete!: () => void;
  f.api.putMeetingChunk.mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
  const queue = new MeetingUploadQueue(f.store, f.api.putMeetingChunk, vi.fn(), f.queueEnvironment);
  queue.add(localChunk(0)); queue.add(localChunk(1));
  expect(f.api.putMeetingChunk).toHaveBeenCalledTimes(1); expect(queue.pending).toBe(2);
  complete(); await queue.idle();
  expect(f.api.putMeetingChunk).toHaveBeenCalledTimes(2); expect(queue.securedSeconds(meeting)).toBe(10);
  expect((await f.store.listChunks(meeting.id)).map(chunk => chunk.uploaded)).toEqual([true, true]);
  expect((await f.store.listChunks(meeting.id))[0].blob.size).toBeGreaterThan(0);
  await queue.dispose();
});
it("retries failures with exponential backoff capped at thirty seconds", async () => {
  const f = fixture(); f.api.putMeetingChunk.mockRejectedValue(new Error("offline"));
  const queue = new MeetingUploadQueue(f.store, f.api.putMeetingChunk, vi.fn(), f.queueEnvironment);
  queue.add(localChunk(0)); await settle();
  for (const delay of [1000, 2000, 4000, 8000, 16000, 30000, 30000]) {
    const calls = f.api.putMeetingChunk.mock.calls.length;
    await vi.advanceTimersByTimeAsync(delay - 1); expect(f.api.putMeetingChunk).toHaveBeenCalledTimes(calls);
    await vi.advanceTimersByTimeAsync(1); expect(f.api.putMeetingChunk).toHaveBeenCalledTimes(calls + 1);
  }
  expect(queue.pending).toBe(1);
  f.api.putMeetingChunk.mockResolvedValue(); await vi.advanceTimersByTimeAsync(30000); await queue.idle();
  expect(queue.pending).toBe(0); await queue.dispose();
});
it("holds offline chunks and resumes immediately on online without losing retry items", async () => {
  const f = fixture(); f.setOnline(false);
  const queue = new MeetingUploadQueue(f.store, f.api.putMeetingChunk, vi.fn(), f.queueEnvironment);
  queue.add(localChunk(0)); queue.add(localChunk(1)); await settle();
  expect(f.api.putMeetingChunk).not.toHaveBeenCalled(); expect(queue.offline).toBe(true);
  f.api.putMeetingChunk.mockRejectedValueOnce(new Error("connection"));
  f.setOnline(true); await settle(); expect(queue.pending).toBe(2);
  f.setOnline(false); f.setOnline(true); await queue.idle();
  expect(queue.pending).toBe(0); expect(f.serverChunks.size).toBe(2); await queue.dispose();
});
it("deduplicates queue additions and safely re-sends a chunk after a lost acknowledgement", async () => {
  const f = fixture(); const chunk = localChunk(0);
  await f.store.saveChunk(localMeeting(), chunk);
  const mark = vi.spyOn(f.store, "markUploaded").mockRejectedValueOnce(new Error("storage unavailable"));
  const queue = new MeetingUploadQueue(f.store, f.api.putMeetingChunk, vi.fn(), f.queueEnvironment);
  queue.add(chunk); queue.add(chunk); await settle();
  expect(queue.total).toBe(1); await vi.advanceTimersByTimeAsync(1000); await queue.idle();
  expect(f.api.putMeetingChunk).toHaveBeenCalledTimes(2); expect(f.serverChunks.size).toBe(1); expect(mark).toHaveBeenCalledTimes(2);
  await queue.dispose();
});
it("reports only contiguous uploaded duration, even when later chunks are already present", async () => {
  const f = fixture(); f.setOnline(false);
  const queue = new MeetingUploadQueue(f.store, f.api.putMeetingChunk, vi.fn(), f.queueEnvironment);
  queue.add(localChunk(1, true)); expect(queue.securedSeconds(localMeeting())).toBe(0);
  queue.add(localChunk(0, true)); expect(queue.securedSeconds(localMeeting())).toBe(10); await queue.dispose();
});
it("starts missing chunks even if the first restored chunk was already acknowledged", async () => {
  const f = fixture();
  const queue = new MeetingUploadQueue(f.store, f.api.putMeetingChunk, vi.fn(), f.queueEnvironment);
  queue.add(localChunk(0, true)); queue.add(localChunk(1)); await settle();
  expect(queue.pending).toBe(0); expect(f.api.putMeetingChunk).toHaveBeenCalledTimes(1); await queue.dispose();
});

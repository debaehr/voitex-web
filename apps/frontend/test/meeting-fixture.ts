import { vi } from "vitest";
import type { MeetingCapture, MeetingEnvironment } from "../src/lib/meeting-browser";
import { MeetingRecorder } from "../src/lib/meeting-recorder";
import { MemoryMeetingStore } from "../src/lib/meeting-store";
import { chunkKey, type LocalMeeting, type MeetingApi, type MeetingChunk, type MeetingResult } from "../src/lib/meeting-types";
import type { QueueEnvironment } from "../src/lib/meeting-upload";
import { MicrophoneGate } from "../src/lib/microphone";

export class FakeCapture implements MeetingCapture {
  contentType = "audio/webm;codecs=opus";
  chunk?: (blob: Blob) => void;
  interrupted?: (message: string) => void;
  level?: (value: number) => void;
  start = vi.fn((chunk, interrupted, level) => { this.chunk = chunk; this.interrupted = interrupted; this.level = level; });
  pause = vi.fn();
  resume = vi.fn();
  stop = vi.fn(async () => { this.emit("tail"); });
  emit(value = "audio") { this.chunk?.(new Blob([value], { type: this.contentType })); }
}
export function fixture(store = new MemoryMeetingStore(), microphone = new MicrophoneGate()) {
  let online = true;
  const onlineHandlers = new Set<() => void>();
  const visibility = new Set<(hidden: boolean) => void>();
  const captures: FakeCapture[] = [];
  const environment: MeetingEnvironment = {
    now: () => Date.now(), monotonic: () => Date.now(), isIOS: false, wakeSupported: true,
    openCapture: vi.fn(async () => { const capture = new FakeCapture(); captures.push(capture); return capture; }),
    every: (callback, milliseconds) => { const timer = setInterval(callback, milliseconds); return () => clearInterval(timer); },
    onVisibility: callback => { visibility.add(callback); return () => { visibility.delete(callback); }; },
    wake: vi.fn(async () => ({ release: vi.fn(async () => {}) })),
  };
  const queueEnvironment: QueueEnvironment = {
    online: () => online,
    onOnline: callback => { onlineHandlers.add(callback); return () => { onlineHandlers.delete(callback); }; },
    later: (callback, milliseconds) => { const timer = setTimeout(callback, milliseconds); return () => clearTimeout(timer); },
  };
  const serverChunks = new Map<string, Blob>();
  let server: MeetingResult = { id: "meeting-1", title: "Review", language: "de", status: "queued", progress: 0, protocol: "" };
  const api = {
    createMeeting: vi.fn(async () => ({ id: server.id })),
    putMeetingChunk: vi.fn(async (chunk: MeetingChunk) => { serverChunks.set(chunkKey(chunk), chunk.blob); }),
    finishMeeting: vi.fn(async () => { server = { ...server, finishedAt: new Date().toISOString() }; }),
    getMeeting: vi.fn(async () => ({ ...server })),
    retryMeeting: vi.fn(async () => { server = { ...server, status: "queued", error: undefined }; }),
    deleteMeeting: vi.fn(async () => {}),
  } satisfies MeetingApi;
  const controller = new MeetingRecorder(store, api, environment, microphone, queueEnvironment);
  return { store, api, controller, environment, queueEnvironment, microphone, captures, serverChunks,
    state: () => controller.getSnapshot(),
    setOnline(value: boolean) { online = value; if (value) onlineHandlers.forEach(callback => callback()); },
    setServer(value: Partial<MeetingResult>) { server = { ...server, ...value }; },
    visibility(hidden: boolean) { visibility.forEach(callback => callback(hidden)); },
  };
}
export const localMeeting = (): LocalMeeting => ({ id: "meeting-1", title: "Recovered", language: "hr", status: "interrupted",
  parts: [{ part: 1, chunkCount: 2, contentType: "audio/mp4", startedAt: "2026-10-27T08:00:00.000Z", endedAt: "2026-10-27T08:00:10.000Z", durationSeconds: 10 }] });
export const localChunk = (index: number, uploaded = false): MeetingChunk => ({ meetingId: "meeting-1", part: 1, index, blob: new Blob([`chunk-${index}`]), contentType: "audio/mp4", endSeconds: (index + 1) * 5, uploaded });
export async function settle() { for (let i = 0; i < 40; i++) await Promise.resolve(); }

import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { browserMeetingEnvironment, isIOSDevice, meetingRecorderOptions } from "../src/lib/meeting-browser";
const track = new EventTarget() as EventTarget & { stop: () => void };
let recorders: FakeRecorder[];
let rejectBitrate = false;
let supported: string[];
class FakeRecorder {
  static isTypeSupported = (mime: string) => supported.includes(mime);
  state = "inactive";
  mimeType: string;
  ondataavailable?: (event: { data: Blob }) => void;
  onstop?: () => void;
  onerror?: () => void;
  start = vi.fn((timeslice: number) => { this.state = "recording"; });
  pause = vi.fn(() => { this.state = "paused"; });
  resume = vi.fn(() => { this.state = "recording"; });
  stop = vi.fn(() => {
    this.state = "inactive";
    setTimeout(() => { this.ondataavailable?.({ data: new Blob(["tail"], { type: this.mimeType }) }); this.onstop?.(); }, 30);
  });
  constructor(_stream: unknown, public options: MediaRecorderOptions = {}) {
    if (rejectBitrate && options.audioBitsPerSecond) throw Error("bitrate unsupported");
    this.mimeType = options.mimeType ?? "audio/ogg"; recorders.push(this);
  }
}
const close = vi.fn(async () => {});
class FakeContext {
  state = "running";
  resume = vi.fn(async () => {});
  close = close;
  createAnalyser() { return { fftSize: 256, getByteTimeDomainData: (samples: Uint8Array) => samples.fill(140) }; }
  createMediaStreamSource() { return { connect: vi.fn() }; }
}
const stream = { getTracks: () => [track], getAudioTracks: () => [track] };
const getUserMedia = vi.fn(async () => stream);
beforeEach(() => {
  vi.useFakeTimers(); recorders = []; supported = ["audio/webm;codecs=opus", "audio/mp4"]; rejectBitrate = false;
  track.stop = vi.fn(); vi.stubGlobal("window", globalThis); vi.stubGlobal("document", new EventTarget());
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia }, userAgent: "Chrome", platform: "Linux", maxTouchPoints: 0, wakeLock: { request: vi.fn() } });
  vi.stubGlobal("MediaRecorder", FakeRecorder); vi.stubGlobal("AudioContext", FakeContext); getUserMedia.mockResolvedValue(stream);
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
it("prefers Opus, falls back to MP4 on iOS and then the browser default", () => {
  expect(meetingRecorderOptions(mime => mime.includes("opus"))).toEqual({ mimeType: "audio/webm;codecs=opus", audioBitsPerSecond: 32000 });
  expect(meetingRecorderOptions(mime => mime === "audio/mp4").mimeType).toBe("audio/mp4");
  expect(meetingRecorderOptions(() => false)).toEqual({ audioBitsPerSecond: 32000 });
});
it("uses mono/noise suppression, five-second slices and waits for the final data event before resolving stop", async () => {
  const capture = await browserMeetingEnvironment().openCapture(); const chunks = vi.fn(); const level = vi.fn();
  capture.start(chunks, vi.fn(), level);
  expect(getUserMedia).toHaveBeenCalledWith({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
  expect(recorders[0].options.audioBitsPerSecond).toBe(32000); expect(recorders[0].start).toHaveBeenCalledWith(5000);
  await vi.advanceTimersByTimeAsync(100); expect(level.mock.calls[0][0]).toBeGreaterThan(0);
  const resolved = vi.fn(); const stopped = capture.stop().then(resolved); await Promise.resolve(); expect(resolved).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(30); await stopped; expect(chunks).toHaveBeenCalledOnce(); expect(track.stop).toHaveBeenCalled(); expect(close).toHaveBeenCalled();
});
it("falls back when bitrate is unsupported and pauses/resumes the same recorder", async () => {
  rejectBitrate = true; supported = ["audio/mp4"];
  const capture = await browserMeetingEnvironment().openCapture(); capture.start(vi.fn(), vi.fn(), vi.fn());
  expect(capture.contentType).toBe("audio/mp4"); expect(recorders[0].options.audioBitsPerSecond).toBeUndefined();
  capture.pause(); capture.resume(); expect(recorders[0].pause).toHaveBeenCalledOnce(); expect(recorders[0].resume).toHaveBeenCalledOnce();
  const stopped = capture.stop(); await vi.advanceTimersByTimeAsync(30); await stopped;
});
it("reports mute/ended/recorder errors and detaches track listeners after stopping", async () => {
  const capture = await browserMeetingEnvironment().openCapture(); const interrupted = vi.fn(); capture.start(vi.fn(), interrupted, vi.fn());
  track.dispatchEvent(new Event("mute")); track.dispatchEvent(new Event("ended")); recorders[0].onerror?.(); expect(interrupted).toHaveBeenCalledTimes(3);
  const stopped = capture.stop(); await vi.advanceTimersByTimeAsync(30); await stopped;
  track.dispatchEvent(new Event("ended")); expect(interrupted).toHaveBeenCalledTimes(3);
});
it("identifies iPhones and iPads that report a desktop platform", () => {
  expect(isIOSDevice()).toBe(false);
  vi.stubGlobal("navigator", { userAgent: "iPhone", platform: "iPhone", maxTouchPoints: 5 }); expect(isIOSDevice()).toBe(true);
  vi.stubGlobal("navigator", { userAgent: "Safari", platform: "MacIntel", maxTouchPoints: 5 }); expect(isIOSDevice()).toBe(true);
});
it("cleans up the audio context when microphone access fails", async () => {
  getUserMedia.mockRejectedValueOnce({ name: "NotAllowedError" });
  await expect(browserMeetingEnvironment().openCapture()).rejects.toThrow("verweigert"); expect(close).toHaveBeenCalled();
});
it("waits for final error data even when the browser already reports an inactive recorder", async () => {
  const capture = await browserMeetingEnvironment().openCapture(); const chunks = vi.fn(); capture.start(chunks, vi.fn(), vi.fn());
  recorders[0].state = "inactive"; recorders[0].onerror?.(); const resolved = vi.fn(); const stopped = capture.stop().then(resolved);
  await Promise.resolve(); expect(resolved).not.toHaveBeenCalled();
  recorders[0].ondataavailable?.({ data: new Blob(["last bytes"]) }); recorders[0].onstop?.(); await stopped;
  expect(chunks).toHaveBeenCalledOnce(); expect(resolved).toHaveBeenCalledOnce();
});

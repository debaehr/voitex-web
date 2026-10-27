import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { browserMeetingEnvironment, isIOSDevice, meetingRecorderOptions, SystemAudioChoice, readSystemAudioPreference, writeSystemAudioPreference } from "../src/lib/meeting-browser";
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
  constructor(public stream: unknown, public options: MediaRecorderOptions = {}) {
    if (rejectBitrate && options.audioBitsPerSecond) throw Error("bitrate unsupported");
    this.mimeType = options.mimeType ?? "audio/ogg"; recorders.push(this);
  }
}
const close = vi.fn(async () => {});
class FakeContext {
  state = "running";
  resume = vi.fn(async () => {});
  close = close;
  createGain() { const node = { gain: { value: 0 }, connect: vi.fn(), disconnect: vi.fn() }; gains.push(node); return node; }
  createMediaStreamDestination() { return mixed; }
  createAnalyser() { return { disconnect: vi.fn(), fftSize: 256, getByteTimeDomainData: (samples: Uint8Array) => samples.fill(140) }; }
  createMediaStreamSource() { return { connect: vi.fn(), disconnect: vi.fn() }; }
}
let gains: Array<{ gain: { value: number }; connect: ReturnType<typeof vi.fn> }>;
const mixedTrack = { stop: vi.fn() };
const mixed = { channelCount: 2, channelCountMode: "max", stream: { getTracks: () => [mixedTrack] } };
const audioTrack = () => Object.assign(new EventTarget(), { stop: vi.fn() });
function displayStream(audio = true) {
  const sound = audioTrack(), video = audioTrack();
  return { sound, video, getTracks: () => audio ? [sound, video] : [video], getAudioTracks: () => audio ? [sound] : [], getVideoTracks: () => [video] };
}
const stream = { getTracks: () => [track], getAudioTracks: () => [track] };
const getUserMedia = vi.fn(async () => stream);
beforeEach(() => {
  vi.useFakeTimers(); gains = []; recorders = []; supported = ["audio/webm;codecs=opus", "audio/mp4"]; rejectBitrate = false;
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

it("offers system audio only with display capture on desktop, including desktop-mode iPads", () => {
  expect(browserMeetingEnvironment().systemAudioSupported).toBe(false);
  Object.assign(navigator.mediaDevices, { getDisplayMedia: vi.fn() });
  expect(browserMeetingEnvironment().systemAudioSupported).toBe(true);
  for (const userAgent of ["Android Chrome", "iPhone", "iPad"]) {
    vi.stubGlobal("navigator", { mediaDevices: { getDisplayMedia: vi.fn() }, userAgent });
    expect(browserMeetingEnvironment().systemAudioSupported).toBe(false);
  }
  vi.stubGlobal("navigator", { mediaDevices: { getDisplayMedia: vi.fn() }, userAgent: "Safari", platform: "MacIntel", maxTouchPoints: 5 });
  expect(browserMeetingEnvironment().systemAudioSupported).toBe(false);
});
it("defaults the device preference off, remembers it and tolerates blocked storage", () => {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (key: string) => values.get(key), setItem: (key: string, value: string) => values.set(key, value) });
  expect(readSystemAudioPreference()).toBe(false); writeSystemAudioPreference(true); expect(readSystemAudioPreference()).toBe(true);
  writeSystemAudioPreference(false); expect(readSystemAudioPreference()).toBe(false);
  vi.stubGlobal("localStorage", { getItem: () => { throw Error("blocked"); }, setItem: () => { throw Error("blocked"); } });
  expect(readSystemAudioPreference()).toBe(false); expect(() => writeSystemAudioPreference(true)).not.toThrow();
});
it("requests display first, stops video immediately and records two unity gains mixed to mono", async () => {
  const display = displayStream(); const getDisplayMedia = vi.fn(async () => display);
  Object.assign(navigator.mediaDevices, { getDisplayMedia });
  const capture = await browserMeetingEnvironment().openCapture({ systemAudio: true });
  expect(getDisplayMedia.mock.invocationCallOrder[0]).toBeLessThan(getUserMedia.mock.invocationCallOrder.at(-1)!);
  expect(getDisplayMedia).toHaveBeenCalledWith({ video: true, audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }, systemAudio: "include", selfBrowserSurface: "exclude" });
  expect(display.video.stop).toHaveBeenCalled(); expect(display.sound.stop).not.toHaveBeenCalled();
  expect(recorders[0].stream).toBe(mixed.stream); expect(mixed.channelCount).toBe(1); expect(mixed.channelCountMode).toBe("explicit");
  expect(gains.map(node => node.gain.value)).toEqual([1, 1]); gains.forEach(node => expect(node.connect).toHaveBeenCalledWith(mixed));
  const micLevel = vi.fn(), computerLevel = vi.fn(); capture.start(vi.fn(), vi.fn(), micLevel, vi.fn(), computerLevel);
  await vi.advanceTimersByTimeAsync(100); expect(micLevel).toHaveBeenCalled(); expect(computerLevel).toHaveBeenCalled();
  const stopped = capture.stop(); await vi.advanceTimersByTimeAsync(30); await stopped;
  expect(track.stop).toHaveBeenCalled(); expect(display.sound.stop).toHaveBeenCalled(); expect(mixedTrack.stop).toHaveBeenCalled();
});
it("requires an explicit choice for no audio or cancellation and never opens the microphone", async () => {
  const display = displayStream(false); const getDisplayMedia = vi.fn().mockResolvedValueOnce(display).mockRejectedValueOnce({ name: "NotAllowedError" });
  Object.assign(navigator.mediaDevices, { getDisplayMedia });
  await expect(browserMeetingEnvironment().openCapture({ systemAudio: true })).rejects.toThrow("kein Ton freigegeben");
  expect(display.video.stop).toHaveBeenCalled();
  await expect(browserMeetingEnvironment().openCapture({ systemAudio: true })).rejects.toBeInstanceOf(SystemAudioChoice);
  expect(getUserMedia).not.toHaveBeenCalled(); expect(recorders).toHaveLength(0);
});
it("stops display audio when microphone permission fails", async () => {
  const display = displayStream(); Object.assign(navigator.mediaDevices, { getDisplayMedia: vi.fn(async () => display) });
  getUserMedia.mockRejectedValueOnce({ name: "NotAllowedError" });
  await expect(browserMeetingEnvironment().openCapture({ systemAudio: true })).rejects.toThrow("verweigert");
  expect(display.sound.stop).toHaveBeenCalled(); expect(display.video.stop).toHaveBeenCalled();
});
it("ignores system mute, reports ended separately and replaces the source on the same recorder", async () => {
  const first = displayStream(), second = displayStream();
  const getDisplayMedia = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second);
  Object.assign(navigator.mediaDevices, { getDisplayMedia });
  const capture = await browserMeetingEnvironment().openCapture({ systemAudio: true });
  const interrupted = vi.fn(), ended = vi.fn(); capture.start(vi.fn(), interrupted, vi.fn(), ended);
  first.sound.dispatchEvent(new Event("mute")); first.sound.dispatchEvent(new Event("unmute"));
  expect(interrupted).not.toHaveBeenCalled(); expect(ended).not.toHaveBeenCalled();
  first.sound.dispatchEvent(new Event("ended")); expect(ended).toHaveBeenCalledOnce(); expect(recorders[0].state).toBe("recording");
  await capture.addSystemAudio(); expect(recorders).toHaveLength(1); expect(second.video.stop).toHaveBeenCalled();
  first.sound.dispatchEvent(new Event("ended")); expect(ended).toHaveBeenCalledOnce();
  const stopped = capture.stop(); await vi.advanceTimersByTimeAsync(30); await stopped;
  expect(second.sound.stop).toHaveBeenCalled();
});
it("releases a late replacement grant after Stop", async () => {
  const first = displayStream(), second = displayStream(); let grant!: (value: unknown) => void;
  Object.assign(navigator.mediaDevices, { getDisplayMedia: vi.fn().mockResolvedValueOnce(first).mockImplementationOnce(() => new Promise(resolve => { grant = resolve; })) });
  const capture = await browserMeetingEnvironment().openCapture({ systemAudio: true }); capture.start(vi.fn(), vi.fn(), vi.fn());
  const adding = capture.addSystemAudio(); const stopped = capture.stop(); await vi.advanceTimersByTimeAsync(30); await stopped;
  grant(second); await adding; expect(second.sound.stop).toHaveBeenCalled(); expect(second.video.stop).toHaveBeenCalled();
});

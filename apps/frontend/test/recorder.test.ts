import { afterEach, beforeEach, expect, it, vi } from "vitest";
const hooks = vi.hoisted(() => ({
  cleanups: [] as Array<() => void>,
  effects: [] as Array<() => void | (() => void)>,
}));
vi.mock("react", () => ({
  useState: (value: unknown) => [value, vi.fn()],
  useRef: (value: unknown) => ({ current: value }),
  useEffect: (effect: () => void | (() => void)) => { hooks.effects.push(effect); },
}));
import { useRecorder } from "../src/lib/useRecorder";
const trackStop = vi.fn();
const close = vi.fn(async () => {});
let instances: FakeRecorder[];
class FakeRecorder {
  state = "inactive";
  mimeType = "audio/webm";
  ondataavailable?: (event: { data: Blob }) => void;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(_stream: unknown) { instances.push(this); }
  start() { this.state = "recording"; }
  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["audio"]) });
    this.onstop?.();
  }
}
class FakeContext {
  state = "running";
  resume = vi.fn(async () => {});
  close = close;
  createAnalyser() {
    return { fftSize: 256, getByteTimeDomainData: (samples: Uint8Array) => samples.fill(140) };
  }
  createMediaStreamSource() { return { connect: vi.fn() }; }
}
const stream = { getTracks: () => [{ stop: trackStop }] };
const getUserMedia = vi.fn(async () => stream);
function mount() {
  const onError = vi.fn();
  const recorder = useRecorder(onError);
  for (const effect of hooks.effects.splice(0)) {
    const cleanup = effect(); if (cleanup) hooks.cleanups.push(cleanup);
  }
  return { recorder, onError };
}
function unmount() { hooks.cleanups.splice(0).forEach(cleanup => cleanup()); }
beforeEach(() => {
  vi.useFakeTimers(); instances = [];
  vi.stubGlobal("window", globalThis);
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
  vi.stubGlobal("MediaRecorder", FakeRecorder); vi.stubGlobal("AudioContext", FakeContext);
  getUserMedia.mockResolvedValue(stream);
});
afterEach(() => {
  unmount(); vi.unstubAllGlobals(); vi.clearAllMocks(); vi.useRealTimers();
});
it("records audio, prevents duplicate starts and frees microphone/context on stop", async () => {
  const { recorder } = mount();
  expect(await recorder.start()).toBe(true);
  expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
  expect(await recorder.start()).toBe(false);
  vi.advanceTimersByTime(650);
  const result = await recorder.stop();
  expect(result.audio.size).toBe(5); expect(result.durationSeconds).toBeGreaterThanOrEqual(0.5);
  expect(trackStop).toHaveBeenCalled(); expect(close).toHaveBeenCalled();
  await expect(recorder.stop()).rejects.toThrow("Keine Aufnahme");
});
it("stops active tracks on unmount", async () => {
  const { recorder } = mount(); await recorder.start(); unmount();
  expect(trackStop).toHaveBeenCalled(); expect(close).toHaveBeenCalled();
  expect(instances[0].state).toBe("inactive");
});
it("closes audio context when microphone permission fails", async () => {
  getUserMedia.mockRejectedValueOnce({ name: "NotAllowedError" });
  const { recorder } = mount();
  await expect(recorder.start()).rejects.toThrow("verweigert");
  expect(close).toHaveBeenCalled();
});
it("disposes a late permission grant after unmount", async () => {
  let grant!: (value: typeof stream) => void;
  getUserMedia.mockImplementationOnce(() => new Promise(resolve => { grant = resolve; }));
  const { recorder } = mount();
  const start = recorder.start(); await Promise.resolve(); unmount();
  expect(close).toHaveBeenCalled();
  grant(stream); expect(await start).toBe(false);
  expect(trackStop).toHaveBeenCalled(); expect(instances).toHaveLength(0);
});
it("reports unexpected device stop and allows starting again", async () => {
  const { recorder, onError } = mount(); await recorder.start();
  instances[0].stop();
  expect(onError).toHaveBeenCalled();
  expect(await recorder.start()).toBe(true);
});
it("reports unsupported browsers without asking for microphone access", async () => {
  vi.stubGlobal("MediaRecorder", undefined);
  const { recorder } = mount();
  await expect(recorder.start()).rejects.toThrow("nicht unterstützt");
  expect(getUserMedia).not.toHaveBeenCalled();
});

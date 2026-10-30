import { afterEach, beforeEach, expect, it, vi } from "vitest";
const hooks = vi.hoisted(() => ({
  writes: [] as Array<ReturnType<typeof vi.fn>>,
  cleanups: [] as Array<() => void>,
  effects: [] as Array<() => void | (() => void)>,
}));
vi.mock("react", () => ({
  useState: (value: unknown) => { const write = vi.fn(); hooks.writes.push(write); return [value, write]; },
  useRef: (value: unknown) => ({ current: value }),
  useEffect: (effect: () => void | (() => void)) => { hooks.effects.push(effect); },
}));
import { useRecorder, useRecordingBeforeUnload } from "../src/lib/useRecorder";
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
  pause = vi.fn(() => { this.state = "paused"; });
  resume = vi.fn(() => { this.state = "recording"; });
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
  const recorder = useRecorder();
  for (const effect of hooks.effects.splice(0)) {
    const cleanup = effect(); if (cleanup) hooks.cleanups.push(cleanup);
  }
  return { recorder };
}
function unmount() { hooks.cleanups.splice(0).forEach(cleanup => cleanup()); }
beforeEach(() => {
  vi.useFakeTimers(); instances = []; hooks.writes = [];
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
it("retains unexpected device stop until explicitly discarded", async () => {
  const { recorder } = mount(); await recorder.start();
  instances[0].stop();
  expect(await recorder.start()).toBe(false);
  recorder.discard();
  expect(await recorder.start()).toBe(true);
});
it("reports unsupported browsers without asking for microphone access", async () => {
  vi.stubGlobal("MediaRecorder", undefined);
  const { recorder } = mount();
  await expect(recorder.start()).rejects.toThrow("nicht unterstützt");
  expect(getUserMedia).not.toHaveBeenCalled();
});

it("pauses and resumes the same recorder, excluding all paused intervals", async () => {
  const { recorder } = mount(); await recorder.start();
  vi.advanceTimersByTime(1000); recorder.pause();
  expect(instances[0].pause).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(120000); recorder.resume();
  expect(instances[0].resume).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(2000); recorder.pause();
  vi.advanceTimersByTime(5000);
  const result = await recorder.stop();
  expect(result.durationSeconds).toBeCloseTo(3);
  expect(result.audio.size).toBe(5); expect(instances).toHaveLength(1);
});
it.each([false, true])("processes all chunks after an unexpected stop, paused=%s", async paused => {
  const { recorder } = mount(); await recorder.start();
  instances[0].ondataavailable?.({ data: new Blob(["first"]) });
  vi.advanceTimersByTime(1000); if (paused) recorder.pause();
  vi.advanceTimersByTime(1000); instances[0].stop();
  const result = await recorder.stop();
  expect(await result.audio.text()).toBe("firstaudio");
  expect(result.durationSeconds).toBeCloseTo(paused ? 1 : 2);
});
it("retains chunks on recorder errors until their final stop event", async () => {
  const { recorder } = mount(); await recorder.start();
  instances[0].onerror?.();
  expect((await recorder.stop()).audio.size).toBe(5);
});

it("freezes elapsed and level updates throughout a pause and retains microphone access", async () => {
  const { recorder } = mount(); await recorder.start();
  vi.advanceTimersByTime(1500); recorder.pause();
  const elapsed = hooks.writes[4], levels = hooks.writes[5];
  expect(elapsed).toHaveBeenLastCalledWith(1);
  elapsed.mockClear(); levels.mockClear(); trackStop.mockClear();
  vi.advanceTimersByTime(120000);
  expect(elapsed).not.toHaveBeenCalled(); expect(levels).not.toHaveBeenCalled();
  expect(trackStop).not.toHaveBeenCalled();
  expect(hooks.writes[0]).toHaveBeenLastCalledWith(true);
  recorder.resume(); vi.advanceTimersByTime(500);
  expect(elapsed).toHaveBeenLastCalledWith(2); expect(levels).toHaveBeenCalled();
});
it.each([false, true])("warns before unload only when recording (including paused), active=%s", active => {
  const add = vi.fn(), remove = vi.fn();
  vi.stubGlobal("addEventListener", add); vi.stubGlobal("removeEventListener", remove);
  useRecordingBeforeUnload(active);
  const cleanup = hooks.effects.splice(0)[0]();
  if (!active) { expect(add).not.toHaveBeenCalled(); return; }
  const [name, handler] = add.mock.calls[0]; expect(name).toBe("beforeunload");
  const event = { preventDefault: vi.fn(), returnValue: undefined };
  handler(event); expect(event.preventDefault).toHaveBeenCalled(); expect(event.returnValue).toBe("");
  cleanup?.(); expect(remove).toHaveBeenCalledWith("beforeunload", handler);
});
it("detects lack of pause support while keeping stop available", async () => {
  class LegacyRecorder extends FakeRecorder {
    constructor(stream: unknown) { super(stream); this.pause = undefined as never; this.resume = undefined as never; }
  }
  vi.stubGlobal("MediaRecorder", LegacyRecorder);
  const { recorder } = mount(); await recorder.start();
  expect(hooks.writes[3]).toHaveBeenLastCalledWith(false);
  recorder.pause(); expect((await recorder.stop()).audio.size).toBe(5);
});

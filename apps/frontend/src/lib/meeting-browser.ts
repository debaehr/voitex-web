import { normalizeLevel, recorderError } from "./recorder";

export interface MeetingCapture {
  contentType: string;
  start(chunk: (blob: Blob) => void, interrupted: (message: string) => void, level: (value: number) => void): void;
  pause(): void;
  resume(): void;
  stop(): Promise<void>;
}
export interface MeetingEnvironment {
  now(): number;
  monotonic(): number;
  openCapture(): Promise<MeetingCapture>;
  every(callback: () => void, milliseconds: number): () => void;
  onVisibility(callback: (hidden: boolean) => void): () => void;
  isIOS: boolean;
  wakeSupported: boolean;
  wake(): Promise<{ release(): Promise<void> }>;
}
export function isIOSDevice() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
}
export function meetingRecorderOptions(supported: (mime: string) => boolean): MediaRecorderOptions {
  const mimeType = ["audio/webm;codecs=opus", "audio/mp4"].find(supported);
  return { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 32_000 };
}
async function openCapture(): Promise<MeetingCapture> {
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
    throw new Error("Audioaufnahme wird in diesem Browser nicht unterstützt.");
  }
  let stream: MediaStream | undefined;
  let context: AudioContext | undefined;
  let timer: number | undefined;
  let detach = () => {};
  const release = () => {
    window.clearInterval(timer); detach();
    stream?.getTracks().forEach(track => track.stop());
    if (context && context.state !== "closed") void context.close().catch(() => undefined);
  };
  try {
    // Resume before awaiting permission/network, while Safari still has the user gesture.
    if (typeof AudioContext !== "undefined") {
      context = new AudioContext();
      try { await context.resume(); } catch { /* Meter failure must not prevent recording. */ }
    }
    stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
    const options = meetingRecorderOptions(mime => MediaRecorder.isTypeSupported(mime));
    let recorder: MediaRecorder;
    try { recorder = new MediaRecorder(stream, options); }
    catch { recorder = new MediaRecorder(stream, options.mimeType ? { mimeType: options.mimeType } : undefined); }
    let stopped: Promise<void> | undefined;
    let resolveStop: (() => void) | undefined;
    let started = false;
    let didStop = false;
    let requestedStop = false;
    return {
      contentType: recorder.mimeType || options.mimeType || "application/octet-stream",
      start(chunk, interrupted, level) {
        recorder.ondataavailable = event => { if (event.data.size) chunk(event.data); };
        recorder.onerror = () => interrupted("Der Audiorekorder hat einen Fehler gemeldet. Bitte die Aufnahme fortsetzen.");
        recorder.onstop = () => {
          didStop = true;
          release();
          if (!requestedStop) interrupted("Die Aufnahme wurde vom Gerät beendet. Bitte die Aufnahme fortsetzen.");
          resolveStop?.();
        };
        const trackInterrupted = () => interrupted("Das Mikrofon wurde unterbrochen oder stummgeschaltet. Bitte die Aufnahme fortsetzen.");
        const tracks = stream!.getAudioTracks();
        tracks.forEach(track => { track.addEventListener("ended", trackInterrupted); track.addEventListener("mute", trackInterrupted); });
        detach = () => tracks.forEach(track => { track.removeEventListener("ended", trackInterrupted); track.removeEventListener("mute", trackInterrupted); });
        if (context) {
          const analyser = context.createAnalyser(); analyser.fftSize = 256;
          context.createMediaStreamSource(stream!).connect(analyser);
          const samples = new Uint8Array(analyser.fftSize);
          timer = window.setInterval(() => { analyser.getByteTimeDomainData(samples); level(normalizeLevel(samples)); }, 100);
        }
        recorder.start(5000); started = true;
      },
      pause: () => recorder.pause(),
      resume: () => recorder.resume(),
      stop() {
        if (stopped) return stopped;
        requestedStop = true;
        stopped = new Promise<void>((resolve, reject) => {
          resolveStop = resolve;
          if (!started || didStop) { release(); resolve(); return; }
          // An encoder error can switch state before delivering its final data/stop events.
          try { if (recorder.state !== "inactive") recorder.stop(); } catch (error) { release(); reject(error); }
        });
        return stopped;
      },
    };
  } catch (error) { release(); throw new Error(recorderError(error)); }
}
export function browserMeetingEnvironment(): MeetingEnvironment {
  return {
    now: () => Date.now(), monotonic: () => performance.now(), openCapture,
    every: (callback, milliseconds) => { const timer = window.setInterval(callback, milliseconds); return () => window.clearInterval(timer); },
    onVisibility: callback => {
      const handler = () => callback(document.hidden);
      document.addEventListener("visibilitychange", handler); return () => document.removeEventListener("visibilitychange", handler);
    },
    isIOS: isIOSDevice(), wakeSupported: "wakeLock" in navigator,
    wake: () => navigator.wakeLock.request("screen"),
  };
}

import { normalizeLevel, recorderError } from "./recorder";

export interface MeetingCapture {
  contentType: string;
  start(chunk: (blob: Blob) => void, interrupted: (message: string) => void, level: (value: number) => void, systemAudioEnded?: () => void, computerLevel?: (value: number) => void): void;
  addSystemAudio(): Promise<void>;
  pause(): void;
  resume(): void;
  stop(): Promise<void>;
}
export interface MeetingEnvironment {
  now(): number;
  monotonic(): number;
  openCapture(options?: { systemAudio: boolean }): Promise<MeetingCapture>;
  systemAudioSupported: boolean;
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
export class SystemAudioChoice extends Error {}
export function systemAudioAvailable() {
  return !!navigator.mediaDevices?.getDisplayMedia && !isIOSDevice() && !/Android/i.test(navigator.userAgent);
}
export function readSystemAudioPreference() {
  try { return localStorage.getItem("voitex-meeting-system-audio") === "true"; } catch { return false; }
}
export function writeSystemAudioPreference(value: boolean) {
  try { localStorage.setItem("voitex-meeting-system-audio", String(value)); } catch { /* Storage may be blocked on this device. */ }
}
async function requestSystemAudio(): Promise<MediaStream> {
  let display: MediaStream;
  try {
    // Chromium requires video and a live click gesture even though we only keep audio.
    display = await navigator.mediaDevices.getDisplayMedia({
      video: true, audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      systemAudio: "include", selfBrowserSurface: "exclude",
    } as DisplayMediaStreamOptions);
  } catch (error) {
    if ((error as { name?: string })?.name === "NotAllowedError") throw new SystemAudioChoice("Die Tonfreigabe wurde abgebrochen. Bitte erneut versuchen oder nur das Mikrofon aufnehmen.");
    throw new Error("Computerton konnte nicht freigegeben werden. Bitte die Browser-Berechtigungen und die gewählte Quelle prüfen.");
  }
  display.getVideoTracks().forEach(track => track.stop());
  if (!display.getAudioTracks().length) {
    display.getTracks().forEach(track => track.stop());
    throw new SystemAudioChoice("Es wurde kein Ton freigegeben. Bitte erneut versuchen und ‚Systemaudio teilen‘ anhaken.");
  }
  return display;
}
async function openCapture({ systemAudio = false } = {}): Promise<MeetingCapture> {
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
    throw new Error("Audioaufnahme wird in diesem Browser nicht unterstützt.");
  }
  let stream: MediaStream | undefined;
  let context: AudioContext | undefined;
  let display: MediaStream | undefined;
  let destination: MediaStreamAudioDestinationNode | undefined;
  let systemSource: MediaStreamAudioSourceNode | undefined;
  let systemGain: GainNode | undefined;
  let systemAnalyser: AnalyserNode | undefined;
  let detachSystem = () => {};
  let endedCallback = () => {};
  let released = false;
  let timer: number | undefined;
  let detach = () => {};
  const release = () => {
    released = true; window.clearInterval(timer); detach(); detachSystem();
    display?.getTracks().forEach(track => track.stop());
    destination?.stream.getTracks().forEach(track => track.stop());
    stream?.getTracks().forEach(track => track.stop());
    if (context && context.state !== "closed") void context.close().catch(() => undefined);
  };
  try {
    // Display permission must be requested before any await consumes the click gesture.
    if (systemAudio) display = await requestSystemAudio();
    // Resume before awaiting permission/network, while Safari still has the user gesture.
    if (typeof AudioContext !== "undefined") {
      context = new AudioContext();
      try { await context.resume(); } catch { /* Meter failure must not prevent recording. */ }
    }
    stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
    const attachSystem = (next: MediaStream) => {
      detachSystem(); systemSource?.disconnect(); systemGain?.disconnect(); systemAnalyser?.disconnect();
      display?.getTracks().forEach(track => { if (!next.getTracks().includes(track)) track.stop(); });
      display = next;
      systemSource = context!.createMediaStreamSource(next);
      systemGain = context!.createGain(); systemGain.gain.value = 1;
      systemAnalyser = context!.createAnalyser(); systemAnalyser.fftSize = 256;
      systemSource.connect(systemGain); systemGain.connect(destination!); systemSource.connect(systemAnalyser);
      const ended = () => { systemAnalyser = undefined; endedCallback(); };
      const tracks = next.getAudioTracks();
      // System mute/unmute are normal during silence and must never interrupt the mic.
      tracks.forEach(track => track.addEventListener("ended", ended));
      detachSystem = () => tracks.forEach(track => track.removeEventListener("ended", ended));
    };
    let recordedStream = stream;
    if (systemAudio) {
      if (!context) throw new Error("Computerton kann in diesem Browser nicht gemischt werden.");
      destination = context.createMediaStreamDestination();
      destination.channelCount = 1; destination.channelCountMode = "explicit";
      const micGain = context.createGain(); micGain.gain.value = 1;
      context.createMediaStreamSource(stream).connect(micGain); micGain.connect(destination);
      attachSystem(display!); recordedStream = destination.stream;
    }
    const options = meetingRecorderOptions(mime => MediaRecorder.isTypeSupported(mime));
    let recorder: MediaRecorder;
    try { recorder = new MediaRecorder(recordedStream, options); }
    catch { recorder = new MediaRecorder(recordedStream, options.mimeType ? { mimeType: options.mimeType } : undefined); }
    let stopped: Promise<void> | undefined;
    let resolveStop: (() => void) | undefined;
    let started = false;
    let didStop = false;
    let requestedStop = false;
    return {
      contentType: recorder.mimeType || options.mimeType || "application/octet-stream",
      async addSystemAudio() {
        const next = await requestSystemAudio();
        // A permission dialog may outlive Stop or an interruption.
        if (released || requestedStop) { next.getTracks().forEach(track => track.stop()); return; }
        try { attachSystem(next); }
        catch {
          next.getTracks().forEach(track => track.stop());
          throw new Error("Computerton konnte nicht mit dem Mikrofon gemischt werden. Bitte erneut freigeben.");
        }
      },
      start(chunk, interrupted, level, systemAudioEnded, computerLevel) {
        endedCallback = systemAudioEnded ?? (() => {});
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
          timer = window.setInterval(() => { analyser.getByteTimeDomainData(samples); level(normalizeLevel(samples));
            if (systemAnalyser) { systemAnalyser.getByteTimeDomainData(samples); computerLevel?.(normalizeLevel(samples)); }
          }, 100);
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
  } catch (error) { release(); if (error instanceof SystemAudioChoice) throw error; throw new Error(recorderError(error)); }
}
export function browserMeetingEnvironment(): MeetingEnvironment {
  return {
    now: () => Date.now(), monotonic: () => performance.now(), openCapture,
    every: (callback, milliseconds) => { const timer = window.setInterval(callback, milliseconds); return () => window.clearInterval(timer); },
    onVisibility: callback => {
      const handler = () => callback(document.hidden);
      document.addEventListener("visibilitychange", handler); return () => document.removeEventListener("visibilitychange", handler);
    },
    systemAudioSupported: systemAudioAvailable(), isIOS: isIOSDevice(), wakeSupported: "wakeLock" in navigator,
    wake: () => navigator.wakeLock.request("screen"),
  };
}

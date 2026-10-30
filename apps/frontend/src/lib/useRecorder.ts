import { useEffect, useRef, useState } from "react";
import { normalizeLevel, recorderError } from "./recorder";
interface Session {
  stream: MediaStream; context: AudioContext; recorder: MediaRecorder;
  timer?: number; started: number | null; activeMs: number; chunks: Blob[];
  interrupted?: boolean;
  resolve?: (value: { audio: Blob; durationSeconds: number }) => void;
  reject?: (error: Error) => void;
  durationSeconds?: number;
  released?: boolean;
}
function release(session: Session) {
  if (session.released) return;
  session.released = true;
  window.clearInterval(session.timer);
  session.stream.getTracks().forEach(track => track.stop());
  if (session.context.state !== "closed") void session.context.close().catch(() => undefined);
}
function duration(session: Session) {
  return (session.activeMs + (session.started === null ? 0 : performance.now() - session.started)) / 1000;
}
function freeze(session: Session) {
  session.activeMs = duration(session) * 1000;
  session.started = null;
}
function result(session: Session) {
  return {
    audio: new Blob(session.chunks, { type: session.recorder.mimeType || session.chunks[0]?.type || "audio/webm" }),
    durationSeconds: session.durationSeconds ?? duration(session),
  };
}
export function useRecordingBeforeUnload(recording: boolean) {
  useEffect(() => {
    if (!recording) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [recording]);
}
export function useRecorder() {
  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);
  const [interrupted, setInterrupted] = useState(false);
  const [pauseSupported, setPauseSupported] = useState(false);
  useRecordingBeforeUnload(recording);
  const [elapsed, setElapsed] = useState(0);
  const [levels, setLevels] = useState<number[]>([]);
  const active = useRef<Session | null>(null);
  const pending = useRef(false);
  const pendingContext = useRef<AudioContext | null>(null);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (pendingContext.current && pendingContext.current.state !== "closed") {
        void pendingContext.current.close().catch(() => undefined);
        pendingContext.current = null;
      }
      const session = active.current;
      active.current = null;
      if (session) {
        session.recorder.onstop = null;
        session.recorder.onerror = null;
        if (session.recorder.state !== "inactive") session.recorder.stop();
        release(session);
        session.reject?.(new Error("Aufnahme abgebrochen."));
      }
    };
  }, []);
  async function start(): Promise<boolean> {
    if (pending.current || active.current) return false;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined" || typeof AudioContext === "undefined") {
      throw new Error("Audioaufnahme wird in diesem Browser nicht unterstützt.");
    }
    pending.current = true;
    let stream: MediaStream | undefined;
    let context: AudioContext | undefined;
    try {
      // Resume during the user gesture, before the permission request resolves.
      context = new AudioContext();
      pendingContext.current = context;
      await context.resume();
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted.current) {
        stream.getTracks().forEach(track => track.stop());
        void context.close().catch(() => undefined);
        return false;
      }
      pendingContext.current = null;
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      context.createMediaStreamSource(stream).connect(analyser);
      const recorder = new MediaRecorder(stream);
      const session: Session = { stream, context, recorder, started: null, activeMs: 0, chunks: [] };
      const samples = new Uint8Array(analyser.fftSize);
      recorder.ondataavailable = event => { if (event.data.size) session.chunks.push(event.data); };
      recorder.onstop = () => {
        freeze(session);
        release(session);
        if (mounted.current) {
          setElapsed(Math.floor(duration(session)));
          setRecording(false); setPaused(false);
        }
        if (session.resolve) {
          if (active.current === session) active.current = null;
          session.resolve(result(session));
        } else if (mounted.current) {
          // Keep the final data event's chunks until the user chooses recovery or discard.
          session.interrupted = true;
          setInterrupted(true);
        }
      };
      recorder.onerror = () => {
        // An encoder failure still delivers its final chunks through onstop.
        freeze(session);
        if (recorder.state !== "inactive") recorder.stop();
      };
      active.current = session;
      recorder.start();
      session.started = performance.now();
      setElapsed(0); setLevels([]); setRecording(true); setPaused(false); setInterrupted(false);
      setPauseSupported(typeof recorder.pause === "function" && typeof recorder.resume === "function");
      session.timer = window.setInterval(() => {
        if (session.started === null) return;
        analyser.getByteTimeDomainData(samples);
        setLevels(previous => [...previous.slice(-17), normalizeLevel(samples)]);
        setElapsed(Math.floor(duration(session)));
      }, 50);
      return true;
    } catch (error) {
      active.current = null;
      stream?.getTracks().forEach(track => track.stop());
      if (context && context.state !== "closed") void context.close().catch(() => undefined);
      throw new Error(recorderError(error));
    } finally {
      pending.current = false;
      if (pendingContext.current === context) pendingContext.current = null;
    }
  }
  function stop(): Promise<{ audio: Blob; durationSeconds: number }> {
    const session = active.current;
    if (!session || (!session.interrupted && session.recorder.state === "inactive") || session.resolve) return Promise.reject(new Error("Keine Aufnahme aktiv."));
    if (session.interrupted) {
      active.current = null; setInterrupted(false);
      return Promise.resolve(result(session));
    }
    freeze(session);
    session.durationSeconds = duration(session);
    return new Promise((resolve, reject) => {
      session.resolve = resolve; session.reject = reject;
      try {
        session.recorder.stop();
        // Release the microphone immediately; the final data event can arrive later.
        release(session);
      } catch (error) {
        release(session); active.current = null; setRecording(false);
        reject(error);
      }
    });
  }
  function pause() {
    const session = active.current;
    if (!session || session.recorder.state !== "recording" || typeof session.recorder.pause !== "function") return;
    session.recorder.pause(); freeze(session);
    setElapsed(Math.floor(duration(session))); setPaused(true);
  }
  function resume() {
    const session = active.current;
    if (!session || session.recorder.state !== "paused" || typeof session.recorder.resume !== "function") return;
    session.recorder.resume(); session.started = performance.now(); setPaused(false);
  }
  function discard() {
    const session = active.current;
    if (!session?.interrupted) return;
    active.current = null; session.chunks = []; setInterrupted(false);
  }
  return { start, stop, pause, resume, discard, recording, paused, interrupted, pauseSupported, elapsed, levels };
}

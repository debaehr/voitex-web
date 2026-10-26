import { useEffect, useRef, useState } from "react";
import { normalizeLevel, recorderError } from "./recorder";
interface Session {
  stream: MediaStream; context: AudioContext; recorder: MediaRecorder;
  timer?: number; started: number; chunks: Blob[];
  resolve?: (value: { audio: Blob; durationSeconds: number }) => void;
  reject?: (error: Error) => void;
  durationSeconds?: number;
  failed?: boolean;
  released?: boolean;
}
function release(session: Session) {
  if (session.released) return;
  session.released = true;
  window.clearInterval(session.timer);
  session.stream.getTracks().forEach(track => track.stop());
  if (session.context.state !== "closed") void session.context.close().catch(() => undefined);
}
export function useRecorder(onError: (message: string) => void) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [levels, setLevels] = useState<number[]>([]);
  const active = useRef<Session | null>(null);
  const pending = useRef(false);
  const pendingContext = useRef<AudioContext | null>(null);
  const mounted = useRef(false);
  const errorHandler = useRef(onError);
  errorHandler.current = onError;
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
      const session: Session = { stream, context, recorder, started: 0, chunks: [] };
      const samples = new Uint8Array(analyser.fftSize);
      recorder.ondataavailable = event => { if (event.data.size) session.chunks.push(event.data); };
      recorder.onstop = () => {
        release(session);
        if (active.current === session) {
          active.current = null;
          if (mounted.current) setRecording(false);
        }
        if (!session.resolve && !session.failed && mounted.current) {
          errorHandler.current("Aufnahme wurde unterbrochen. Bitte erneut versuchen.");
        }
        session.resolve?.({
          audio: new Blob(session.chunks, { type: recorder.mimeType || session.chunks[0]?.type || "audio/webm" }),
          durationSeconds: session.durationSeconds ?? (performance.now() - session.started) / 1000,
        });
      };
      recorder.onerror = () => {
        session.failed = true;
        const error = new Error("Aufnahme fehlgeschlagen. Bitte erneut versuchen.");
        session.reject?.(error);
        // An unexpected device/encoder failure must also unlock the app.
        if (!session.reject && mounted.current) errorHandler.current(error.message);
        if (recorder.state !== "inactive") recorder.stop();
        release(session);
        if (active.current === session) active.current = null;
        if (mounted.current) setRecording(false);
      };
      active.current = session;
      recorder.start();
      session.started = performance.now();
      setElapsed(0); setLevels([]); setRecording(true);
      session.timer = window.setInterval(() => {
        analyser.getByteTimeDomainData(samples);
        setLevels(previous => [...previous.slice(-17), normalizeLevel(samples)]);
        setElapsed(Math.floor((performance.now() - session.started) / 1000));
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
    if (!session || session.recorder.state === "inactive" || session.resolve) return Promise.reject(new Error("Keine Aufnahme aktiv."));
    session.durationSeconds = (performance.now() - session.started) / 1000;
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
  return { start, stop, recording, elapsed, levels };
}

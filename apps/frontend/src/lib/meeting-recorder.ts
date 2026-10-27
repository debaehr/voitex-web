import type { MeetingCapture, MeetingEnvironment } from "./meeting-browser";
import type { MeetingStore } from "./meeting-store";
import { MeetingUploadQueue, type QueueEnvironment } from "./meeting-upload";
import { chunkKey, meetingDuration, type FinishMeeting, type LocalMeeting, type MeetingApi, type MeetingChunk, type MeetingResult } from "./meeting-types";
import type { MicrophoneGate } from "./microphone";

export const MAX_MEETING_SECONDS = 3 * 60 * 60;
export type RecordingPhase = "loading" | "idle" | "starting" | "recording" | "paused" | "interrupted" | "recovery" | "finishing" | "processing" | "done" | "error";
export interface MeetingSnapshot {
  phase: RecordingPhase; meeting: LocalMeeting | null; result: MeetingResult | null;
  elapsed: number; levels: number[]; secured: number; pending: number; total: number;
  offline: boolean; error: string | null; uploadError: string | null; hint: string | null; wakeHint: string | null;
  active: boolean; canResume: boolean; isIOS: boolean;
}
export const initialMeetingSnapshot: MeetingSnapshot = {
  phase: "loading", meeting: null, result: null, elapsed: 0, levels: [], secured: 0, pending: 0, total: 0,
  offline: false, error: null, uploadError: null, hint: null, wakeHint: null, active: false, canResume: false, isIOS: false,
};
const clone = <T,>(value: T): T => structuredClone(value);

export class MeetingRecorder {
  private snapshot: MeetingSnapshot = initialMeetingSnapshot;
  private listeners = new Set<() => void>();
  private meeting: LocalMeeting | null = null;
  private queue?: MeetingUploadQueue;
  private capture?: MeetingCapture;
  private activeSince?: number;
  private writeTail: Promise<void> = Promise.resolve();
  private unsaved = new Map<string, { meeting: LocalMeeting; chunk: MeetingChunk }>();
  private cancelTick?: () => void;
  private cancelPoll?: () => void;
  private removeVisibility?: () => void;
  private cancelOnlineWait?: () => void;
  private wakeLock?: { release(): Promise<void> };
  private wakePending = false;
  private closing?: Promise<void>;
  private finishing = false;
  private actionPending = false;
  private polling = false;
  private disposed = false;
  constructor(private store: MeetingStore, private api: MeetingApi, private environment: MeetingEnvironment,
    private microphone: MicrophoneGate, private queueEnvironment: QueueEnvironment) {}
  subscribe = (callback: () => void) => { this.listeners.add(callback); return () => { this.listeners.delete(callback); }; };
  getSnapshot = () => this.snapshot;
  private emit(patch: Partial<MeetingSnapshot> = {}) {
    if (this.disposed) return;
    const phase = patch.phase ?? this.snapshot.phase;
    this.snapshot = { ...this.snapshot, ...patch, meeting: this.meeting ? clone(this.meeting) : null,
      pending: this.queue?.pending ?? 0, total: this.queue?.total ?? 0, offline: this.queue?.offline ?? !this.queueEnvironment.online(),
      uploadError: this.queue?.error ?? null,
      secured: this.meeting && this.queue ? this.queue.securedSeconds(this.meeting) : 0,
      active: ["starting", "recording", "paused", "interrupted"].includes(phase),
      canResume: !!this.meeting && this.meeting.status !== "finishing" && meetingDuration(this.meeting) < MAX_MEETING_SECONDS,
      isIOS: this.environment.isIOS,
    };
    this.listeners.forEach(callback => callback());
  }
  async initialize() {
    this.removeVisibility?.();
    this.removeVisibility = this.environment.onVisibility(hidden => {
      if (hidden && this.environment.isIOS && this.capture) void this.interrupt("Wechsel auf den Homescreen oder Sperren hält die Aufnahme an. Zum Weiteraufnehmen bitte fortsetzen.");
      else if (!hidden && this.capture) void this.requestWake();
    });
    try {
      const meetings = await this.store.listMeetings();
      if (this.disposed) return;
      this.meeting = meetings[0] ?? null;
      if (!this.meeting) { this.emit({ phase: "idle" }); return; }
      const chunks = await this.store.listChunks(this.meeting.id);
      // A crash can leave wall time ahead of audio. Recover only time backed by stored chunks.
      for (const part of this.meeting.parts) {
        const audio = chunks.filter(chunk => chunk.part === part.part);
        if (!part.endedAt) {
          part.durationSeconds = Math.max(0, ...audio.map(chunk => chunk.endSeconds));
          part.endedAt = part.lastChunkAt ?? new Date(Date.parse(part.startedAt) + part.durationSeconds * 1000).toISOString();
        }
        part.chunkCount = Math.max(part.chunkCount, ...audio.map(chunk => chunk.index + 1));
      }
      this.createQueue(chunks);
      if (this.meeting.status === "processing") { this.emit({ phase: "processing", elapsed: meetingDuration(this.meeting) }); this.startPolling(); }
      else {
        this.emit({ phase: "recovery", elapsed: meetingDuration(this.meeting) });
        await this.saveMetadata();
        if (this.meeting.status === "finishing") void this.finish();
      }
    } catch { this.emit({ phase: "error", error: "Der lokale Aufnahmespeicher ist nicht verfügbar. Bitte Browser-Speicher erlauben und die Seite neu laden." }); }
  }
  private createQueue(chunks: MeetingChunk[] = []) {
    this.queue = new MeetingUploadQueue(this.store, chunk => this.api.putMeetingChunk(chunk), () => this.emit(), this.queueEnvironment);
    chunks.forEach(chunk => this.queue!.add(chunk));
  }
  private async saveMetadata() {
    const meeting = clone(this.meeting!);
    const write = this.writeTail.then(() => this.store.saveMeeting(meeting));
    this.writeTail = write.catch(() => undefined); await write;
  }
  private accountTime() {
    if (this.activeSince === undefined || !this.meeting) return;
    const now = this.environment.monotonic();
    const part = this.meeting.parts.at(-1)!;
    const other = meetingDuration(this.meeting) - part.durationSeconds;
    part.durationSeconds = Math.min(MAX_MEETING_SECONDS - other, part.durationSeconds + Math.max(0, now - this.activeSince) / 1000);
    this.activeSince = now;
  }
  private async requestWake() {
    if (!this.environment.wakeSupported) { this.emit({ wakeHint: "Bildschirm-Wachhalten wird hier nicht unterstützt. Bitte die App geöffnet und den Bildschirm anlassen." }); return; }
    if (this.wakePending) return;
    this.wakePending = true;
    try {
      await this.wakeLock?.release();
      const lock = await this.environment.wake();
      if (this.disposed || !this.capture) await lock.release();
      else { this.wakeLock = lock; this.emit({ wakeHint: null }); }
    } catch { this.emit({ wakeHint: "Bildschirm konnte nicht wach gehalten werden. Bitte den Bildschirm anlassen." }); }
    finally { this.wakePending = false; }
  }
  async start(title: string, language: string) {
    if (this.actionPending || this.snapshot.phase !== "idle" || !this.microphone.acquire("meeting")) return;
    this.actionPending = true; this.emit({ phase: "starting", error: null });
    let capture: MeetingCapture | undefined;
    try {
      capture = await this.environment.openCapture();
      if (this.disposed) { await capture.stop(); return; }
      const { id } = await this.api.createMeeting({ ...(title.trim() ? { title: title.trim() } : {}), source: "recording", language });
      this.meeting = { id, title: title.trim(), language, parts: [], status: "interrupted" };
      await this.saveMetadata(); this.createQueue();
      await this.beginPart(capture);
    } catch (error) {
      await capture?.stop(); this.capture = undefined; this.microphone.release("meeting");
      this.emit({ phase: this.meeting ? "recovery" : "idle", error: error instanceof Error ? error.message : "Aufnahme konnte nicht gestartet werden." });
    } finally { this.actionPending = false; }
  }
  private async beginPart(capture: MeetingCapture) {
    if (this.disposed) { await capture.stop(); return; }
    this.capture = capture;
    if (this.meeting!.parts.at(-1)?.chunkCount === 0) this.meeting!.parts.pop();
    const part = { part: this.meeting!.parts.length + 1, chunkCount: 0, contentType: capture.contentType,
      startedAt: new Date(this.environment.now()).toISOString(), durationSeconds: 0 };
    this.meeting!.parts.push(part); this.meeting!.status = "recording";
    await this.saveMetadata();
    if (this.disposed) { await capture.stop(); return; }
    this.activeSince = this.environment.monotonic();
    capture.start(blob => this.receiveChunk(blob), message => { void this.interrupt(message); }, value => {
      if (this.snapshot.phase === "recording") this.emit({ levels: [...this.snapshot.levels.slice(-17), value] });
    });
    this.cancelTick = this.environment.every(() => {
      this.accountTime(); this.emit({ elapsed: meetingDuration(this.meeting!) });
      if (meetingDuration(this.meeting!) >= MAX_MEETING_SECONDS) {
        this.emit({ hint: "Drei Stunden erreicht. Die Aufnahme wird automatisch beendet und verarbeitet." }); void this.finish();
      }
    }, 250);
    this.emit({ phase: "recording", error: null, hint: null }); void this.requestWake();
  }
  private receiveChunk(blob: Blob) {
    if (!this.meeting || !blob.size) return;
    this.accountTime();
    const part = this.meeting.parts.at(-1)!;
    part.lastChunkAt = new Date(this.environment.now()).toISOString();
    if (part.contentType === "application/octet-stream" && blob.type) part.contentType = blob.type;
    // Some phones defer data events in the background. Splitting bytes preserves the
    // container after concatenation while keeping each PUT below the API's 10 MB limit.
    const limit = 10 * 1024 * 1024;
    for (let offset = 0; offset < blob.size; offset += limit) {
      const end = Math.min(blob.size, offset + limit);
      const chunk: MeetingChunk = { meetingId: this.meeting.id, part: part.part, index: part.chunkCount++,
        blob: blob.size <= limit ? blob : blob.slice(offset, end, part.contentType), contentType: part.contentType,
        endSeconds: end === blob.size ? part.durationSeconds : 0, uploaded: false };
      this.saveAudio(chunk);
    }
  }
  private saveAudio(chunk: MeetingChunk) {
    const item = { meeting: clone(this.meeting!), chunk };
    this.unsaved.set(chunkKey(chunk), item);
    this.writeTail = this.writeTail.then(async () => {
      try { await this.store.saveChunk(item.meeting, chunk); this.unsaved.delete(chunkKey(chunk)); }
      catch {
        // Keep the blob in memory and upload it even when local storage fills up.
        this.emit({ error: "Lokale Sicherung fehlgeschlagen. Aufnahme angehalten; App geöffnet lassen und erneut verarbeiten." });
        void this.interrupt("Lokaler Speicher ist voll oder nicht verfügbar. Die noch offenen Stücke bleiben bis zum Schließen der App im Speicher.");
      }
      this.queue?.add(chunk);
    });
  }
  async pause() {
    if (!this.capture || this.snapshot.phase !== "recording" || this.actionPending) return;
    try {
      this.capture.pause(); this.accountTime(); this.activeSince = undefined;
      this.meeting!.status = "paused"; this.emit({ phase: "paused", levels: [] }); await this.saveMetadata();
    } catch { await this.interrupt("Die Aufnahme konnte nicht pausiert werden. Bitte fortsetzen."); }
  }
  async resume() {
    if (this.actionPending || this.closing || !this.meeting || !this.snapshot.canResume) return;
    if (this.snapshot.phase === "paused" && this.capture) {
      try {
        this.capture.resume(); this.activeSince = this.environment.monotonic();
        this.meeting.status = "recording"; this.emit({ phase: "recording" }); await this.saveMetadata();
      } catch { await this.interrupt("Die Aufnahme konnte nicht fortgesetzt werden. Bitte erneut fortsetzen."); }
      return;
    }
    if (!["recovery", "interrupted"].includes(this.snapshot.phase)) return;
    // An interrupted in-memory session still owns the microphone reservation.
    if (this.snapshot.phase === "recovery" && !this.microphone.acquire("meeting")) {
      this.emit({ error: "Bitte zuerst das Diktat beenden." }); return;
    }
    this.actionPending = true; this.emit({ phase: "starting", error: null });
    let capture: MeetingCapture | undefined;
    try {
      capture = await this.environment.openCapture(); await this.retryWrites(); await this.beginPart(capture);
    } catch (error) {
      await capture?.stop(); this.capture = undefined;
      this.emit({ phase: "interrupted", error: error instanceof Error ? error.message : "Aufnahme konnte nicht fortgesetzt werden." });
    } finally { this.actionPending = false; }
  }
  private closePart() {
    if (this.closing) return this.closing;
    const capture = this.capture;
    if (!capture) return Promise.resolve();
    this.accountTime(); this.activeSince = undefined;
    this.meeting!.parts.at(-1)!.endedAt = new Date(this.environment.now()).toISOString();
    this.cancelTick?.(); this.cancelTick = undefined;
    this.closing = (async () => {
      await capture.stop(); await this.writeTail;
      this.capture = undefined;
      await this.wakeLock?.release().catch(() => undefined); this.wakeLock = undefined;
      await this.saveMetadata();
    })().finally(() => { this.closing = undefined; });
    return this.closing;
  }
  async interrupt(hint: string) {
    if (!this.capture || this.closing || this.finishing) return;
    this.meeting!.status = "interrupted";
    this.emit({ phase: "interrupted", hint, levels: [] });
    try { await this.closePart(); }
    catch { this.emit({ error: "Lokale Sicherung fehlgeschlagen. Bitte die App geöffnet lassen und erneut verarbeiten." }); }
    this.emit({ elapsed: meetingDuration(this.meeting!) });
  }
  private async retryWrites() {
    await this.writeTail;
    for (const [key, item] of this.unsaved) {
      await this.store.saveChunk(item.meeting, item.chunk); this.unsaved.delete(key);
      this.queue?.add(item.chunk);
    }
    await this.saveMetadata();
  }
  async finish() {
    if (!this.meeting || this.finishing || this.actionPending || !["recording", "paused", "interrupted", "recovery", "finishing"].includes(this.snapshot.phase)) return;
    this.finishing = true; this.meeting.status = "finishing";
    this.emit({ phase: "finishing", error: null, levels: [] });
    try {
      await this.closePart(); this.microphone.release("meeting");
      await this.retryWrites(); this.emit({ elapsed: meetingDuration(this.meeting) });
      while (!this.disposed) {
        await this.waitOnline();
        if (this.disposed) return;
        try {
          // A lost response can mean the server already accepted this finish request.
          const current = await this.api.getMeeting(this.meeting.id);
          if (current.finishedAt) { await this.acceptFinished(); return; }
          await this.queue?.idle(); await this.waitOnline();
          if (this.disposed) return;
          if (this.meeting.parts.at(-1)?.chunkCount === 0) this.meeting.parts.pop();
          const parts = this.meeting.parts.map(({ lastChunkAt: _checkpoint, ...part }) => ({ ...part, endedAt: part.endedAt ?? part.startedAt }));
          if (!parts.length || parts.some(part => part.chunkCount === 0)) {
            this.meeting.status = "interrupted";
            throw new Error("Die Sitzung enthält noch kein Audio. Bitte fortsetzen oder die Sitzung verwerfen.");
          }
          const input: FinishMeeting = { durationSeconds: meetingDuration(this.meeting), parts };
          await this.api.finishMeeting(this.meeting.id, input); await this.acceptFinished(); return;
        } catch (error) {
          if (this.queueEnvironment.online()) throw error;
          this.emit();
        }
      }
    } catch (error) {
      this.microphone.release("meeting");
      this.emit({ phase: "recovery", error: error instanceof Error ? error.message : "Verarbeitung konnte nicht gestartet werden. Bitte erneut versuchen." });
    } finally { this.finishing = false; }
  }
  private async acceptFinished() {
    this.meeting!.status = "processing"; await this.saveMetadata();
    this.emit({ phase: "processing" }); this.startPolling();
  }
  private waitOnline() {
    if (this.queueEnvironment.online()) return Promise.resolve();
    return new Promise<void>(resolve => {
      const done = () => { remove(); this.cancelOnlineWait = undefined; resolve(); };
      const remove = this.queueEnvironment.onOnline(done);
      this.cancelOnlineWait = done;
    });
  }
  private startPolling() {
    this.cancelPoll?.(); void this.poll(); this.cancelPoll = this.environment.every(() => { void this.poll(); }, 5000);
  }
  private async poll() {
    if (this.polling || !this.meeting || this.disposed) return;
    this.polling = true;
    try {
      const result = await this.api.getMeeting(this.meeting.id);
      if (this.disposed) return;
      if (result.status === "done") {
        await this.store.deleteMeeting(this.meeting.id);
        this.cancelPoll?.(); this.cancelPoll = undefined;
        await this.queue?.dispose(); this.queue = undefined;
        this.emit({ phase: "done", result, error: null });
      } else if (result.status === "error") {
        this.cancelPoll?.(); this.cancelPoll = undefined;
        this.emit({ phase: "error", result, error: result.error ?? "Verarbeitung fehlgeschlagen." });
      } else this.emit({ phase: "processing", result, error: null });
    } catch { this.emit({ error: "Status konnte nicht geladen werden. Nächster Versuch in fünf Sekunden." }); }
    finally { this.polling = false; }
  }
  async retry() {
    if (!this.meeting || this.actionPending || this.snapshot.result?.status !== "error") return;
    this.actionPending = true;
    try { await this.api.retryMeeting(this.meeting.id); this.emit({ phase: "processing", result: null, error: null }); this.startPolling(); }
    catch (error) { this.emit({ error: error instanceof Error ? error.message : "Erneuter Versuch fehlgeschlagen." }); }
    finally { this.actionPending = false; }
  }
  async discard() {
    if (!this.meeting || this.actionPending || this.finishing || this.capture) return;
    const id = this.meeting.id;
    this.actionPending = true;
    try {
      await this.queue?.dispose(); this.queue = undefined;
      await this.api.deleteMeeting(this.meeting.id); await this.store.deleteMeeting(this.meeting.id);
      this.microphone.release("meeting"); this.meeting = null; this.unsaved.clear();
      this.emit({ ...initialMeetingSnapshot, phase: "idle" });
    } catch {
      this.createQueue(await this.store.listChunks(id));
      this.emit({ error: "Sitzung konnte nicht verworfen werden. Bitte erneut versuchen." });
    }
    finally { this.actionPending = false; }
  }
  async reset() {
    if (this.snapshot.phase !== "done") return;
    this.meeting = null; this.emit({ ...initialMeetingSnapshot, phase: "idle" });
    // Show another unfinished recording if this device has more than one.
    await this.initialize();
  }
  async dispose() {
    this.disposed = true; this.cancelOnlineWait?.();
    this.cancelPoll?.(); this.removeVisibility?.();
    await this.closePart().catch(() => undefined); this.cancelTick?.();
    this.microphone.release("meeting"); await this.queue?.dispose();
  }
}

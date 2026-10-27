import type { MeetingStore } from "./meeting-store";
import { chunkKey, type LocalMeeting, type MeetingChunk } from "./meeting-types";

export interface QueueEnvironment {
  online(): boolean;
  onOnline(callback: () => void): () => void;
  onOffline?(callback: () => void): () => void;
  later(callback: () => void, milliseconds: number): () => void;
}
export const browserQueueEnvironment: QueueEnvironment = {
  online: () => navigator.onLine,
  onOnline: callback => { window.addEventListener("online", callback); return () => window.removeEventListener("online", callback); },
  onOffline: callback => { window.addEventListener("offline", callback); return () => window.removeEventListener("offline", callback); },
  later: (callback, milliseconds) => { const timer = window.setTimeout(callback, milliseconds); return () => window.clearTimeout(timer); },
};
export class MeetingUploadQueue {
  private chunks = new Map<string, MeetingChunk>();
  private running?: Promise<void>;
  private cancelRetry?: () => void;
  private failures = 0;
  private disposed = false;
  private removeOnline: () => void;
  private removeOffline?: () => void;
  private waiters: Array<() => void> = [];
  error: string | null = null;
  constructor(private store: MeetingStore, private upload: (chunk: MeetingChunk) => Promise<unknown>,
    private changed: () => void, private environment = browserQueueEnvironment) {
    this.removeOnline = environment.onOnline(() => {
      this.cancelRetry?.(); this.cancelRetry = undefined; this.failures = 0; this.pump(); this.changed();
    });
    this.removeOffline = environment.onOffline?.(changed);
  }
  add(chunk: MeetingChunk) {
    const key = chunkKey(chunk);
    if (!this.chunks.has(key)) this.chunks.set(key, { ...chunk });
    this.pump(); this.changed();
  }
  get total() { return this.chunks.size; }
  get pending() { return [...this.chunks.values()].filter(chunk => !chunk.uploaded).length; }
  get offline() { return !this.environment.online(); }
  securedSeconds(meeting: LocalMeeting) {
    let seconds = 0;
    for (const part of meeting.parts) {
      let end = 0;
      for (let index = 0; index < part.chunkCount; index++) {
        const chunk = this.chunks.get(chunkKey({ meetingId: meeting.id, part: part.part, index }));
        if (!chunk?.uploaded) return seconds + end;
        end = Math.max(end, chunk.endSeconds);
      }
      seconds += end;
    }
    return seconds;
  }
  idle(): Promise<void> { return this.pending ? new Promise(resolve => this.waiters.push(resolve)) : Promise.resolve(); }
  private pump() {
    if (this.disposed || this.running || this.cancelRetry || this.offline) return;
    this.running = this.drain().finally(() => {
      this.running = undefined;
      if (!this.pending) this.waiters.splice(0).forEach(resolve => resolve());
      this.changed();
      if (this.pending) this.pump();
    });
  }
  private async drain() {
    while (!this.disposed && !this.offline) {
      const chunk = [...this.chunks.values()].filter(item => !item.uploaded)
        .sort((a, b) => a.part - b.part || a.index - b.index)[0];
      if (!chunk) return;
      try {
        await this.upload(chunk);
        if (this.disposed) return;
        await this.store.markUploaded(chunk);
        chunk.uploaded = true; this.failures = 0; this.error = null; this.changed();
      } catch (error) {
        if (this.disposed) return;
        this.error = error instanceof Error ? error.message : "Upload fehlgeschlagen.";
        const delay = Math.min(30_000, 1000 * 2 ** Math.min(this.failures++, 5));
        this.cancelRetry = this.environment.later(() => { this.cancelRetry = undefined; this.pump(); }, delay);
        this.changed(); return;
      }
    }
  }
  async dispose() {
    this.disposed = true; this.cancelRetry?.(); this.removeOnline(); this.removeOffline?.(); await this.running;
    this.waiters.splice(0).forEach(resolve => resolve());
  }
}

import { ClaudeProviderError } from "./providers/anthropic.js";
import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, open, rename, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { readJsonFile, withFileLock, writeJsonFile } from "./persistence.js";
import { isProvider, processTranscript } from "./providers/index.js";
import { transcribeMeeting, MeetingTranscriptionError, type ProviderAttempt, type MeetingProvider, type MeetingSegment } from "./providers/meetings.js";
import { defaultPrompts } from "./prompts.js";
import { contextBiasTerms } from "./context-bias.js";
import { applyLexicon, lexiconEntries } from "./lexicon.js";

export const CHUNK_LIMIT_BYTES = 10 * 1024 * 1024;
export const AUDIO_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
export type MeetingStatus = "queued" | "transcribing" | "naming" | "summarizing" | "done" | "error";
export type MeetingPart = {
  part: number;
  chunks: Record<string, number>;
  chunkCount?: number;
  contentType: string;
  startedAt?: string;
  endedAt?: string;
  durationSeconds?: number;
  provider?: MeetingProvider;
  model?: string;
};
// Segment times are seconds relative to their part. `speaker` retains the raw
// provider id; `speakerId` is a stable part-scoped key used by speakerNames.
export type DisplaySegment = MeetingSegment & { part: number; speakerId: string; speakerLabel: string };
export type Meeting = {
  id: string; title: string; source: "recording" | "upload"; language: string;
  participants?: string[];
  createdAt: string; updatedAt: string; finishedAt?: string; transcribedAt?: string; completedAt?: string;
  status: MeetingStatus; progress: number; error?: string;
  providerAttempts?: ProviderAttempt[];
  parts: MeetingPart[]; durationSeconds?: number;
  segments: DisplaySegment[]; speakerNames: Record<string, string>;
  interruptions: Array<{ afterPart: number; start: string; end: string; text: string }>;
  transcript: string; protocol: string;
  provider?: MeetingProvider; model?: string;
  protocolProvider?: string; protocolModel?: string | null; protocolLanguage?: string;
  audioExpiresAt?: string; audioDeletedAt?: string;
  // Persist the phase so restart/retry can reuse a completed transcription.
  job?: "transcribe" | "protocol"; requestedProvider?: MeetingProvider;
};
export type PartMetadata = Pick<MeetingPart, "part"> & Partial<Pick<MeetingPart, "chunkCount" | "contentType" | "startedAt" | "endedAt" | "durationSeconds">>;
export class MeetingError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export function validMeetingId(id: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id);
}
export function validIndex(value: string, minimum: number) {
  return /^(0|[1-9][0-9]{0,5})$/.test(value) && Number(value) >= minimum && Number(value) <= 100000;
}
const extensions: Record<string, string> = {
  "audio/webm": "webm", "video/webm": "webm", "audio/mp4": "m4a", "video/mp4": "mp4",
  "audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/wav": "wav", "audio/x-wav": "wav",
  "audio/ogg": "ogg", "application/ogg": "ogg", "audio/flac": "flac", "audio/x-flac": "flac",
  "audio/aac": "aac", "application/octet-stream": "bin"
};
export function normalizeContentType(value: string): string | undefined {
  const type = value.split(";")[0].trim().toLowerCase();
  return Object.hasOwn(extensions, type) ? type : undefined;
}
function audioName(part: MeetingPart) { return `audio.${extensions[part.contentType] ?? "bin"}`; }
function sniffContentType(buffer: Buffer): string {
  if (buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) return "audio/webm";
  if (buffer.toString("ascii", 4, 8) === "ftyp") return "audio/mp4";
  if (buffer.toString("ascii", 0, 4) === "RIFF") return "audio/wav";
  if (buffer.toString("ascii", 0, 4) === "OggS") return "audio/ogg";
  if (buffer.toString("ascii", 0, 4) === "fLaC") return "audio/flac";
  if (buffer.toString("ascii", 0, 3) === "ID3" || (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0)) return "audio/mpeg";
  return "application/octet-stream";
}
export function renderTranscript(meeting: Meeting) {
  const lines: string[] = [];
  for (const part of meeting.parts) {
    const gap = meeting.interruptions.find(item => item.afterPart === part.part - 1);
    if (gap) lines.push(gap.text);
    let previousSpeaker: string | undefined;
    for (const segment of meeting.segments.filter(item => item.part === part.part)) {
      const name = Object.hasOwn(meeting.speakerNames, segment.speakerId) ? meeting.speakerNames[segment.speakerId] : segment.speakerLabel;
      if (previousSpeaker === segment.speakerId) lines[lines.length - 1] += ` ${segment.text.trim()}`;
      else lines.push(`[${formatTime(segment.start)}] ${name}: ${segment.text.trim()}`);
      previousSpeaker = segment.speakerId;
    }
  }
  return lines.join("\n");
}
function formatTime(seconds: number) {
  return [Math.floor(seconds / 3600), Math.floor(seconds % 3600 / 60), Math.floor(seconds % 60)]
    .map(value => String(value).padStart(2, "0")).join(":");
}
const berlinTime = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

// Use the same provider ordering for transcription and reset so older files need no migration.
function originalSpeakers(segments: Array<MeetingSegment & { part: number }>): DisplaySegment[] {
  const parts = new Map<number, Map<string, string>>();
  return segments.map(segment => {
    let labels = parts.get(segment.part);
    if (!labels) { labels = new Map(); parts.set(segment.part, labels); }
    if (!labels.has(segment.speaker)) labels.set(segment.speaker, `Sprecher ${labels.size + 1}`);
    const label = labels.get(segment.speaker)!;
    return { ...segment, speakerId: `${segment.part}:${segment.speaker}`,
      speakerLabel: segment.part > 1 ? `Teil ${segment.part} · ${label}` : label };
  });
}
function reassignSpeakers(meeting: Meeting, assignments: Record<string, string>) {
  const known = new Map(meeting.segments.map(segment => [segment.speakerId, { part: segment.part, label: segment.speakerLabel }]));
  for (const [index, id] of Object.entries(assignments)) {
    if (!/^(0|[1-9][0-9]*)$/.test(index) || !Number.isSafeInteger(Number(index)) || Number(index) >= meeting.segments.length) {
      throw new MeetingError(400, "Invalid segment index.");
    }
    const segment = meeting.segments[Number(index)];
    const speaker = known.get(id);
    if (speaker) {
      if (speaker.part !== segment.part) throw new MeetingError(400, "Speaker belongs to another part.");
    } else {
      if (!new RegExp(`^${segment.part}:manual-[1-9][0-9]*$`).test(id)) throw new MeetingError(400, "Unknown speaker id.");
      const occupied = new Set([...known.values()].filter(item => item.part === segment.part).map(item => item.label));
      let number = 1;
      const label = () => `${segment.part > 1 ? `Teil ${segment.part} · ` : ""}Sprecher ${number}`;
      while (occupied.has(label())) number++;
      known.set(id, { part: segment.part, label: label() });
    }
  }
  // Validate the whole operation before replacing any assignments; change() writes atomically.
  meeting.segments = meeting.segments.map((segment, index) => {
    const id = Object.hasOwn(assignments, String(index)) ? assignments[String(index)] : segment.speakerId;
    return { ...segment, speakerId: id, speakerLabel: known.get(id)!.label };
  });
}
function saveSpeakerNames(meeting: Meeting, names: Record<string, string>) {
  const known = new Set(meeting.segments.map(segment => segment.speakerId));
  for (const key of Object.keys(names)) if (!known.has(key)) throw new MeetingError(400, "Unknown speaker id.");
  // Equal display names merge speakers without destroying the per-part raw ids.
  meeting.speakerNames = { ...meeting.speakerNames, ...names };
  meeting.transcript = renderTranscript(meeting);
}

export class MeetingService {
  private root: string;
  private pending: string[] = [];
  private scheduled = new Set<string>();
  private active = 0;
  private stopped = false;
  private timer?: ReturnType<typeof setInterval>;
  private idleWaiters: Array<() => void> = [];
  constructor(private dataDir: string) { this.root = join(dataDir, "meetings"); }
  private directory(id: string) {
    if (!validMeetingId(id)) throw new MeetingError(400, "Invalid meeting id.");
    return join(this.root, id);
  }
  private path(id: string) { return join(this.directory(id), "meeting.json"); }
  private partDirectory(id: string, part: number) { return join(this.directory(id), "audio", `part-${part}`); }
  async get(id: string): Promise<Meeting> {
    const meeting = await readJsonFile(this.path(id)) as Meeting | null;
    if (!meeting) throw new MeetingError(404, "Meeting not found.");
    return meeting;
  }
  async list(): Promise<Meeting[]> {
    let entries;
    try { entries = await readdir(this.root, { withFileTypes: true }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
    const meetings: Meeting[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || !validMeetingId(entry.name)) continue;
      try { meetings.push(await this.get(entry.name)); }
      catch (error) { if (!(error instanceof MeetingError && error.status === 404)) throw error; }
    }
    return meetings.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async create(input: Pick<Meeting, "title" | "source" | "language" | "participants">) {
    const id = randomUUID();
    const now = new Date().toISOString();
    const meeting: Meeting = { ...input, id, createdAt: now, updatedAt: now, status: "queued", progress: 0,
      parts: [], segments: [], speakerNames: {}, interruptions: [], transcript: "", protocol: "" };
    await withFileLock(this.path(id), () => writeJsonFile(this.path(id), meeting));
    return id;
  }
  private async change<T>(id: string, change: (meeting: Meeting) => Promise<T> | T): Promise<T> {
    return withFileLock(this.path(id), async () => {
      const meeting = await this.get(id);
      const result = await change(meeting);
      meeting.updatedAt = new Date().toISOString();
      await writeJsonFile(this.path(id), meeting);
      return result;
    });
  }
  async upload(id: string, partNumber: number, n: number, body: Buffer, contentType: string) {
    if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > 100000 || !Number.isInteger(n) || n < 0 || n > 100000) {
      throw new MeetingError(400, "Invalid part or chunk index.");
    }
    if (!body.length || body.length > CHUNK_LIMIT_BYTES) throw new MeetingError(body.length ? 413 : 400, "Invalid chunk size.");
    await this.change(id, async meeting => {
      if (meeting.finishedAt) throw new MeetingError(409, "Meeting already finished.");
      let part = meeting.parts.find(item => item.part === partNumber);
      const currentSize = meeting.parts.reduce((sum, item) => sum + Object.values(item.chunks).reduce((a, b) => a + b, 0), 0);
      if (currentSize - (part?.chunks[n] ?? 0) + body.length > 200 * 1024 * 1024) throw new MeetingError(413, "Meeting audio exceeds 200 MB.");
      if (!part) {
        part = { part: partNumber, chunks: {}, contentType };
        meeting.parts.push(part); meeting.parts.sort((a, b) => a.part - b.part);
      }
      if (part.contentType === "application/octet-stream" && contentType !== "application/octet-stream") part.contentType = contentType;
      const dir = this.partDirectory(id, partNumber);
      await mkdir(dir, { recursive: true });
      const target = join(dir, `chunk-${n}`);
      const handle = await open(`${target}.tmp`, "w");
      try { await handle.writeFile(body); await handle.sync(); } finally { await handle.close(); }
      await rename(`${target}.tmp`, target);
      part.chunks[n] = body.length;
    });
  }
  async finish(id: string, metadata: PartMetadata[], durationSeconds?: number) {
    await this.change(id, meeting => {
      if (meeting.finishedAt) throw new MeetingError(409, "Meeting already finished.");
      for (const meta of metadata) {
        let part = meeting.parts.find(item => item.part === meta.part);
        if (!part) { part = { part: meta.part, chunks: {}, contentType: "application/octet-stream" }; meeting.parts.push(part); }
        for (const key of ["chunkCount", "contentType", "startedAt", "endedAt", "durationSeconds"] as const) {
          if (meta[key] !== undefined) Object.assign(part, { [key]: meta[key] });
        }
      }
      meeting.parts.sort((a, b) => a.part - b.part);
      if (durationSeconds !== undefined && meeting.parts.length === 1 && meeting.parts[0].durationSeconds === undefined) {
        meeting.parts[0].durationSeconds = durationSeconds;
      }
      meeting.durationSeconds = durationSeconds ?? meeting.parts.reduce((sum, part) => sum + partDuration(part), 0);
      meeting.finishedAt = new Date().toISOString(); meeting.status = "queued"; meeting.job = "transcribe";
    });
    this.enqueue(id);
  }
  async retry(id: string, provider?: MeetingProvider) {
    await this.change(id, meeting => {
      if (this.scheduled.has(id) || meeting.status !== "error" || !meeting.finishedAt) throw new MeetingError(409, "Meeting is not retryable.");
      if (meeting.audioDeletedAt && meeting.job !== "protocol") throw new MeetingError(409, "Meeting audio was deleted.");
      if (provider && meeting.job !== "protocol") meeting.requestedProvider = provider;
      meeting.status = "queued"; meeting.progress = 0; delete meeting.error;
    });
    this.enqueue(id);
  }
  async protocol(id: string, speakerNames?: Record<string, string>, protocolLanguage?: string) {
    await this.change(id, meeting => {
      if (this.scheduled.has(id) || !["naming", "done"].includes(meeting.status) || !meeting.segments.length) throw new MeetingError(409, "Meeting transcript is not ready.");
      if (speakerNames) saveSpeakerNames(meeting, speakerNames);
      // An omitted target explicitly restores the meeting language on regeneration.
      if (protocolLanguage === undefined) delete meeting.protocolLanguage;
      else meeting.protocolLanguage = protocolLanguage;
      meeting.job = "protocol"; meeting.status = "queued"; meeting.progress = 0; delete meeting.error;
    });
    this.enqueue(id);
  }
  async patch(id: string, input: { title?: string; speakerNames?: Record<string, string>; participants?: string[]; segmentSpeakers?: Record<string, string>; resetSpeakers?: true }) {
    return this.change(id, meeting => {
      if (input.segmentSpeakers !== undefined || input.resetSpeakers) {
        if (this.scheduled.has(id) || !["naming", "done"].includes(meeting.status)) throw new MeetingError(409, "Meeting transcript is not ready.");
        if (input.resetSpeakers && input.segmentSpeakers !== undefined) throw new MeetingError(400, "Conflicting speaker changes.");
        if (input.resetSpeakers) meeting.segments = originalSpeakers(meeting.segments);
        else reassignSpeakers(meeting, input.segmentSpeakers!);
        meeting.transcript = renderTranscript(meeting);
      }
      if (input.title !== undefined) meeting.title = input.title;
      if (input.participants !== undefined) {
        if (this.scheduled.has(id)) throw new MeetingError(409, "Meeting is still processing.");
        meeting.participants = input.participants;
      }
      if (input.speakerNames) {
        if (this.scheduled.has(id)) throw new MeetingError(409, "Meeting is still processing.");
        saveSpeakerNames(meeting, input.speakerNames);
      }
      return meeting;
    });
  }
  async delete(id: string) {
    await withFileLock(this.path(id), async () => {
      await this.get(id);
      await rm(this.directory(id), { recursive: true, force: true });
    });
  }
  async deleteAudio(id: string) {
    await this.change(id, async meeting => {
      if (this.scheduled.has(id) || !["naming", "done", "error"].includes(meeting.status)) throw new MeetingError(409, "Meeting is still processing.");
      await this.removeAudio(meeting);
    });
  }
  private async removeAudio(meeting: Meeting) {
    await rm(join(this.directory(meeting.id), "audio"), { recursive: true, force: true });
    meeting.audioDeletedAt ??= new Date().toISOString();
  }
  async audio(id: string, partNumber: number) {
    return withFileLock(this.path(id), async () => {
      const meeting = await this.get(id);
      const part = meeting.parts.find(item => item.part === partNumber);
      if (meeting.audioDeletedAt || !part) throw new MeetingError(404, "Meeting audio not found.");
      const path = join(this.partDirectory(id, partNumber), audioName(part));
      try { await stat(path); } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new MeetingError(404, "Meeting audio not found.");
        throw error;
      }
      return { path, contentType: part.contentType };
    });
  }
  async cleanup(now = Date.now()) {
    for (const meeting of await this.list()) {
      if (!meeting.audioDeletedAt && meeting.audioExpiresAt && Date.parse(meeting.audioExpiresAt) <= now && (!this.scheduled.has(meeting.id) || meeting.job === "protocol")) {
        await this.change(meeting.id, async current => {
          if ((!this.scheduled.has(current.id) || current.job === "protocol") && !current.audioDeletedAt && current.audioExpiresAt && Date.parse(current.audioExpiresAt) <= now) await this.removeAudio(current);
        });
      }
    }
  }
  private async extendAudioRetention() {
    for (const meeting of await this.list()) {
      if (meeting.audioDeletedAt || !meeting.transcribedAt) continue;
      const minimum = Date.parse(meeting.transcribedAt) + AUDIO_RETENTION_MS;
      if (!Number.isFinite(minimum) || meeting.audioExpiresAt && Date.parse(meeting.audioExpiresAt) >= minimum) continue;
      await withFileLock(this.path(meeting.id), async () => {
        const current = await this.get(meeting.id);
        if (current.audioDeletedAt || !current.transcribedAt) return;
        const expires = Date.parse(current.transcribedAt) + AUDIO_RETENTION_MS;
        if (!Number.isFinite(expires) || current.audioExpiresAt && Date.parse(current.audioExpiresAt) >= expires) return;
        for (const part of current.parts) {
          try {
            if (!(await stat(join(this.partDirectory(current.id, part.part), audioName(part)))).isFile()) continue;
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
            throw error;
          }
          current.audioExpiresAt = new Date(expires).toISOString();
          current.updatedAt = new Date().toISOString();
          await writeJsonFile(this.path(current.id), current);
          break;
        }
      });
    }
  }
  async start(options: { resume: boolean; retentionTimer: boolean }) {
    if (options.resume || options.retentionTimer) {
      // Extend surviving audio before cleanup can apply its previous 24-hour expiry.
      await this.extendAudioRetention();
      await this.cleanup();
    }
    if (options.resume) {
      for (const meeting of await this.list()) {
        if (meeting.finishedAt && ["queued", "transcribing", "summarizing"].includes(meeting.status)) {
          await this.change(meeting.id, current => {
            current.job ??= current.status === "summarizing" ? "protocol" : "transcribe";
            current.status = "queued"; delete current.error;
          });
          this.enqueue(meeting.id);
        }
      }
    }
    if (options.retentionTimer) {
      this.timer = setInterval(() => { void this.cleanup().catch(() => console.error("Meeting audio cleanup failed.")); }, 60 * 60 * 1000);
      this.timer.unref();
    }
  }
  async dispose() {
    this.stopped = true; if (this.timer) clearInterval(this.timer);
    this.pending = []; // Persisted queued jobs remain available to the next process.
    await this.idle();
  }
  idle(): Promise<void> {
    return this.active === 0 && this.pending.length === 0 ? Promise.resolve() : new Promise(resolve => this.idleWaiters.push(resolve));
  }
  private enqueue(id: string) {
    if (this.stopped || this.scheduled.has(id)) return;
    this.scheduled.add(id); this.pending.push(id); this.pump();
  }
  private pump() {
    while (!this.stopped && this.active < 2 && this.pending.length) {
      const id = this.pending.shift()!; this.active++;
      void this.run(id).catch(() => console.error("Failed to persist meeting job error.")).finally(() => {
        this.active--; this.scheduled.delete(id); this.pump();
      });
    }
    if (!this.active && !this.pending.length) this.idleWaiters.splice(0).forEach(resolve => resolve());
  }
  private async concatenate(id: string) {
    await this.change(id, async meeting => {
      if (!meeting.parts.length) throw new MeetingError(400, "missing chunk: part 1 [0]");
      const partNumbers = new Set(meeting.parts.map(part => part.part));
      const missingParts = Array.from({ length: meeting.parts.at(-1)!.part }, (_, i) => i + 1).filter(n => !partNumbers.has(n));
      if (missingParts.length) throw new MeetingError(400, `missing chunk: missing parts [${missingParts.join(", ")}]`);
      for (const part of meeting.parts) {
        const dir = this.partDirectory(id, part.part);
        let files: string[] = [];
        try { files = await readdir(dir); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
        const indices = files.filter(file => /^chunk-(0|[1-9][0-9]*)$/.test(file)).map(file => Number(file.slice(6)));
        const count = part.chunkCount ?? (indices.length ? Math.max(...indices) + 1 : 1);
        const present = new Set(indices);
        const missing = Array.from({ length: count }, (_, n) => n).filter(n => !present.has(n));
        if (missing.length) throw new MeetingError(400, `missing chunk: part ${part.part} [${missing.join(", ")}]`);
        if (indices.some(n => n >= count)) throw new MeetingError(400, "Chunk count does not match uploaded indices.");
        if (part.contentType === "application/octet-stream") part.contentType = sniffContentType(await readFile(join(dir, "chunk-0")));
        const target = join(dir, audioName(part));
        const output = await open(`${target}.tmp`, "w");
        try {
          for (let n = 0; n < count; n++) await output.writeFile(await readFile(join(dir, `chunk-${n}`)));
          await output.sync();
        } finally { await output.close(); }
        await rename(`${target}.tmp`, target);
      }
    });
  }
  private async run(id: string) {
    let phase: "transcribe" | "protocol" = "transcribe";
    try {
      let meeting = await this.get(id); phase = meeting.job ?? "transcribe";
      if (phase === "transcribe") {
        await this.concatenate(id);
        await this.change(id, current => { current.status = "transcribing"; current.progress = 0; current.segments = []; current.interruptions = []; current.providerAttempts = []; });
        meeting = await this.get(id);
        const settings = await this.settings();
        const lexicon = lexiconEntries(settings.lexicon);
        const contextBias = contextBiasTerms([...lexicon.map(entry => entry.correct), ...(meeting.participants ?? [])]);
        for (let i = 0; i < meeting.parts.length; i++) {
          const part = meeting.parts[i];
          const result = await transcribeMeeting(join(this.partDirectory(id, part.part), audioName(part)), {
            language: meeting.language, contextBias, durationSeconds: partDuration(part) || (meeting.parts.length === 1 ? meeting.durationSeconds : undefined),
            contentType: part.contentType,
            meetingFallback: settings.meetingFallback === true,
            provider: meeting.requestedProvider ?? (settings.providers?.meetings === "assemblyai" ? "assemblyai" : "mistral")
          });
          const segments = originalSpeakers(result.segments.map(segment => ({
            ...segment, text: applyLexicon(segment.text, lexicon).trim(), part: part.part
          })));
          await this.change(id, current => {
            current.providerAttempts ??= [];
            current.providerAttempts.push(...(result.attempts ?? []));
            current.segments.push(...segments); current.provider = result.provider; current.model = result.model;
            const storedPart = current.parts.find(item => item.part === part.part)!;
            storedPart.provider = result.provider; storedPart.model = result.model;
            storedPart.durationSeconds = partDuration(part) || Math.max(...result.segments.map(segment => segment.end));
            current.progress = Math.round((i + 1) / meeting.parts.length * 100);
          });
        }
        await this.change(id, current => {
          current.interruptions = current.parts.slice(1).flatMap((part, i) => {
            const before = current.parts[i];
            if (!before.endedAt || !part.startedAt || Date.parse(part.startedAt) <= Date.parse(before.endedAt)) return [];
            return [{ afterPart: before.part, start: before.endedAt, end: part.startedAt,
              text: `[Unterbrechung ${berlinTime.format(new Date(before.endedAt))}–${berlinTime.format(new Date(part.startedAt))}]` }];
          });
          current.durationSeconds = current.parts.reduce((sum, part) => sum + partDuration(part), 0);
          current.transcript = renderTranscript(current); current.job = "protocol";
          current.status = "naming"; current.progress = 100;
          current.transcribedAt = new Date().toISOString();
          current.audioExpiresAt = new Date(Date.parse(current.transcribedAt) + AUDIO_RETENTION_MS).toISOString();
          delete current.error;
        });
        return;
      }
      phase = "protocol";
      await this.change(id, current => { current.status = "summarizing"; current.progress = 85; });
      meeting = await this.get(id);
      const settings = await this.settings();
      const task = meeting.source === "recording" ? "protocol" : "summary";
      const provider = settings.providers?.[task] ?? "mistral";
      if (!isProvider(provider)) throw new Error("Invalid protocol provider.");
      const transcript = [meeting.participants?.length ? `Teilnehmende: ${meeting.participants.join(", ")}` : "", renderTranscript(meeting)].filter(Boolean).join("\n\n");
      let instructions = typeof settings.prompts?.[task] === "string" ? settings.prompts[task] : defaultPrompts[task];
      if (meeting.protocolLanguage && meeting.protocolLanguage !== "auto" && meeting.protocolLanguage !== meeting.language) {
        const language = new Intl.DisplayNames(["de"], { type: "language" }).of(meeting.protocolLanguage) ?? meeting.protocolLanguage;
        instructions += `\n\nSchreibe ${task === "protocol" ? "das gesamte Protokoll" : "die gesamte Zusammenfassung"} auf ${language}. Übersetze auch Zitate. Namen, Firmen- und Produktnamen sowie Lexikon-Begriffe bleiben unverändert.`;
      }
      const result = await processTranscript(provider, { transcript, mode: "formal", task, instructions });
      await this.change(id, current => {
        current.protocol = result.text; current.protocolProvider = result.provider; current.protocolModel = result.model;
        current.status = "done"; current.progress = 100; current.completedAt = new Date().toISOString();
        // Regenerating a protocol must not extend the original audio retention window.
        if (!current.audioDeletedAt) current.audioExpiresAt ??= new Date(Date.now() + AUDIO_RETENTION_MS).toISOString();
        delete current.error;
      });
    } catch (error) {
      try {
        await this.change(id, current => {
          current.status = "error";
          if (error instanceof MeetingTranscriptionError) {
            current.providerAttempts ??= [];
            current.providerAttempts.push(...error.attempts);
          }
          current.error = error instanceof MeetingTranscriptionError ? error.message : error instanceof MeetingError || error instanceof ClaudeProviderError ? error.message : phase === "transcribe" ? "Meeting transcription failed." : "Meeting protocol generation failed.";
        });
      } catch (failure) { if (!(failure instanceof MeetingError && failure.status === 404)) throw failure; }
    }
  }
  private async settings(): Promise<{ providers?: Record<string, unknown>; prompts?: Record<string, unknown>; lexicon?: unknown[]; meetingFallback?: boolean }> {
    const settings = await readJsonFile(join(this.dataDir, "settings.json"));
    if (settings !== null && !isRecord(settings)) throw new Error("Invalid settings file.");
    if (!settings) return {};
    if (settings.providers !== undefined && !isRecord(settings.providers) || settings.prompts !== undefined && !isRecord(settings.prompts)) throw new Error("Invalid settings file.");
    return { providers: settings.providers, prompts: settings.prompts, lexicon: Array.isArray(settings.lexicon) ? settings.lexicon : [], meetingFallback: settings.meetingFallback === true };
  }
}
function partDuration(part: MeetingPart): number {
  return part.durationSeconds ?? (part.startedAt && part.endedAt ? (Date.parse(part.endedAt) - Date.parse(part.startedAt)) / 1000 : 0);
}
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

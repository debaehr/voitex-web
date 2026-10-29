export type MeetingStatus = "queued" | "transcribing" | "naming" | "summarizing" | "done" | "error";
export interface MeetingResult {
  id: string; title: string; language: string; status: MeetingStatus; progress: number;
  finishedAt?: string; error?: string; protocol: string;
}
export interface MeetingPart {
  part: number; chunkCount: number; contentType: string; startedAt: string;
  endedAt?: string; lastChunkAt?: string; durationSeconds: number;
}
export interface FinishMeeting {
  durationSeconds?: number;
  parts: Array<Pick<MeetingPart, "part" | "chunkCount" | "contentType"> & Partial<MeetingPart>>;
}
export interface LocalMeeting {
  id: string; title: string; language: string;
  status: "recording" | "paused" | "interrupted" | "finishing" | "processing";
  // Optional for recovery records created before computer audio was supported.
  systemAudio?: boolean;
  parts: MeetingPart[];
}
export interface MeetingChunk {
  meetingId: string; part: number; index: number; blob: Blob; contentType: string;
  endSeconds: number; uploaded: boolean;
}
export interface MeetingApi {
  createMeeting(input: { title?: string; source: "recording" | "upload"; language: string; participants?: string[] }): Promise<{ id: string }>;
  putMeetingChunk(chunk: MeetingChunk): Promise<unknown>;
  finishMeeting(id: string, input: FinishMeeting): Promise<unknown>;
  getMeeting(id: string): Promise<MeetingResult>;
  retryMeeting(id: string): Promise<unknown>;
  deleteMeeting(id: string): Promise<unknown>;
}
export const meetingDuration = (meeting: LocalMeeting) => meeting.parts.reduce((sum, part) => sum + part.durationSeconds, 0);
export const chunkKey = (chunk: Pick<MeetingChunk, "meetingId" | "part" | "index">) => `${chunk.meetingId}:${chunk.part}:${chunk.index}`;
export function meetingClock(seconds: number) {
  return [Math.floor(seconds / 3600), Math.floor(seconds % 3600 / 60), Math.floor(seconds % 60)]
    .map(value => String(value).padStart(2, "0")).join(":");
}

export type MeetingProvider = "mistral" | "assemblyai";
export interface MeetingSummary extends Omit<MeetingResult, "protocol"> {
  source: "recording" | "upload"; createdAt: string; durationSeconds?: number;
  provider?: MeetingProvider; model?: string; audioExpiresAt?: string; audioDeletedAt?: string;
}
export interface MeetingSegment {
  speakerId: string; speakerLabel: string; part: number; start: number; end: number; text: string;
}
export interface MeetingDetailData extends MeetingSummary {
  protocol: string; transcript: string; participants?: string[]; speakerNames: Record<string, string>;
  segments: MeetingSegment[]; parts: Array<{ part: number; contentType: string; durationSeconds?: number }>;
  interruptions: Array<{ afterPart: number; start: string; end: string; text: string }>;
  protocolLanguage?: string; protocolProvider?: string; protocolModel?: string | null;
  transcribedAt?: string; providerAttempts?: Array<{ provider: MeetingProvider; ok: boolean; reason?: string }>;
}

import { meetingRequest } from "./meeting-http.js";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { transcribeMeeting as transcribeAssemblyAI } from "./assemblyai.js";

export type MeetingProvider = "mistral" | "assemblyai";
export type MeetingSegment = { speaker: string; start: number; end: number; text: string };
export type MeetingTranscription = { provider: MeetingProvider; model: string; segments: MeetingSegment[] };
export type MeetingTranscriptionOptions = {
  language?: string;
  contextBias?: string[];
  durationSeconds?: number;
  provider?: MeetingProvider;
  contentType?: string;
};
export function isMeetingProvider(value: unknown): value is MeetingProvider {
  return value === "mistral" || value === "assemblyai";
}
export function availableMeetingProviders(): MeetingProvider[] {
  return (["mistral", "assemblyai"] as const).filter(name => Boolean(process.env[`${name.toUpperCase()}_API_KEY`]?.trim()));
}

export async function transcribeMeeting(filePath: string, options: MeetingTranscriptionOptions = {}): Promise<MeetingTranscription> {
  const preferred = options.provider ?? "mistral";
  const order: MeetingProvider[] = preferred === "assemblyai" ? ["assemblyai", "mistral"] : ["mistral", "assemblyai"];
  for (const provider of order) {
    // Voxtral accepts at most three hours per request, including as a fallback.
    if (provider === "mistral" && (options.durationSeconds ?? 0) > 3 * 60 * 60) continue;
    if (!availableMeetingProviders().includes(provider)) continue;
    try {
      const result = provider === "mistral" ? await transcribeMistral(filePath, options) : await transcribeAssemblyAI(filePath, options);
      if (!result.segments.length || !result.segments.every(segment =>
        typeof segment.speaker === "string" && typeof segment.text === "string" &&
        Number.isFinite(segment.start) && Number.isFinite(segment.end) && segment.start >= 0 && segment.end >= segment.start)) {
        throw new Error("Invalid meeting transcription response.");
      }
      return result;
    } catch {
      // Provider bodies can contain credentials. Only a stable public reason leaves this boundary.
    }
  }
  throw new Error("Meeting transcription failed: no available provider succeeded.");
}

async function transcribeMistral(filePath: string, options: MeetingTranscriptionOptions): Promise<MeetingTranscription> {
  const model = process.env.MISTRAL_MEETING_MODEL?.trim() || "voxtral-mini-transcribe-3";
  const form = new FormData();
  form.append("file", new Blob([await readFile(filePath)], { type: options.contentType || "application/octet-stream" }), basename(filePath));
  form.append("model", model);
  form.append("diarize", "true");
  form.append("timestamp_granularities", "segment");
  if (options.language && options.language !== "auto") form.append("language", options.language);
  for (const term of [...new Set((options.contextBias ?? []).map(term => term.trim()).filter(Boolean))].slice(0, 100)) {
    form.append("context_bias", term);
  }
  const response = await meetingRequest("https://api.mistral.ai/v1/audio/transcriptions", {
    method: "POST", headers: { Authorization: `Bearer ${process.env.MISTRAL_API_KEY}` },
    body: form, signal: AbortSignal.timeout(30 * 60 * 1000)
  });
  if (!response.ok) throw new Error("Mistral transcription failed.");
  const result = await response.json() as { segments: Array<{ speaker_id: string | number; start: number; end: number; text: string }> };
  return { provider: "mistral", model, segments: result.segments.map(segment => ({
    speaker: String(segment.speaker_id ?? "unknown"), start: segment.start, end: segment.end, text: segment.text
  })) };
}

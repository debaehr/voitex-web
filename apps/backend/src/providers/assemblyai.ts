import { httpProviderError, providerError, ProviderDiagnosticError } from "./meeting-diagnostics.js";
import { meetingRequest } from "./meeting-http.js";
import { readFile } from "node:fs/promises";
import type { MeetingTranscription, MeetingTranscriptionOptions } from "./meetings.js";
import { contextBiasTerms } from "../context-bias.js";

type TranscriptResponse = {
  id: string;
  status: "queued" | "processing" | "completed" | "error";
  text?: string;
  utterances?: Array<{ speaker: string; text: string; start: number; end: number }>;
};
const baseUrl = "https://api.assemblyai.com";

export async function transcribeMeeting(filePath: string, options: MeetingTranscriptionOptions): Promise<MeetingTranscription> {
  const apiKey = process.env.ASSEMBLYAI_API_KEY;
  if (!apiKey?.trim()) throw new Error("AssemblyAI is not configured.");
  const model = process.env.ASSEMBLYAI_MEETING_MODEL?.trim() || "universal-3-5-pro";
  const uploadUrl = await uploadAudio(apiKey, await readFile(filePath), options.contentType);
  const transcriptId = await createTranscript(apiKey, uploadUrl, model, options);
  const transcript = await pollTranscript(apiKey, transcriptId);
  return {
    provider: "assemblyai", model,
    // AssemblyAI timestamps are milliseconds; the public meeting contract uses seconds.
    segments: transcript.utterances?.length ? transcript.utterances.map(item => ({
      speaker: String(item.speaker), text: item.text, start: item.start / 1000, end: item.end / 1000
    })) : transcript.text?.trim() ? [{ speaker: "unknown", text: transcript.text, start: 0, end: options.durationSeconds ?? 0 }] : []
  };
}

async function uploadAudio(apiKey: string, buffer: Buffer, contentType?: string) {
  const response = await meetingRequest(`${baseUrl}/v2/upload`, {
    method: "POST", headers: { Authorization: apiKey, "Content-Type": contentType || "application/octet-stream" },
    body: buffer, signal: AbortSignal.timeout(30 * 60 * 1000)
  });
  if (!response.ok) throw await httpProviderError("AssemblyAI", response);
  return (await response.json() as { upload_url: string }).upload_url;
}
async function createTranscript(apiKey: string, audioUrl: string, model: string, options: MeetingTranscriptionOptions) {
  const language = options.language;
  // Confirmed for these models; do not guess support for arbitrary model overrides.
  // https://www.assemblyai.com/docs/pre-recorded-audio/api-reference/transcripts/submit
  // HTTP 400: "keyterms_prompt is only supported for the following languages when using universal-2 speech_model: en, en_au, en_uk, en_us".
  const supportsKeyterms = model === "universal-3-5-pro" || (model === "universal-2" && ["en", "en_au", "en_uk", "en_us"].includes(language ?? ""));
  const terms = supportsKeyterms
    ? contextBiasTerms(options.contextBias ?? []).filter(term => term.split(/\s+/).length <= 6) : [];
  const response = await meetingRequest(`${baseUrl}/v2/transcript`, {
    method: "POST", headers: { Authorization: apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      audio_url: audioUrl, speech_models: [model], speaker_labels: true, disfluencies: false,
      ...(terms.length ? { keyterms_prompt: terms } : {}),
      ...(language && language !== "auto" ? { language_code: language } : { language_detection: true })
    }), signal: AbortSignal.timeout(60 * 1000)
  });
  if (!response.ok) throw await httpProviderError("AssemblyAI", response);
  return (await response.json() as TranscriptResponse).id;
}
async function pollTranscript(apiKey: string, transcriptId: string) {
  const deadline = Date.now() + 3 * 60 * 60 * 1000;
  while (Date.now() < deadline) {
    const response = await meetingRequest(`${baseUrl}/v2/transcript/${encodeURIComponent(transcriptId)}`, {
      headers: { Authorization: apiKey }, signal: AbortSignal.timeout(Math.min(60 * 1000, Math.max(1, deadline - Date.now())))
    });
    if (!response.ok) throw await httpProviderError("AssemblyAI", response);
    const data = await response.json() as TranscriptResponse;
    if (data.status === "completed") return data;
    if (data.status === "error") throw providerError("AssemblyAI", response.status, data);
    await new Promise(resolve => setTimeout(resolve, Math.min(3000, Math.max(0, deadline - Date.now()))));
  }
  throw new ProviderDiagnosticError("AssemblyAI: transcription timed out");
}

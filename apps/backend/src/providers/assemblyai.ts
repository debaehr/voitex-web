import { meetingRequest } from "./meeting-http.js";
import { readFile } from "node:fs/promises";
import type { MeetingTranscription, MeetingTranscriptionOptions } from "./meetings.js";

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
  const model = process.env.ASSEMBLYAI_MEETING_MODEL?.trim() || "universal-2";
  const uploadUrl = await uploadAudio(apiKey, await readFile(filePath), options.contentType);
  const transcriptId = await createTranscript(apiKey, uploadUrl, model, options.language);
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
  if (!response.ok) throw new Error("AssemblyAI upload failed.");
  return (await response.json() as { upload_url: string }).upload_url;
}
async function createTranscript(apiKey: string, audioUrl: string, model: string, language?: string) {
  const response = await meetingRequest(`${baseUrl}/v2/transcript`, {
    method: "POST", headers: { Authorization: apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      audio_url: audioUrl, speech_models: [model], speaker_labels: true, disfluencies: false,
      ...(language && language !== "auto" ? { language_code: language } : { language_detection: true })
    }), signal: AbortSignal.timeout(60 * 1000)
  });
  if (!response.ok) throw new Error("AssemblyAI transcription failed.");
  return (await response.json() as TranscriptResponse).id;
}
async function pollTranscript(apiKey: string, transcriptId: string) {
  const deadline = Date.now() + 3 * 60 * 60 * 1000;
  while (Date.now() < deadline) {
    const response = await meetingRequest(`${baseUrl}/v2/transcript/${encodeURIComponent(transcriptId)}`, {
      headers: { Authorization: apiKey }, signal: AbortSignal.timeout(Math.min(60 * 1000, Math.max(1, deadline - Date.now())))
    });
    if (!response.ok) throw new Error("AssemblyAI polling failed.");
    const data = await response.json() as TranscriptResponse;
    if (data.status === "completed") return data;
    if (data.status === "error") throw new Error("AssemblyAI transcription failed.");
    await new Promise(resolve => setTimeout(resolve, Math.min(3000, Math.max(0, deadline - Date.now()))));
  }
  throw new Error("AssemblyAI transcription timed out.");
}

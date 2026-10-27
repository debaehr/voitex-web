import { api } from "./api";
import type { MeetingApi } from "./meeting-types";
export const MEETING_SLICE_BYTES = 5 * 1024 * 1024;
export const MEETING_MAX_BYTES = 200 * 1024 * 1024;
const formats: Record<string, string> = { mp3: "audio/mpeg", m4a: "audio/mp4", mp4: "video/mp4", wav: "audio/wav", webm: "audio/webm", ogg: "audio/ogg", flac: "audio/flac" };
export function validateMeetingFile(file: Pick<File, "name" | "size" | "type">): string {
  const extension = file.name.split(".").at(-1)?.toLowerCase() ?? "";
  if (!formats[extension]) throw new Error("Bitte MP3, M4A, MP4, WAV, WebM, OGG oder FLAC auswählen.");
  if (!file.size) throw new Error("Die Datei ist leer. Bitte eine Audiodatei auswählen.");
  if (file.size > MEETING_MAX_BYTES) throw new Error("Die Datei ist größer als 200 MB. Bitte eine kleinere Datei auswählen.");
  return file.type || formats[extension];
}
export function readMeetingDuration(file: File): Promise<number | undefined> {
  return new Promise(resolve => {
    const audio = document.createElement("audio");
    const url = URL.createObjectURL(file);
    const done = () => {
      const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : undefined;
      clearTimeout(timer); audio.onloadedmetadata = null; audio.onerror = null;
      audio.removeAttribute("src"); audio.load(); URL.revokeObjectURL(url); resolve(duration);
    };
    const timer = setTimeout(done, 4000);
    audio.preload = "metadata"; audio.onloadedmetadata = done; audio.onerror = done; audio.src = url;
  });
}
interface UploadInput { title: string; language: string; participants: string[]; durationSeconds?: number }
export async function uploadMeetingFile(file: File, input: UploadInput, onProgress: (percent: number) => void,
  client: Pick<MeetingApi, "createMeeting" | "putMeetingChunk" | "finishMeeting"> = api,
  wait: (ms: number) => Promise<void> = ms => new Promise(resolve => setTimeout(resolve, ms))) {
  const contentType = validateMeetingFile(file);
  const { durationSeconds, ...metadata } = input;
  const { id } = await client.createMeeting({ ...metadata, source: "upload" });
  onProgress(0);
  const chunkCount = Math.ceil(file.size / MEETING_SLICE_BYTES);
  for (let index = 0; index < chunkCount; index++) {
    const start = index * MEETING_SLICE_BYTES;
    const blob = file.slice(start, start + MEETING_SLICE_BYTES, contentType);
    for (let attempt = 0; ; attempt++) {
      try {
        await client.putMeetingChunk({ meetingId: id, part: 1, index, blob, contentType, endSeconds: 0, uploaded: false }); break;
      } catch (error) { if (attempt >= 2) throw error; await wait(1000 * (attempt + 1)); }
    }
    onProgress(Math.floor(Math.min(file.size, start + blob.size) / file.size * 100));
  }
  await client.finishMeeting(id, { ...(durationSeconds !== undefined ? { durationSeconds } : {}), parts: [{ part: 1, chunkCount, contentType }] });
  return id;
}

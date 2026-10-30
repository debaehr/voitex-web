import type { ProcessingRequest, TranscriptionRequest, TranslationRequest } from "./dictation";
import type { HistoryEntry, ModelSelection, ProviderCheckResult, Providers, Settings } from "./types";
import type { FinishMeeting, MeetingChunk, MeetingDetailData, MeetingSummary, MeetingProvider } from "./meeting-types";
export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, init);
  } catch {
    throw new Error("Verbindung zum Server fehlgeschlagen.");
  }
  if (!response.ok) {
    let message = "Anfrage fehlgeschlagen. Bitte erneut versuchen.";
    try {
      const body: unknown = await response.json();
      if (
        body &&
        typeof body === "object" &&
        "error" in body &&
        typeof body.error === "string" &&
        body.error.trim()
      )
        message = body.error;
    } catch {
      /* Proxies may return HTML instead of JSON. */
    }
    throw new ApiError(message, response.status);
  }
  if (response.status === 204) return undefined as T;
  try {
    return (await response.json()) as T;
  } catch {
    throw new Error("Ungültige Antwort vom Server.");
  }
}
const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
async function meetingRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  // AbortSignal.timeout is missing on older Safari versions that can still record MP4.
  const timer = globalThis.setTimeout(() => controller.abort(), 60_000);
  try { return await request<T>(path, { ...init, signal: controller.signal }); }
  finally { globalThis.clearTimeout(timer); }
}
export const api = {
  createMeeting: (input: { title?: string; source: "recording" | "upload"; language: string; participants?: string[] }) =>
    meetingRequest<{ id: string }>("/meetings", json("POST", input)),
  putMeetingChunk: (chunk: MeetingChunk) => meetingRequest<{ ok: true }>(
    `/meetings/${encodeURIComponent(chunk.meetingId)}/parts/${chunk.part}/chunks/${chunk.index}`,
    { method: "PUT", headers: { "Content-Type": chunk.contentType }, body: chunk.blob }),
  finishMeeting: (id: string, input: FinishMeeting) => meetingRequest(`/meetings/${encodeURIComponent(id)}/finish`, json("POST", input)),
  getMeeting: (id: string) => meetingRequest<MeetingDetailData>(`/meetings/${encodeURIComponent(id)}`),
  listMeetings: () => meetingRequest<MeetingSummary[]>("/meetings"),
  patchMeeting: (id: string, input: { title?: string; speakerNames?: Record<string, string>; segmentSpeakers?: Record<string, string>; resetSpeakers?: true }) =>
    meetingRequest<MeetingDetailData>(`/meetings/${encodeURIComponent(id)}`, json("PATCH", input)),
  protocolMeeting: (id: string, speakerNames?: Record<string, string>, protocolLanguage?: string) =>
    meetingRequest(`/meetings/${encodeURIComponent(id)}/protocol`, speakerNames === undefined && !protocolLanguage ? { method: "POST" } : json("POST", {
      ...(speakerNames === undefined ? {} : { speakerNames }), ...(protocolLanguage ? { protocolLanguage } : {})
    })),
  deleteMeetingAudio: (id: string) => meetingRequest(`/meetings/${encodeURIComponent(id)}/audio`, { method: "DELETE" }),
  retryMeeting: (id: string, provider?: MeetingProvider) => meetingRequest(`/meetings/${encodeURIComponent(id)}/retry`, json("POST", provider ? { provider } : {})),
  deleteMeeting: async (id: string) => {
    try { await meetingRequest(`/meetings/${encodeURIComponent(id)}`, { method: "DELETE" }); }
    catch (error) { if (!(error instanceof ApiError && error.status === 404)) throw error; }
  },
  transcribe: (input: TranscriptionRequest) => {
    const form = new FormData();
    const extension = input.audio.type.includes("mp4") ? "mp4" : input.audio.type.includes("ogg") ? "ogg" : "webm";
    form.append("audio", input.audio, `recording.${extension}`);
    form.append("provider", input.provider);
    form.append("mode", input.mode);
    form.append("language", input.language);
    if (input.model) form.append("model", input.model);
    if (input.fallback !== undefined) form.append("fallback", JSON.stringify(input.fallback));
    if (input.prompt) form.append("prompt", input.prompt);
    return request<{ transcript: string; provider: string; model: string | null }>("/transcribe", { method: "POST", body: form });
  },
  process: (input: ProcessingRequest) =>
    request<{ processed: string; provider: string; model: string | null }>("/process", json("POST", input)),
  translate: (input: TranslationRequest) =>
    request<{ translated: string; provider: string; model: string | null }>("/translate", json("POST", input)),
  checkProviders: (checks: ModelSelection[]) => request<{ results: ProviderCheckResult[] }>("/providers/check", json("POST", { checks })),
  getProviders: () => request<Providers>("/providers"),
  getDefaults: () => request<Settings>("/settings/defaults"),
  getSettings: () => request<Partial<Settings>>("/settings"),
  saveSettings: (settings: Settings) =>
    request<{ ok: true }>("/settings", json("PUT", settings)),
  getHistory: () => request<HistoryEntry[]>("/history"),
  addHistory: (entry: HistoryEntry) =>
    request<{ ok: true }>("/history", json("POST", entry)),
  deleteHistory: (id: string) =>
    request<{ ok: true }>(`/history/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
  clearHistory: () => request<{ ok: true }>("/history", { method: "DELETE" }),
};

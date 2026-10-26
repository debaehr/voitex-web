import type { ProcessingRequest, TranscriptionRequest } from "./dictation";
import type { HistoryEntry, Providers, Settings } from "./types";
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
    throw new Error(message);
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
export const api = {
  transcribe: (input: TranscriptionRequest) => {
    const form = new FormData();
    const extension = input.audio.type.includes("mp4") ? "mp4" : input.audio.type.includes("ogg") ? "ogg" : "webm";
    form.append("audio", input.audio, `recording.${extension}`);
    form.append("provider", input.provider);
    form.append("mode", input.mode);
    form.append("language", input.language);
    if (input.prompt) form.append("prompt", input.prompt);
    return request<{ transcript: string; provider: string }>("/transcribe", { method: "POST", body: form });
  },
  process: (input: ProcessingRequest) =>
    request<{ processed: string; provider: string }>("/process", json("POST", input)),
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

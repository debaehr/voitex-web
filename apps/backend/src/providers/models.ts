import type { ProviderId } from "./key-status.js";

export type ModelTask = "stt" | "chat" | "meetings";
export type ModelOption = { id: string; default?: true };
export type ModelCatalog = Record<ProviderId, Record<ModelTask, ModelOption[]>>;
export function isModelId(value: unknown): value is string {
  return typeof value === "string" && value.length <= 100 && /^[A-Za-z0-9._:-]+$/.test(value);
}
export function defaultModel(provider: string, task: string): string {
  if (provider === "mistral") return task === "meetings" ? process.env.MISTRAL_MEETING_MODEL?.trim() || "voxtral-mini-transcribe-3" : task === "stt" ? "voxtral-mini-latest" : "mistral-large-latest";
  if (provider === "openai") return task === "stt" ? "gpt-4o-mini-transcribe" : "gpt-4o-mini";
  if (provider === "anthropic") return process.env.ANTHROPIC_CHAT_MODEL?.trim() || "claude-sonnet-5-5";
  if (provider === "assemblyai") return process.env.ASSEMBLYAI_MEETING_MODEL?.trim() || "universal-3-5-pro";
  return task === "stt" ? "whisper-large-v3" : "llama-3.3-70b-versatile";
}
export const assemblyModels = ["universal-3-5-pro", "universal-2"];
const curated: Record<ProviderId, Record<ModelTask, string[]>> = {
  mistral: { stt: ["voxtral-mini-latest", "voxtral-mini-transcribe-3"], chat: ["mistral-large-latest", "mistral-small-latest"], meetings: ["voxtral-mini-transcribe-3"] },
  openai: { stt: ["gpt-4o-mini-transcribe", "gpt-4o-transcribe", "whisper-1"], chat: ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini", "gpt-4.1", "gpt-5-mini", "gpt-5"], meetings: [] },
  anthropic: { stt: [], chat: ["claude-sonnet-5-5"], meetings: [] },
  assemblyai: { stt: [], chat: [], meetings: assemblyModels },
  groq: { stt: ["whisper-large-v3"], chat: ["llama-3.3-70b-versatile"], meetings: [] }
};
type ModelRecord = { id: string; capabilities?: { completion_chat?: boolean; audio_transcription?: boolean; audio?: boolean; audio_speech?: boolean; audio_transcription_realtime?: boolean } };
const live = new Map<ProviderId, { key: string; records: ModelRecord[] }>();
export function updateModels(provider: ProviderId, payload: unknown, key = process.env[`${provider.toUpperCase()}_API_KEY`]?.trim() ?? "") {
  if (!payload || typeof payload !== "object" || !("data" in payload) || !Array.isArray(payload.data)) { live.delete(provider); return; }
  const records = payload.data.filter((item): item is ModelRecord => !!item && typeof item === "object" && isModelId(item.id));
  live.set(provider, { key, records });
}
function matches(provider: ProviderId, task: ModelTask, model: ModelRecord): boolean {
  const id = model.id;
  if (provider === "anthropic") return task === "chat" && id.startsWith("claude-");
  if (provider === "openai") {
    if (task === "stt") return id === "whisper-1" || /^gpt-.*-transcribe(?:-|$)/.test(id) && !/diarize/.test(id);
    // Responses supports these text families without temperature or chat-only parameters.
    return task === "chat" && /^(gpt-(4o|4\.1|5)(?:[.-]|$)|o[134](?:-|$))/.test(id) && !/audio|realtime|tts|image|search|embedding|transcribe|moderation|instruct|codex/.test(id);
  }
  if (provider === "mistral") {
    if (task === "meetings") return /-transcribe-/.test(id) && !/realtime/.test(id);
    if (task === "stt") return /^voxtral-/.test(id) && !/realtime/.test(id) && (/-transcribe(?:-|$)/.test(id) || id === "voxtral-mini-latest" || model.capabilities?.audio_transcription === true);
    return !model.capabilities?.audio && !model.capabilities?.audio_transcription && !model.capabilities?.audio_speech && !model.capabilities?.audio_transcription_realtime && !/embed|ocr|moderat|audio|voxtral|transcri/.test(id) && (model.capabilities?.completion_chat === true || model.capabilities?.completion_chat === undefined && /^(mistral-|ministral-|magistral-|codestral-|devstral-|pixtral-)/.test(id));
  }
  return false;
}
export function modelCatalog(): ModelCatalog {
  return Object.fromEntries(Object.entries(curated).map(([name, tasks]) => {
    const provider = name as ProviderId;
    const cached = live.get(provider);
    const records = cached?.key === (process.env[`${provider.toUpperCase()}_API_KEY`]?.trim() ?? "") ? cached.records : undefined;
    return [provider, Object.fromEntries(Object.entries(tasks).map(([name, fallback]) => {
      const task = name as ModelTask;
      if (!fallback.length) return [task, []];
      const primary = defaultModel(provider, task);
      const ids = records && provider !== "groq" ? records.filter(record => matches(provider, task, record)).map(record => record.id) : fallback;
      return [task, [...new Set([primary, ...ids])].map(id => ({ id, ...(id === primary ? { default: true } : {}) }))];
    }))];
  })) as ModelCatalog;
}

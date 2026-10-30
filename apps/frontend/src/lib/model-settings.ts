import { availableDictationModes, dictationSttProvider, updateCustomMode } from "./modes";
import type { ModelSelection, ModelTask, Provider, ProviderCheckResult, ProviderId, Providers, Settings } from "./types";

export const providerLabels: Record<ProviderId, string> = { mistral: "Mistral", openai: "OpenAI", anthropic: "Claude", assemblyai: "AssemblyAI", groq: "Groq" };
const defaults: Record<ProviderId, Partial<Record<ModelTask, string>>> = {
  mistral: { stt: "voxtral-mini-latest", chat: "mistral-large-latest", meetings: "voxtral-mini-transcribe-3" },
  openai: { stt: "gpt-4o-mini-transcribe", chat: "gpt-4o-mini" },
  anthropic: { chat: "claude-sonnet-5-5" }, assemblyai: { meetings: "universal-3-5-pro" },
  groq: { stt: "whisper-large-v3", chat: "llama-3.3-70b-versatile" },
};
export function defaultModel(provider: ProviderId, task: ModelTask, providers?: Providers): string {
  return providers?.models?.[provider]?.[task]?.find(model => model.default)?.id ?? defaults[provider]?.[task] ?? "";
}
export function deriveModelSettings(settings: Settings, providers?: Providers): Settings {
  const original = settings.providers.original ?? "mistral";
  const stt = dictationSttProvider(original, providers?.stt);
  const meeting = settings.providers.meetings ?? "mistral";
  return { ...settings,
    models: { ...settings.models, ...Object.fromEntries([...Object.entries(settings.providers).filter(([id]) => id !== "meetings"), ...(settings.customModes ?? []).map(mode => [mode.id, mode.provider])]
      .map(([id, provider]) => [id, settings.models?.[id] ?? defaultModel(provider as ProviderId, "chat", providers)])) },
    dictationStt: settings.dictationStt ?? { provider: stt, model: defaultModel(stt, "stt", providers) },
    dictationFallback: settings.dictationFallback ?? null,
    meetingStt: settings.meetingStt ?? { provider: meeting, model: defaultModel(meeting, "meetings", providers) },
    meetingSttFallback: settings.meetingSttFallback !== undefined ? settings.meetingSttFallback : settings.meetingFallback === true
      ? { provider: "assemblyai", model: defaultModel("assemblyai", "meetings", providers) } : null,
  };
}
export interface ModelRow {
  id: string; label: string; affected: string; task: ModelTask; selection: ModelSelection | null;
  providers: string[]; fallback?: boolean; primary?: ModelSelection;
}
export function modelRows(settings: Settings, providers?: Providers): ModelRow[] {
  const derived = deriveModelSettings(settings, providers);
  const dictationStt = derived.dictationStt!;
  const meetingStt = derived.meetingStt!;
  const stt = (providers?.stt ?? []).filter(provider => provider === "mistral" || provider === "openai");
  const chat = providers?.llm ?? [];
  return [
    { id: "dictation-stt", label: "Spracherkennung", affected: "Diktat Spracherkennung", task: "stt", selection: dictationStt, providers: stt },
    { id: "dictation-fallback", label: "Ausweiche bei Fehler", affected: "Diktat Ausweiche", task: "stt", selection: derived.dictationFallback!, providers: stt, fallback: true, primary: dictationStt },
    ...availableDictationModes(settings).map(mode => ({ id: mode.id, label: mode.label || "Neuer Modus", affected: `Diktat ${mode.label || "Neuer Modus"}`, task: "chat" as const,
      selection: { provider: mode.provider, model: derived.models![mode.id] ?? defaultModel(mode.provider, "chat", providers) }, providers: chat })),
    { id: "meetings", label: "Spracherkennung mit Sprechertrennung", affected: "Meetings Spracherkennung", task: "meetings", selection: meetingStt, providers: providers?.meetings ?? [] },
    { id: "meeting-fallback", label: "Ausweiche bei Fehler", affected: "Meetings Ausweiche", task: "meetings", selection: derived.meetingSttFallback!, providers: (providers?.meetings ?? []).filter(p => p === "assemblyai"), fallback: true, primary: meetingStt },
    ...(["protocol", "summary"] as const).map(id => ({ id, label: id === "protocol" ? "Protokoll (aufgenommene Meetings)" : "Zusammenfassung (hochgeladene Dateien)", affected: id === "protocol" ? "Protokoll" : "Zusammenfassung", task: "chat" as const,
      selection: { provider: settings.providers[id], model: derived.models![id] }, providers: chat })),
  ];
}
export function updateModelRow(settings: Settings, id: string, selection: ModelSelection | null, providers?: Providers): Settings {
  let next = deriveModelSettings(settings, providers);
  if (id === "dictation-stt") next = { ...next, dictationStt: selection! };
  else if (id === "dictation-fallback") next = { ...next, dictationFallback: selection };
  else if (id === "meetings") next = { ...next, meetingStt: selection!, providers: { ...next.providers, meetings: selection!.provider as "mistral" | "assemblyai" } };
  else if (id === "meeting-fallback") next = { ...next, meetingSttFallback: selection, meetingFallback: !!selection };
  else if (selection) {
    next = settings.customModes?.some(mode => mode.id === id) ? updateCustomMode(next, id, { provider: selection.provider as Provider }) : { ...next, providers: { ...next.providers, [id]: selection.provider } };
    next = { ...next, models: { ...next.models, [id]: selection.model } };
  }
  // An identical retry cannot help; changing the primary must not silently send it twice.
  if (pairKey(next.dictationStt) === pairKey(next.dictationFallback)) next.dictationFallback = null;
  if (pairKey(next.meetingStt) === pairKey(next.meetingSttFallback)) { next.meetingSttFallback = null; next.meetingFallback = false; }
  return next;
}
export function pairKey(selection?: ModelSelection | null): string { return selection ? `${selection.provider}/${selection.model}` : ""; }
export function uniqueChecks(rows: ModelRow[]): ModelSelection[] {
  return [...new Map(rows.flatMap(row => row.selection ? [[pairKey(row.selection), row.selection] as const] : [])).values()];
}
export function checkMessage(reason?: string): string {
  const messages: Record<string, string> = { invalid_key: "Schlüssel ungültig", model_unavailable: "Modell nicht verfügbar", timeout: "keine Antwort (Zeitüberschreitung)", network: "nicht erreichbar" };
  return messages[reason ?? ""] ?? (/^http_\d+$/.test(reason ?? "") ? `Fehler HTTP ${reason!.slice(5)}` : "nicht erreichbar");
}
export type RowCheck = { pair: string; result: ProviderCheckResult };

import type { TargetLanguage, TranslationLanguage } from "./target-languages";
import type { HistoryEntry, ModelSelection, Provider, Settings } from "./types";
import { applyLexicon, lexiconPromptTerms } from "./lexicon";
import { matchSnippet } from "./snippets";
import { isLongEnough } from "./recorder";
import { availableDictationModes, dictationSttProvider } from "./modes";
import type { BuiltinMode } from "./types";
export type DictationMode = HistoryEntry["mode"];
export interface TranscriptionRequest {
  audio: Blob; mode: BuiltinMode; provider: Exclude<Provider, "anthropic">; language: string; prompt?: string; model?: string; fallback?: ModelSelection | null;
}
export interface ProcessingRequest {
  transcript: string; mode: BuiltinMode; provider: Provider; instructions: string; targetLanguage?: TargetLanguage; model?: string;
}
export interface TranslationRequest {
  text: string; targetLanguage: TranslationLanguage; provider: Provider; model?: string;
}
export interface DictationApi {
  translate: (input: TranslationRequest) => Promise<{ translated: string; provider: string; model: string | null }>;
  transcribe: (input: TranscriptionRequest) => Promise<{ transcript: string; provider: string; model?: string | null }>;
  process: (input: ProcessingRequest) => Promise<{ processed: string; provider: string; model?: string | null }>;
}
export type DictationResult = Omit<HistoryEntry, "id" | "createdAt"> & { modeLabel: string };
export interface DictationOptions {
  mode: DictationMode;
  language: string;
  targetLanguage: TargetLanguage;
  settings: Settings;
  sttProviders?: readonly string[];
}
export function snapshotDictationOptions(options: DictationOptions): DictationOptions {
  return structuredClone(options);
}
export async function runDictation({ audio, durationSeconds, mode, language, targetLanguage = "source", settings, sttProviders, api, onStage }: {
  audio: Blob; durationSeconds: number; mode: DictationMode; language: string; targetLanguage?: TargetLanguage; settings: Settings;
  sttProviders?: readonly string[];
  api: DictationApi; onStage?: (stage: string) => void;
}): Promise<DictationResult> {
  if (!isLongEnough(durationSeconds)) throw new Error("Aufnahme zu kurz");
  const selected = availableDictationModes(settings).find(item => item.id === mode);
  if (!selected) throw new Error("Dieser Modus ist nicht mehr verfügbar. Bitte einen anderen Modus wählen.");
  const { provider, prompt: instructions, label: modeLabel } = selected;
  const requestMode = selected.builtin ?? "original";
  onStage?.("Transkribiere …");
  const sttProvider = (settings.dictationStt?.provider ?? dictationSttProvider(provider, sttProviders)) as Exclude<Provider, "anthropic">;
  const model = settings.models?.[mode];
  const transcript = await api.transcribe({
    audio, mode: requestMode, provider: sttProvider, language,
    ...(settings.dictationStt ? { model: settings.dictationStt.model } : {}),
    ...(settings.dictationFallback !== undefined ? { fallback: settings.dictationFallback } : {}),
    ...(sttProvider === "openai" ? { prompt: lexiconPromptTerms(settings.lexicon).join(", ").slice(0, 1000) } : {}),
  });
  const raw = transcript.transcript;
  if (!raw.trim()) throw new Error("Kein verwertbarer Text erkannt — bitte erneut versuchen.");
  const corrected = applyLexicon(raw, settings.lexicon);
  const snippet = matchSnippet(corrected, settings.snippets);
  const metadata = { raw, mode, modeLabel, durationSeconds, ...(transcript.model ? { sttProvider: transcript.provider, sttModel: transcript.model } : {}), ...(targetLanguage !== "source" ? { targetLanguage } : {}) };
  if (snippet) {
    if (targetLanguage === "source") return { ...metadata, text: snippet.text, provider: transcript.provider };
    onStage?.("Übersetze …");
    const translated = await api.translate({ text: snippet.text, targetLanguage, provider, ...(model ? { model } : {}) });
    if (!translated.translated.trim()) throw new Error("Kein verwertbarer Text erkannt — bitte erneut versuchen.");
    return { ...metadata, text: translated.translated, provider: resultProvider(translated) };
  }
  onStage?.("Bearbeite …");
  const processed = await api.process({ transcript: corrected, mode: requestMode, provider, instructions, targetLanguage, ...(model ? { model } : {}) });
  if (!processed.processed.trim()) throw new Error("Kein verwertbarer Text erkannt — bitte erneut versuchen.");
  return { ...metadata, text: processed.processed, provider: resultProvider(processed) };
}

function resultProvider(result: { provider: string; model?: string | null }): string {
  return result.provider === "Claude" && result.model ? `${result.provider} · ${result.model}` : result.provider;
}

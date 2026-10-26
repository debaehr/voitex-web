import type { HistoryEntry, Provider, Settings } from "./types";
import { applyLexicon, lexiconPromptTerms } from "./lexicon";
import { matchSnippet } from "./snippets";
import { isLongEnough } from "./recorder";
export type DictationMode = HistoryEntry["mode"];
export interface TranscriptionRequest {
  audio: Blob; mode: DictationMode; provider: Provider; language: string; prompt?: string;
}
export interface ProcessingRequest {
  transcript: string; mode: DictationMode; provider: Provider; instructions: string;
}
export interface DictationApi {
  transcribe: (input: TranscriptionRequest) => Promise<{ transcript: string; provider: string }>;
  process: (input: ProcessingRequest) => Promise<{ processed: string; provider: string }>;
}
export type DictationResult = Omit<HistoryEntry, "id" | "createdAt">;
export async function runDictation({ audio, durationSeconds, mode, language, settings, api, onStage }: {
  audio: Blob; durationSeconds: number; mode: DictationMode; language: string; settings: Settings;
  api: DictationApi; onStage?: (stage: string) => void;
}): Promise<DictationResult> {
  if (!isLongEnough(durationSeconds)) throw new Error("Aufnahme zu kurz");
  const provider = settings.providers[mode];
  onStage?.("Transkribiere …");
  const transcript = await api.transcribe({
    audio, mode, provider, language,
    ...(provider === "openai" ? { prompt: lexiconPromptTerms(settings.lexicon).join(", ").slice(0, 1000) } : {}),
  });
  const raw = transcript.transcript;
  if (!raw.trim()) throw new Error("Kein verwertbarer Text erkannt — bitte erneut versuchen.");
  const corrected = applyLexicon(raw, settings.lexicon);
  const snippet = matchSnippet(corrected, settings.snippets);
  if (snippet) return { text: snippet.text, raw, mode, provider: transcript.provider, durationSeconds };
  onStage?.("Bearbeite …");
  const processed = await api.process({ transcript: corrected, mode, provider, instructions: settings.prompts[mode] });
  if (!processed.processed.trim()) throw new Error("Kein verwertbarer Text erkannt — bitte erneut versuchen.");
  return { text: processed.processed, raw, mode, provider: processed.provider, durationSeconds };
}

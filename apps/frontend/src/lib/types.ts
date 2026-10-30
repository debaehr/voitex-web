import type { TargetLanguage } from "./target-languages";
export const settingModes = [
  "original",
  "casual",
  "formal",
  "coding",
  "protocol",
  "summary",
] as const;
export type SettingMode = (typeof settingModes)[number];
export type Provider = "openai" | "mistral" | "groq" | "anthropic";
export type ProviderId = Provider | "assemblyai";
export type ModelTask = "stt" | "chat" | "meetings";
export interface ModelSelection { provider: ProviderId; model: string }
export interface ModelOption { id: string; default?: true }
export type ModelCatalog = Partial<Record<ProviderId, Partial<Record<ModelTask, ModelOption[]>>>>;
export interface ProviderCheckResult extends ModelSelection { ok: boolean; reason?: string }
export type BuiltinMode = "original" | "casual" | "formal" | "coding";
export interface CustomMode {
  id: string;
  label: string;
  description?: string;
  prompt: string;
  provider: Provider;
}
export interface LexiconEntry {
  id: string;
  spoken: string;
  correct: string;
}
export interface Snippet {
  id: string;
  trigger: string;
  text: string;
}
export interface Settings {
  version: 1;
  providers: Record<SettingMode, Provider> & { meetings?: "mistral" | "assemblyai" };
  meetingFallback?: boolean;
  models?: Record<string, string>;
  dictationStt?: ModelSelection;
  dictationFallback?: ModelSelection | null;
  meetingStt?: ModelSelection;
  meetingSttFallback?: ModelSelection | null;
  dictationSpacePause?: boolean;
  prompts: Record<SettingMode, string>;
  lexicon: LexiconEntry[];
  snippets: Snippet[];
  ownSpeakerName: string;
  customModes?: CustomMode[];
  hiddenModes?: BuiltinMode[];
}
export interface HistoryEntry {
  id: string;
  createdAt: string;
  mode: string;
  modeLabel?: string;
  provider: string;
  sttProvider?: string;
  sttModel?: string | null;
  durationSeconds: number;
  text: string;
  raw: string;
  targetLanguage?: TargetLanguage;
}
export interface Providers {
  models?: ModelCatalog;
  invalid?: string[];
  stt: string[];
  llm: string[];
  meetings: Array<"mistral" | "assemblyai">;
}

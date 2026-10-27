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
export type Provider = "openai" | "mistral" | "groq";
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
  providers: Record<SettingMode, Provider>;
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
  durationSeconds: number;
  text: string;
  raw: string;
  targetLanguage?: TargetLanguage;
}
export interface Providers {
  stt: string[];
  llm: string[];
  meetings: boolean;
}

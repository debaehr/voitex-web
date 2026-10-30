import { targetLanguageLabel } from "./target-languages";
import type { HistoryEntry } from "./types";
import { builtinModes } from "./modes";
export function historyModeLabel(entry: Pick<HistoryEntry, "mode" | "modeLabel">): string {
  return builtinModes.find(mode => mode.id === entry.mode)?.label ?? (entry.modeLabel || "Eigener Modus");
}
export function resultMeta(entry: Pick<HistoryEntry, "mode" | "modeLabel" | "targetLanguage" | "provider" | "durationSeconds" | "sttProvider" | "sttModel">): string {
  return [historyModeLabel(entry), targetLanguageLabel(entry.targetLanguage), entry.provider, entry.sttProvider ? `Spracherkennung: ${entry.sttProvider}${entry.sttModel ? ` · ${entry.sttModel}` : ""}` : "", `${entry.durationSeconds.toFixed(1)} s`].filter(Boolean).join(" · ");
}
export function filterHistory(entries: HistoryEntry[], search: string): HistoryEntry[] {
  const needle = search.trim().toLocaleLowerCase("de-DE");
  return entries.filter(entry => entry.text.toLocaleLowerCase("de-DE").includes(needle));
}
export function sortHistory(entries: HistoryEntry[], newestFirst: boolean): HistoryEntry[] {
  return [...entries].sort((a, b) => (Date.parse(a.createdAt) - Date.parse(b.createdAt)) * (newestFirst ? -1 : 1));
}
export function exportHistory(entries: HistoryEntry[]): string {
  return sortHistory(entries, true).map(entry =>
    `${new Date(entry.createdAt).toLocaleString("de-DE")} · ${[historyModeLabel(entry), targetLanguageLabel(entry.targetLanguage)].filter(Boolean).join(" · ")}\n${entry.text}`
  ).join("\n\n");
}

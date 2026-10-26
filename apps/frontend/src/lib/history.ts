import type { HistoryEntry } from "./types";
export const modeLabels: Record<HistoryEntry["mode"], string> = {
  original: "Original", casual: "Casual", formal: "Formal", coding: "Coding",
};
export function filterHistory(entries: HistoryEntry[], search: string): HistoryEntry[] {
  const needle = search.trim().toLocaleLowerCase("de-DE");
  return entries.filter(entry => entry.text.toLocaleLowerCase("de-DE").includes(needle));
}
export function sortHistory(entries: HistoryEntry[], newestFirst: boolean): HistoryEntry[] {
  return [...entries].sort((a, b) => (Date.parse(a.createdAt) - Date.parse(b.createdAt)) * (newestFirst ? -1 : 1));
}
export function exportHistory(entries: HistoryEntry[]): string {
  return sortHistory(entries, true).map(entry =>
    `${new Date(entry.createdAt).toLocaleString("de-DE")} · ${modeLabels[entry.mode]}\n${entry.text}`
  ).join("\n\n");
}

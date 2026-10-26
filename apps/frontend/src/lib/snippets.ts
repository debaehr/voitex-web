import { isRecord } from "./settings";
import type { Snippet } from "./types";
type ImportedSnippet = Omit<Snippet, "id">;
export function normalizeTrigger(value: string): string {
  return value
    .replace(/^[\s\p{P}]+|[\s\p{P}]+$/gu, "")
    .toLocaleLowerCase("de-DE");
}
export function matchSnippet(
  text: string,
  snippets: Snippet[],
): Snippet | undefined {
  const key = normalizeTrigger(text);
  return key
    ? snippets.find((snippet) => normalizeTrigger(snippet.trigger) === key)
    : undefined;
}
export function findDuplicateTrigger(
  snippets: Snippet[],
  trigger: string,
  excludeId?: string,
): Snippet | undefined {
  return snippets.find(
    (snippet) =>
      snippet.id !== excludeId &&
      normalizeTrigger(snippet.trigger) === normalizeTrigger(trigger),
  );
}
export function parseSnippetsJson(source: string): ImportedSnippet[] {
  let value: unknown;
  try {
    value = JSON.parse(source.replace(/^\ufeff/, ""));
  } catch {
    throw new Error("Ungültige JSON-Datei.");
  }
  if (!Array.isArray(value))
    throw new Error("JSON muss eine Liste von Snippets enthalten.");
  return value.map((row) => {
    if (
      !isRecord(row) ||
      typeof row.trigger !== "string" ||
      !normalizeTrigger(row.trigger) ||
      typeof row.text !== "string" ||
      !row.text.trim()
    )
      throw new Error("Jedes Snippet benötigt Schlüsselwort und Text.");
    return { trigger: row.trigger.trim(), text: row.text };
  });
}
export function exportSnippetsJson(snippets: ImportedSnippet[]): string {
  return JSON.stringify(
    snippets.map(({ trigger, text }) => ({ trigger, text })),
    null,
    2,
  );
}
export function mergeImported(
  existing: Snippet[],
  imported: ImportedSnippet[],
): { entries: Snippet[]; added: number; skipped: number } {
  const entries = [...existing];
  let added = 0,
    skipped = 0;
  for (const row of imported) {
    if (
      !normalizeTrigger(row.trigger) ||
      !row.text.trim() ||
      findDuplicateTrigger(entries, row.trigger)
    ) {
      skipped++;
      continue;
    }
    entries.push({
      id: crypto.randomUUID(),
      trigger: row.trigger.trim(),
      text: row.text,
    });
    added++;
  }
  return { entries, added, skipped };
}

import type { LexiconEntry } from "./types";
type ImportedEntry = Omit<LexiconEntry, "id">;
const normalize = (value: string) => value.trim().toLocaleLowerCase("de-DE");
const escapeRegex = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export function applyLexicon(text: string, entries: LexiconEntry[]): string {
  const sorted = entries
    .filter((entry) => entry.spoken.trim())
    .sort((a, b) => b.spoken.trim().length - a.spoken.trim().length);
  if (!sorted.length) return text;
  const replacements = new Map<string, string>();
  for (const entry of sorted)
    if (!replacements.has(normalize(entry.spoken)))
      replacements.set(normalize(entry.spoken), entry.correct);
  const pattern = [...replacements.keys()].map(escapeRegex).join("|");
  // Unicode boundaries also protect German words and terms containing punctuation.
  return text.replace(
    new RegExp(`(?<![\\p{L}\\p{N}_])(?:${pattern})(?![\\p{L}\\p{N}_])`, "giu"),
    (match) => replacements.get(normalize(match))!,
  );
}
export function lexiconPromptTerms(entries: LexiconEntry[]): string[] {
  return [
    ...new Set(entries.map((entry) => entry.correct.trim()).filter(Boolean)),
  ];
}
export function findDuplicateSpoken(
  entries: LexiconEntry[],
  spoken: string,
  excludeId?: string,
): LexiconEntry | undefined {
  const key = normalize(spoken);
  return key
    ? entries.find(
        (entry) => entry.id !== excludeId && normalize(entry.spoken) === key,
      )
    : undefined;
}
export function exportLexiconCsv(entries: ImportedEntry[]): string {
  const quote = (value: string) =>
    /[;"\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  return [
    "spoken;correct",
    ...entries.map((entry) => `${quote(entry.spoken)};${quote(entry.correct)}`),
  ].join("\r\n");
}
export function parseLexiconCsv(source: string): ImportedEntry[] {
  const text = source.replace(/^\ufeff/, "");
  const rows: string[][] = [];
  let row: string[] = [],
    field = "",
    quoted = false,
    closed = false;
  function endField() {
    row.push(field);
    field = "";
    closed = false;
  }
  function endRow() {
    endField();
    if (row.some((value) => value.length)) rows.push(row);
    row = [];
  }
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index++;
        } else {
          quoted = false;
          closed = true;
        }
      } else field += char;
    } else if (char === ";") endField();
    else if (char === "\r" || char === "\n") {
      endRow();
      if (char === "\r" && text[index + 1] === "\n") index++;
    } else if (char === '"' && !field && !closed) quoted = true;
    else {
      if (closed || char === '"')
        throw new Error("Ungültige CSV-Anführungszeichen.");
      field += char;
    }
  }
  if (quoted) throw new Error("CSV-Anführungszeichen nicht geschlossen.");
  endRow();
  const header = rows.shift();
  if (header?.length !== 2 || header[0] !== "spoken" || header[1] !== "correct")
    throw new Error("CSV benötigt die Kopfzeile spoken;correct.");
  return rows.map((values, index) => {
    if (values.length !== 2 || !values[1].trim())
      throw new Error(
        `CSV-Zeile ${index + 2}: Richtig geschrieben fehlt oder ungültige Spaltenzahl.`,
      );
    return { spoken: values[0].trim(), correct: values[1].trim() };
  });
}
export function mergeImported(
  existing: LexiconEntry[],
  imported: ImportedEntry[],
): { entries: LexiconEntry[]; added: number; skipped: number } {
  const entries = [...existing];
  let added = 0,
    skipped = 0;
  for (const row of imported) {
    const spoken = row.spoken.trim(),
      correct = row.correct.trim();
    const sameHint =
      !spoken &&
      entries.some(
        (entry) =>
          !entry.spoken.trim() &&
          normalize(entry.correct) === normalize(correct),
      );
    if (!correct || findDuplicateSpoken(entries, spoken) || sameHint) {
      skipped++;
      continue;
    }
    entries.push({ id: crypto.randomUUID(), spoken, correct });
    added++;
  }
  return { entries, added, skipped };
}

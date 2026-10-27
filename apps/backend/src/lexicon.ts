export type LexiconEntry = { spoken: string; correct: string };

const normalize = (value: string) => value.trim().toLocaleLowerCase("de-DE");
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Settings historically accepted arbitrary lexicon arrays; ignore malformed entries.
export function lexiconEntries(value: unknown): LexiconEntry[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(entry => entry && typeof entry === "object" && typeof entry.correct === "string"
    ? [{ spoken: typeof entry.spoken === "string" ? entry.spoken : "", correct: entry.correct }] : []);
}

export function applyLexicon(text: string, entries: LexiconEntry[]): string {
  const sorted = entries.filter(entry => entry.spoken.trim())
    .sort((a, b) => b.spoken.trim().length - a.spoken.trim().length);
  if (!sorted.length) return text;
  const replacements = new Map<string, string>();
  for (const entry of sorted) {
    if (!replacements.has(normalize(entry.spoken))) replacements.set(normalize(entry.spoken), entry.correct);
  }
  const pattern = [...replacements.keys()].map(escapeRegex).join("|");
  // Match the frontend's Unicode boundaries and replace once, without cascading.
  return text.replace(new RegExp(`(?<![\\p{L}\\p{N}_])(?:${pattern})(?![\\p{L}\\p{N}_])`, "giu"),
    match => replacements.get(normalize(match))!);
}

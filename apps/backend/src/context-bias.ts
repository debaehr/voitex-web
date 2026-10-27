export const MAX_CONTEXT_BIAS_TERMS = 100;

export function contextBiasTerms(terms: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const term of terms) {
    const trimmed = term.trim();
    const key = trimmed.toLocaleLowerCase("de-DE");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
    if (result.length === MAX_CONTEXT_BIAS_TERMS) break;
  }
  return result;
}

export const MAX_CONTEXT_BIAS_TERMS = 100;

export function contextBiasTerms(terms: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const term of terms) {
    // Mistral's comma_separated context_bias input forbids whitespace and commas in each item.
    for (const part of term.split(/[\s,]+/)) {
      const key = part.toLocaleLowerCase("de-DE");
      if (!key || seen.has(key)) continue;
      seen.add(key);
      result.push(part);
      if (result.length === MAX_CONTEXT_BIAS_TERMS) return result;
    }
  }
  return result;
}

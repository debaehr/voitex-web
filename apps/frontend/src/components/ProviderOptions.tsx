const labels: Record<string, string> = { anthropic: "Claude", openai: "OpenAI", mistral: "Mistral", groq: "Groq", assemblyai: "AssemblyAI" };

export function ProviderOptions({ available, invalid = [], selected }: { available: readonly string[]; invalid?: readonly string[]; selected: string }) {
  const options = [...new Set([...available, ...(available.includes(selected) ? [] : [selected])])];
  return <>{options.map(id => {
    const unavailable = !available.includes(id);
    return <option key={id} value={id} disabled={id !== selected && (unavailable || invalid.includes(id))}>
      {labels[id] ?? id}{unavailable ? " (nicht verfügbar)" : invalid.includes(id) ? " (Schlüssel ungültig)" : ""}
    </option>;
  })}</>;
}

import { settingModes, type Settings } from "./types";
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
export function mergeWithDefaults(
  partial: unknown,
  defaults: Settings,
): Settings {
  const result = structuredClone(defaults);
  result.customModes = [];
  result.hiddenModes = [];
  if (!isRecord(partial)) return result;
  if (Array.isArray(partial.customModes)) result.customModes = structuredClone(partial.customModes);
  if (Array.isArray(partial.hiddenModes)) result.hiddenModes = [...partial.hiddenModes];
  for (const mode of settingModes) {
    const provider = isRecord(partial.providers)
      ? partial.providers[mode]
      : undefined;
    if (provider === "openai" || provider === "mistral" || provider === "groq" || provider === "anthropic")
      result.providers[mode] = provider;
    const prompt = isRecord(partial.prompts)
      ? partial.prompts[mode]
      : undefined;
    if (typeof prompt === "string") result.prompts[mode] = prompt;
  }
  const meetings = isRecord(partial.providers) ? partial.providers.meetings : undefined;
  if (meetings === "mistral" || meetings === "assemblyai") result.providers.meetings = meetings;
  if (typeof partial.meetingFallback === "boolean") result.meetingFallback = partial.meetingFallback;
  if (typeof partial.ownSpeakerName === "string")
    result.ownSpeakerName = partial.ownSpeakerName;
  if (Array.isArray(partial.lexicon))
    result.lexicon = partial.lexicon.flatMap((row) =>
      isRecord(row) &&
      typeof row.id === "string" &&
      typeof row.spoken === "string" &&
      typeof row.correct === "string" &&
      row.correct.trim()
        ? [{ id: row.id, spoken: row.spoken, correct: row.correct }]
        : [],
    );
  if (Array.isArray(partial.snippets))
    result.snippets = partial.snippets.flatMap((row) =>
      isRecord(row) &&
      typeof row.id === "string" &&
      typeof row.trigger === "string" &&
      row.trigger.trim() &&
      typeof row.text === "string" &&
      row.text.trim()
        ? [{ id: row.id, trigger: row.trigger, text: row.text }]
        : [],
    );
  return result;
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (isRecord(value))
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
export function isDirty(a: Settings, b: Settings): boolean {
  return canonical(a) !== canonical(b);
}

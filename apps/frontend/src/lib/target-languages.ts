export const targetLanguages = [
  { id: "source", label: "Wie gesprochen", short: "=" },
  { id: "de", label: "Deutsch", short: "→ DE" },
  { id: "en", label: "Englisch", short: "→ EN" },
  { id: "hr", label: "Kroatisch", short: "→ HR" },
] as const;
export type TargetLanguage = (typeof targetLanguages)[number]["id"];
export type TranslationLanguage = Exclude<TargetLanguage, "source">;
export function targetLanguageLabel(target?: TargetLanguage): string {
  return target && target !== "source" ? targetLanguages.find(item => item.id === target)?.short ?? "" : "";
}

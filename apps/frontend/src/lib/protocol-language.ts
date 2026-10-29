import { languages } from "./languages";
import { readPreference, writePreference } from "./device-preferences";

export const protocolLanguages = [{ id: "", label: "Wie im Meeting" }, ...languages.filter(language => language.id !== "auto")];
const preferenceKey = "voitex-protocol-language";
export const readProtocolLanguage = () => readPreference(preferenceKey, protocolLanguages.map(language => language.id), "");
export const saveProtocolLanguage = (language: string) => writePreference(preferenceKey, language);
export function protocolLanguageName(language: string): string {
  return !language || language === "auto" ? "Wie im Meeting" : new Intl.DisplayNames(["de"], { type: "language" }).of(language) ?? language;
}

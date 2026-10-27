import { recordProviderResponse } from "./key-status.js";

export type WorkMode = "original" | "casual" | "formal" | "coding";
export type AiProvider = "openai" | "mistral" | "groq";

export type TranscribeInput = {
  buffer: Buffer;
  filename: string;
  mimetype: string;
  language?: string;
  prompt?: string;
  contextBias?: string[];
  mode?: WorkMode;
};

export type ProviderResult = {
  text: string;
  provider: string;
  model: string | null;
};

export type ProcessInput = {
  transcript: string;
  mode: WorkMode;
  task?: "dictation" | "protocol" | "summary";
  instructions?: string;
  translateToEnglish?: boolean;
  targetLanguage?: TargetLanguage;
};

export const targetLanguageNames = { de: "Deutsch", en: "Englisch", hr: "Kroatisch" } as const;
export type TranslationLanguage = keyof typeof targetLanguageNames;
export type TargetLanguage = "source" | TranslationLanguage;

export function isTranslationLanguage(value: unknown): value is TranslationLanguage {
  return typeof value === "string" && Object.hasOwn(targetLanguageNames, value);
}

export function isTargetLanguage(value: unknown): value is TargetLanguage {
  return value === "source" || isTranslationLanguage(value);
}

export function buildTranslationInstructions(language: TranslationLanguage): string {
  return `Übersetze den folgenden Text ausschließlich auf ${targetLanguageNames[language]}. Übersetze nur, ohne den Text umzuschreiben, etwas hinzuzufügen oder wegzulassen. Erhalte Inhalt, Zeilenumbrüche, URLs, Namen und Platzhalter unverändert. Gib nur die Übersetzung zurück, keine Erklärung und keine Überschrift.`;
}

export function buildProcessInstructions(input: ProcessInput, defaults: Record<WorkMode, string>) {
  const base = input.instructions?.trim() || defaults[input.mode];
  // An explicit target wins over the legacy English-only flag.
  const target = input.targetLanguage ?? (input.translateToEnglish ? "en" : "source");
  if (target === "source") return base;
  return `${base}\n\nZusatzaufgabe: Gib ausschließlich das finale Ergebnis auf ${targetLanguageNames[target]} aus. Übersetze natürlich und fachlich sauber. Gib keine Gegenüberstellung, keine Erklärung und keine Überschrift zurück.`;
}

export async function postJson<T>(url: string, apiKey: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  recordProviderResponse(url, response.status);
  return readResponse<T>(response);
}

export async function postMultipart<T>(url: string, apiKey: string, formData: FormData): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`
    },
    body: formData
  });

  recordProviderResponse(url, response.status);
  return readResponse<T>(response);
}

export function fileFormData(input: TranscribeInput, fields: Record<string, string>) {
  const formData = new FormData();
  const file = new Blob([input.buffer], { type: input.mimetype });

  formData.append("file", file, input.filename);
  for (const [key, value] of Object.entries(fields)) {
    formData.append(key, value);
  }

  return formData;
}

async function readResponse<T>(response: Response): Promise<T> {
  if (response.ok) {
    return (await response.json()) as T;
  }

  const text = await response.text();
  throw new Error(text || `Provider request failed with HTTP ${response.status}.`);
}

// Omitting the field lets the STT provider detect the language automatically.
export function transcriptionLanguageFields(language?: string): Record<string, string> {
  return language && language !== "auto" ? { language } : {};
}

export function outputTokenLimit(input: ProcessInput): number {
  return input.task === "protocol" || input.task === "summary" ? 8000 : 4000;
}

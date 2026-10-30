import { recordProviderResponse } from "./key-status.js";

export type WorkMode = "original" | "casual" | "formal" | "coding";
export type AiProvider = "openai" | "mistral" | "groq" | "anthropic";

export type TranscribeInput = {
  model?: string;
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
  model?: string;
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

export async function postJson<T>(url: string, apiKey: string, body: unknown, options: { timeoutMs: number }): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(options.timeoutMs)
  });

  recordProviderResponse(url, response.status);
  return readResponse<T>(response);
}

export async function postMultipart<T>(url: string, apiKey: string, formData: FormData, options: { timeoutMs: number }): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`
    },
    body: formData,
    signal: AbortSignal.timeout(options.timeoutMs)
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

  await response.body?.cancel();
  throw new ProviderHttpError(response.status);
}

// Omitting the field lets the STT provider detect the language automatically.
export function transcriptionLanguageFields(language?: string): Record<string, string> {
  return language && language !== "auto" ? { language } : {};
}

export function outputTokenLimit(input: ProcessInput): number {
  return input.task === "protocol" || input.task === "summary" ? 8000 : 4000;
}

// Keep the status for retry decisions without exposing provider bodies or credentials.
export class ProviderHttpError extends Error {
  constructor(public status: number) { super(`Provider request failed with HTTP ${status}.`); }
}
export function shouldFallback(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  if ("status" in error && typeof error.status === "number") return [401, 403, 429].includes(error.status) || error.status >= 500 && error.status <= 599;
  return error instanceof TypeError || error instanceof Error &&
    (["AbortError", "TimeoutError", "APIConnectionError", "APIConnectionTimeoutError"].includes(error.name) ||
     ["APIConnectionError", "APIConnectionTimeoutError"].includes(error.constructor.name));
}

// Long meeting texts need time to generate; dictation should still fail promptly.
export function processTimeoutMs(input: ProcessInput): number {
  return input.task === "protocol" || input.task === "summary" ? 15 * 60_000 : 180_000;
}

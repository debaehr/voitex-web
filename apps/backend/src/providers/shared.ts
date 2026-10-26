export type WorkMode = "original" | "casual" | "formal" | "coding";
export type AiProvider = "openai" | "mistral" | "groq";

export type TranscribeInput = {
  buffer: Buffer;
  filename: string;
  mimetype: string;
  language?: string;
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
  instructions?: string;
  translateToEnglish?: boolean;
};

export function buildProcessInstructions(input: ProcessInput, defaults: Record<WorkMode, string>) {
  const base = input.instructions?.trim() || defaults[input.mode];

  if (!input.translateToEnglish) {
    return base;
  }

  return `${base}\n\nZusatzaufgabe: Gib ausschließlich das finale Ergebnis auf Englisch aus. Übersetze natürlich und fachlich sauber. Gib keinen deutschen Text, keine Gegenüberstellung, keine Erklärung und keine Überschrift zurück.`;
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

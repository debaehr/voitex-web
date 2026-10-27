import * as anthropic from "./anthropic.js";
import * as groq from "./groq.js";
import * as mistral from "./mistral.js";
import * as openai from "./openai.js";
import { AiProvider, ProcessInput, TranscribeInput } from "./shared.js";

const providers = {
  openai,
  mistral,
  groq
};

export type { AiProvider, WorkMode } from "./shared.js";

export function isProvider(value: unknown): value is AiProvider {
  return value === "openai" || value === "mistral" || value === "groq" || value === "anthropic";
}

export function transcribeAudio(provider: AiProvider, input: TranscribeInput) {
  // Centralized provider dispatch keeps route handlers provider-agnostic.
  if (provider === "anthropic") throw new Error("Claude unterstützt keine Spracherkennung.");
  return providers[provider].transcribeAudio(input);
}

export function processTranscript(provider: AiProvider, input: ProcessInput) {
  return (provider === "anthropic" ? anthropic : providers[provider]).processTranscript(input);
}

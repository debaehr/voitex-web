import { trackProviderCall } from "./key-status.js";
import { outputTokenLimit, processTimeoutMs } from "./shared.js";
import { modeInstructions } from "../prompts.js";
import { buildProcessInstructions, transcriptionLanguageFields } from "./shared.js";
import OpenAI, { toFile } from "openai";
import { ProcessInput, TranscribeInput } from "./shared.js";


export async function transcribeAudio(input: TranscribeInput) {
  assertApiKey();
  // Avoid SDK retries so a stalled STT request can reach the dictation fallback.
  const client = createClient({ timeoutMs: 120_000, maxRetries: 0 });

  const model = input.model ?? "gpt-4o-mini-transcribe";
  const file = await toFile(input.buffer, input.filename, { type: input.mimetype });
  const transcription = await trackProviderCall("openai", () => client.audio.transcriptions.create({
    file,
    model,
    ...(input.prompt ? { prompt: input.prompt } : {}),
    ...transcriptionLanguageFields(input.language)
  }));

  return {
    text: transcription.text,
    provider: "OpenAI",
    model
  };
}

export async function processTranscript(input: ProcessInput) {
  assertApiKey();
  const client = createClient({ timeoutMs: processTimeoutMs(input) });

  const model = input.model ?? "gpt-4o-mini";
  const instructions = buildProcessInstructions(input, modeInstructions);
  const response = await trackProviderCall("openai", () => client.responses.create({
    model,
    instructions,
    input: input.transcript,
    max_output_tokens: outputTokenLimit(input)
  }));

  return {
    text: response.output_text.trim(),
    provider: "OpenAI",
    model
  };
}

function assertApiKey() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }
}

function createClient(options: { timeoutMs: number; maxRetries?: number }) {
  assertApiKey();
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    timeout: options.timeoutMs,
    ...(options.maxRetries === undefined ? {} : { maxRetries: options.maxRetries })
  });
}

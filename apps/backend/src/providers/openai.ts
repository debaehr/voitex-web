import { modeInstructions } from "../prompts.js";
import { transcriptionLanguageFields } from "./shared.js";
import OpenAI, { toFile } from "openai";
import { ProcessInput } from "./shared.js";


export async function transcribeAudio(input: {
  buffer: Buffer;
  filename: string;
  mimetype: string;
  language?: string;
  prompt?: string;
}) {
  assertApiKey();
  const client = createClient();

  const file = await toFile(input.buffer, input.filename, { type: input.mimetype });
  const transcription = await client.audio.transcriptions.create({
    file,
    model: "gpt-4o-mini-transcribe",
    ...(input.prompt ? { prompt: input.prompt } : {}),
    ...transcriptionLanguageFields(input.language)
  });

  return {
    text: transcription.text,
    provider: "OpenAI",
    model: "gpt-4o-mini-transcribe"
  };
}

export async function processTranscript(input: ProcessInput) {
  assertApiKey();
  const client = createClient();

  const instructions = buildInstructions(input);
  const response = await client.responses.create({
    model: "gpt-4o-mini",
    instructions,
    input: input.transcript,
    max_output_tokens: 1200
  });

  return {
    text: response.output_text.trim(),
    provider: "OpenAI",
    model: "gpt-4o-mini"
  };
}

function assertApiKey() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }
}

function createClient() {
  assertApiKey();
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });
}

function buildInstructions(input: ProcessInput) {
  const base = input.instructions?.trim() || modeInstructions[input.mode];

  if (!input.translateToEnglish) {
    return base;
  }

  return `${base}\n\nZusatzaufgabe: Gib ausschließlich das finale Ergebnis auf Englisch aus. Übersetze natürlich und fachlich sauber. Gib keinen deutschen Text, keine Gegenüberstellung, keine Erklärung und keine Überschrift zurück.`;
}

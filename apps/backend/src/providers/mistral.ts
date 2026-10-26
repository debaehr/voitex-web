import { modeInstructions } from "../prompts.js";
import { transcriptionLanguageFields } from "./shared.js";
import {
  buildProcessInstructions,
  fileFormData,
  postJson,
  postMultipart,
  ProcessInput,
  ProviderResult,
  TranscribeInput
} from "./shared.js";

const provider = "Mistral";
const transcriptionModel = "voxtral-mini-latest";
const chatModel = "mistral-large-latest";


export async function transcribeAudio(input: TranscribeInput): Promise<ProviderResult> {
  const apiKey = apiKeyOrThrow();
  const formData = fileFormData(input, {
    model: transcriptionModel,
    ...transcriptionLanguageFields(input.language)
  });

  const result = await postMultipart<{ text: string }>("https://api.mistral.ai/v1/audio/transcriptions", apiKey, formData);

  return {
    text: result.text,
    provider,
    model: transcriptionModel
  };
}

export async function processTranscript(input: ProcessInput): Promise<ProviderResult> {
  const apiKey = apiKeyOrThrow();
  const instructions = buildProcessInstructions(input, modeInstructions);
  const result = await postJson<{ choices: Array<{ message: { content: string } }> }>(
    "https://api.mistral.ai/v1/chat/completions",
    apiKey,
    {
      model: chatModel,
      messages: [
        { role: "system", content: instructions },
        { role: "user", content: input.transcript }
      ],
      max_tokens: 1200
    }
  );

  return {
    text: result.choices[0]?.message.content.trim() || "",
    provider,
    model: chatModel
  };
}

function apiKeyOrThrow() {
  if (!process.env.MISTRAL_API_KEY) {
    throw new Error("MISTRAL_API_KEY is not configured.");
  }

  return process.env.MISTRAL_API_KEY;
}

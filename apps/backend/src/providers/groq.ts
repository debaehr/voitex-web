import {
  buildProcessInstructions,
  fileFormData,
  postJson,
  postMultipart,
  ProcessInput,
  ProviderResult,
  TranscribeInput
} from "./shared.js";

const provider = "Groq";
const transcriptionModel = "whisper-large-v3";
const chatModel = "llama-3.3-70b-versatile";

const modeInstructions = {
  original:
    "Bereinige das Transkript nur sprachlich. Erhalte Stil, Tonalität, Inhalt und Reihenfolge des Originals. Korrigiere Rechtschreibung, Zeichensetzung und klare Versprecher. Keine inhaltlichen Ergänzungen. Gib nur den finalen Text zurück.",
  casual:
    "Formuliere den Inhalt locker, natürlich und direkt. Nutze bei direkter Anrede die Du-Form. Kürze unnötige Wiederholungen und mache den Text gut lesbar. Gib nur den finalen Text zurück.",
  formal:
    "Formuliere den Inhalt höflich, professionell und klar. Nutze bei direkter Anrede die Sie-Form. Strukturiere den Text bei Bedarf in kurze, verständliche Abschnitte. Gib nur den finalen Text zurück.",
  coding:
    "Transformiere das Diktat in einen klaren, präzisen KI- oder Coding-Prompt. Extrahiere Ziel, Kontext, Anforderungen, Randbedingungen und gewünschtes Ausgabeformat. Nutze eine strukturierte Form mit Überschriften und Bulletpoints. Gib nur den finalen Prompt zurück."
};

export async function transcribeAudio(input: TranscribeInput): Promise<ProviderResult> {
  const apiKey = apiKeyOrThrow();
  const formData = fileFormData(input, {
    model: transcriptionModel,
    language: input.language || "de",
    response_format: "json"
  });

  const result = await postMultipart<{ text: string }>("https://api.groq.com/openai/v1/audio/transcriptions", apiKey, formData);

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
    "https://api.groq.com/openai/v1/chat/completions",
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
  if (!process.env.GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY is not configured.");
  }

  return process.env.GROQ_API_KEY;
}

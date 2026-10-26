import OpenAI, { toFile } from "openai";
import { ProcessInput, WorkMode } from "./shared.js";

const modeInstructions: Record<WorkMode, string> = {
  original:
    "Bereinige das Transkript nur sprachlich. Erhalte Stil, Tonalität, Inhalt und Reihenfolge des Originals. Korrigiere Rechtschreibung, Zeichensetzung und klare Versprecher. Keine inhaltlichen Ergänzungen. Gib nur den finalen Text zurück.",
  casual:
    "Formuliere den Inhalt locker, natürlich und direkt. Nutze bei direkter Anrede die Du-Form. Kürze unnötige Wiederholungen und mache den Text gut lesbar. Gib nur den finalen Text zurück.",
  formal:
    "Formuliere den Inhalt höflich, professionell und klar. Nutze bei direkter Anrede die Sie-Form. Strukturiere den Text bei Bedarf in kurze, verständliche Abschnitte. Gib nur den finalen Text zurück.",
  coding:
    "Transformiere das Diktat in einen klaren, präzisen KI- oder Coding-Prompt. Extrahiere Ziel, Kontext, Anforderungen, Randbedingungen und gewünschtes Ausgabeformat. Nutze eine strukturierte Form mit Überschriften und Bulletpoints. Gib nur den finalen Prompt zurück."
};

export async function transcribeAudio(input: {
  buffer: Buffer;
  filename: string;
  mimetype: string;
  language?: string;
}) {
  assertApiKey();
  const client = createClient();

  const file = await toFile(input.buffer, input.filename, { type: input.mimetype });
  const transcription = await client.audio.transcriptions.create({
    file,
    model: "gpt-4o-mini-transcribe",
    language: input.language || "de"
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

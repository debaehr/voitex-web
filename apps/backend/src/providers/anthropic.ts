import { defaultModel } from "./models.js";
import Anthropic from "@anthropic-ai/sdk";
import { modeInstructions } from "../prompts.js";
import { trackProviderCall } from "./key-status.js";
import { buildProcessInstructions, ProcessInput, ProviderResult } from "./shared.js";

// Only these local messages may reach the UI; SDK errors can contain request data.
export class ClaudeProviderError extends Error {}

export async function processTranscript(input: ProcessInput): Promise<ProviderResult> {
  if (!process.env.ANTHROPIC_API_KEY?.trim()) throw new ClaudeProviderError("ANTHROPIC_API_KEY is not configured.");
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const model = input.model ?? defaultModel("anthropic", "chat");
  try {
    const response = await trackProviderCall("anthropic", () => client.beta.messages.create({
      model,
      max_tokens: /^claude-[23](?:[.-]|$)/.test(model) ? 4096 : 16000,
      system: buildProcessInstructions(input, modeInstructions),
      messages: [{ role: "user", content: input.transcript }],
      // Older Claude families do not accept effort or the newer server fallback beta.
      ...(/^claude-(sonnet|opus)-5-[5-9]/.test(model) ? {
        output_config: { effort: input.task === "protocol" || input.task === "summary" ? "medium" : "low" },
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default" as const
      } : {})
    }));
    if (response.stop_reason === "refusal") throw new ClaudeProviderError("Claude hat die Anfrage abgelehnt.");
    if (response.stop_reason === "max_tokens") throw new ClaudeProviderError("Die Claude-Ausgabe wurde wegen der Tokenbegrenzung abgeschnitten. Bitte den Text kürzen.");
    return {
      text: response.content.filter(block => block.type === "text").map(block => block.text).join("").trim(),
      provider: "Claude",
      model: response.model
    };
  } catch (error) {
    if (error instanceof ClaudeProviderError) throw error;
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
      throw new ClaudeProviderError("Der Claude-API-Schlüssel ist ungültig oder hat keine Berechtigung.");
    }
    if (error instanceof Anthropic.RateLimitError) throw new ClaudeProviderError("Claude ist ausgelastet. Bitte später erneut versuchen.");
    if (error instanceof Anthropic.APIError) throw new ClaudeProviderError(`Claude-Anfrage fehlgeschlagen (HTTP ${error.status ?? "unbekannt"}).`);
    throw new ClaudeProviderError("Verbindung zu Claude fehlgeschlagen. Bitte erneut versuchen.");
  }
}

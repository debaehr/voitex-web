import { isProvider } from "./providers/index.js";
import { defaultModel, isModelId } from "./providers/models.js";
import { defaultPrompts } from "./prompts.js";

export type ModelSelection = { provider: string; model: string };
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
function selection(value: unknown, providers: string[], nullable = false): boolean {
  return nullable && value === null || record(value) && typeof value.provider === "string" && providers.includes(value.provider) && isModelId(value.model);
}
export function validModelSettings(value: Record<string, unknown>): boolean {
  return (value.models === undefined || record(value.models) && Object.values(value.models).every(isModelId)) &&
    (value.dictationStt === undefined || selection(value.dictationStt, ["mistral", "openai", "groq"])) &&
    (value.dictationFallback === undefined || selection(value.dictationFallback, ["mistral", "openai"], true)) &&
    (value.meetingStt === undefined || selection(value.meetingStt, ["mistral", "assemblyai"])) &&
    (value.meetingSttFallback === undefined || selection(value.meetingSttFallback, ["assemblyai"], true));
}
export function deriveModelSettings(value: Record<string, unknown>) {
  const providers = record(value.providers) ? value.providers : {};
  const original = isProvider(providers.original) ? providers.original : "mistral";
  // Legacy Claude modes selected STT according to available keys, never Claude itself.
  const sttProvider = original === "anthropic" ? (process.env.MISTRAL_API_KEY?.trim() ? "mistral" : "openai") : original;
  const meetingProvider = providers.meetings === "assemblyai" ? "assemblyai" : "mistral";
  const textProviders = { ...Object.fromEntries(Object.keys(defaultPrompts).map(mode => [mode, "mistral"])), ...providers };
  if (Array.isArray(value.customModes)) for (const mode of value.customModes) {
    if (record(mode) && typeof mode.id === "string" && isProvider(mode.provider)) textProviders[mode.id] = mode.provider;
  }
  return {
    ...value,
    models: { ...Object.fromEntries(Object.entries(textProviders).filter(([id]) => id !== "meetings").map(([id, provider]) => [id, defaultModel(String(provider), "chat")])), ...(record(value.models) ? value.models as Record<string, string> : {}) },
    dictationStt: (value.dictationStt ?? { provider: sttProvider, model: defaultModel(sttProvider, "stt") }) as ModelSelection,
    dictationFallback: (value.dictationFallback ?? null) as ModelSelection | null,
    meetingStt: (value.meetingStt ?? { provider: meetingProvider, model: defaultModel(meetingProvider, "meetings") }) as ModelSelection,
    // Explicit null must win over the legacy switch; reading never rewrites the file.
    meetingSttFallback: (value.meetingSttFallback !== undefined ? value.meetingSttFallback : value.meetingFallback === true ? { provider: "assemblyai", model: defaultModel("assemblyai", "meetings") } : null) as ModelSelection | null
  };
}

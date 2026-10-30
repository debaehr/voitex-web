import { providerIds, recordProviderResponse, type ProviderId } from "./key-status.js";
import { assemblyModels, isModelId } from "./models.js";
export type ProviderCheck = { provider: ProviderId; model: string };
export type CheckResult = ProviderCheck & { ok: boolean; reason?: string };
const endpoints: Record<ProviderId, string> = {
  mistral: "https://api.mistral.ai/v1/models/", openai: "https://api.openai.com/v1/models/",
  anthropic: "https://api.anthropic.com/v1/models/", groq: "https://api.groq.com/openai/v1/models/",
  assemblyai: "https://api.assemblyai.com/v2/transcript?limit=1"
};
export function validChecks(body: unknown): body is { checks: ProviderCheck[] } {
  if (!body || typeof body !== "object" || !("checks" in body) || !Array.isArray(body.checks) || body.checks.length > 30) return false;
  return body.checks.every(check => check && typeof check === "object" && providerIds.includes(check.provider) && isModelId(check.model));
}
export async function checkProviders(checks: ProviderCheck[]): Promise<CheckResult[]> {
  return Promise.all(checks.map(async check => {
    const key = process.env[`${check.provider.toUpperCase()}_API_KEY`]?.trim();
    if (!key) return { ...check, ok: false, reason: "invalid_key" };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000); timer.unref?.();
    try {
      const url = endpoints[check.provider] + (check.provider === "assemblyai" ? "" : encodeURIComponent(check.model));
      const headers: Record<string, string> = check.provider === "anthropic" ? { "x-api-key": key, "anthropic-version": "2023-06-01" } : { Authorization: check.provider === "assemblyai" ? key : `Bearer ${key}` };
      const response = await fetch(url, { method: "GET", headers, signal: controller.signal, redirect: "error" });
      recordProviderResponse(url, response.status);
      await response.body?.cancel();
      const reason = response.status === 401 || response.status === 403 ? "invalid_key" : response.status === 404 ? "model_unavailable" : !response.ok ? `http_${response.status}` : check.provider === "assemblyai" && !assemblyModels.includes(check.model) ? "model_unavailable" : undefined;
      return { ...check, ok: !reason, ...(reason ? { reason } : {}) };
    } catch { return { ...check, ok: false, reason: controller.signal.aborted ? "timeout" : "network" }; }
    finally { clearTimeout(timer); }
  }));
}

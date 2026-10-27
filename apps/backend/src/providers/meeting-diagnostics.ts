// Only selected JSON fields cross the provider boundary; raw bodies and headers never do.
export function safeDiagnostic(message: string): string {
  for (const name of ["MISTRAL_API_KEY", "ASSEMBLYAI_API_KEY"]) {
    const key = process.env[name]?.trim();
    if (key) message = message.split(key).join("[redacted]");
  }
  return message.replace(/bearer\s+(?!\[redacted\])[^\s(),;"'}]+/gi, "Bearer [redacted]")
    .replace(/(?:sk-|key-|token-)[a-z0-9_-]+/gi, "[redacted]")
    .replace(/((?:api[_ -]?key|token|authorization)\s*[:=]\s*)[^\s,;"'}]+/gi, "$1[redacted]")
    .replace(/[a-z0-9_+\/-]{24,}={0,2}/gi, "[redacted]")
    .replace(/[\r\n\t]+/g, " ").slice(0, 200);
}
export class ProviderDiagnosticError extends Error {}
export function providerError(provider: string, status: number, body: unknown): ProviderDiagnosticError {
  const data = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const nested = data.error && typeof data.error === "object" ? data.error as Record<string, unknown> : {};
  const detail = [nested.type, nested.code, data.code, data.type, nested.message, data.message, data.error]
    .find(value => typeof value === "string" && value.trim());
  return new ProviderDiagnosticError(`${provider}: HTTP ${status}${typeof detail === "string" ? ` (${safeDiagnostic(detail)})` : ""}`);
}
export async function httpProviderError(provider: string, response: Response): Promise<ProviderDiagnosticError> {
  let body: unknown;
  try { body = await response.json(); } catch { /* Non-JSON bodies are never exposed. */ }
  return providerError(provider, response.status, body);
}

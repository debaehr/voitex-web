export const isLongEnough = (seconds: number) => Number.isFinite(seconds) && seconds >= 0.5;
export function normalizeLevel(samples: Uint8Array): number {
  if (!samples.length) return 0;
  const sum = samples.reduce((total, sample) => total + ((sample - 128) / 128) ** 2, 0);
  return Math.min(1, Math.sqrt(sum / samples.length) * 3);
}
export function recorderError(error: unknown): string {
  const name = error && typeof error === "object" && "name" in error ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "Mikrofonzugriff verweigert. Bitte die Berechtigung erlauben.";
  if (name === "NotFoundError" || name === "DevicesNotFoundError") return "Kein Mikrofon gefunden.";
  return error instanceof Error ? error.message : "Aufnahme fehlgeschlagen.";
}

export function readPreference(key: string, allowed: readonly string[], fallback: string): string {
  try {
    const value = localStorage.getItem(key);
    return value && allowed.includes(value) ? value : fallback;
  } catch { return fallback; }
}
export function writePreference(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* Private browsing can deny local storage. */ }
}

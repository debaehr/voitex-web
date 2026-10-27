export const providerIds = ["openai", "mistral", "groq", "assemblyai"] as const;
export type ProviderId = typeof providerIds[number];
const endpoints: Record<ProviderId, string> = {
  openai: "https://api.openai.com/v1/models",
  mistral: "https://api.mistral.ai/v1/models",
  groq: "https://api.groq.com/openai/v1/models",
  assemblyai: "https://api.assemblyai.com/v2/transcript?limit=1"
};
const defaultKeys = () => Object.fromEntries(providerIds.map(id => [id, process.env[`${id.toUpperCase()}_API_KEY`]?.trim()]));
type Options = {
  keys?: () => Partial<Record<ProviderId, string | undefined>>;
  fetch?: typeof fetch;
  setInterval?: typeof setInterval;
  clearInterval?: typeof clearInterval;
  setTimeout?: typeof setTimeout;
  clearTimeout?: typeof clearTimeout;
};

export class KeyStatus {
  private states = new Map<ProviderId, { key: string; invalid: boolean; revision: number }>();
  private interval?: ReturnType<typeof setInterval>;
  constructor(private options: Options = {}) {}
  private state(id: ProviderId) {
    const key = (this.options.keys ?? defaultKeys)()[id]?.trim() ?? "";
    let state = this.states.get(id);
    if (!state || state.key !== key) {
      state = { key, invalid: false, revision: 0 };
      this.states.set(id, state);
    }
    return state;
  }
  invalid(): ProviderId[] {
    return providerIds.filter(id => { const state = this.state(id); return !!state.key && state.invalid; });
  }
  record(id: ProviderId, status: number) {
    const state = this.state(id);
    if (status === 401 || status === 403 || (status >= 200 && status < 300)) {
      state.invalid = status === 401 || status === 403;
      state.revision++;
    }
  }
  async check(): Promise<void> {
    await Promise.all(providerIds.map(async id => {
      const state = this.state(id);
      if (!state.key) return;
      const revision = state.revision;
      const controller = new AbortController();
      const timeout = (this.options.setTimeout ?? setTimeout)(() => controller.abort(), 10_000);
      timeout.unref?.();
      try {
        const response = await (this.options.fetch ?? fetch)(endpoints[id], {
          headers: { Authorization: id === "assemblyai" ? state.key : `Bearer ${state.key}` }, signal: controller.signal
        });
        // A newer real request or changed key must win over a stale background check.
        if (this.state(id) === state && state.revision === revision) this.record(id, response.status);
        await response.body?.cancel();
      } catch { /* Transport errors say nothing about the key's validity. */ }
      finally { (this.options.clearTimeout ?? clearTimeout)(timeout); }
    }));
  }
  start() {
    if (this.interval) return;
    void this.check();
    this.interval = (this.options.setInterval ?? setInterval)(() => { void this.check(); }, 6 * 60 * 60 * 1000);
    this.interval.unref?.();
  }
  stop() {
    if (this.interval) (this.options.clearInterval ?? clearInterval)(this.interval);
    this.interval = undefined;
  }
}
export const keyStatus = new KeyStatus();

export function recordProviderResponse(url: string, status: number) {
  const host = new URL(url).hostname;
  const id = providerIds.find(id => new URL(endpoints[id]).hostname === host);
  if (id) keyStatus.record(id, status);
}

export async function trackProviderCall<T>(id: ProviderId, call: () => Promise<T>): Promise<T> {
  try {
    const result = await call();
    keyStatus.record(id, 200);
    return result;
  } catch (error) {
    if (error && typeof error === "object" && "status" in error && typeof error.status === "number") keyStatus.record(id, error.status);
    throw error;
  }
}

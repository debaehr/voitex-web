import { api } from "./api";
import { mergeWithDefaults } from "./settings";
import type { Providers, Settings } from "./types";
export interface SettingsState {
  status: "loading" | "ready" | "error";
  settings: Settings | null;
  providers: Providers | null;
  defaults: Settings | null;
  error: string | null;
  saving: boolean;
}
type Client = Pick<
  typeof api,
  "getProviders" | "getDefaults" | "getSettings" | "saveSettings"
>;
export class SettingsStore {
  snapshot: SettingsState = {
    status: "loading",
    settings: null,
    providers: null,
    defaults: null,
    error: null,
    saving: false,
  };
  private listeners = new Set<() => void>();
  private loadPromise?: Promise<void>;
  constructor(private client: Client = api) {}
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.snapshot;
  private update(next: Partial<SettingsState>) {
    this.snapshot = { ...this.snapshot, ...next };
    this.listeners.forEach((listener) => listener());
  }
  load = (): Promise<void> => {
    return (this.loadPromise ??= this.loadOnce());
  };
  private async loadOnce() {
    try {
      const [providers, defaults, partial] = await Promise.all([
        this.client.getProviders(),
        this.client.getDefaults(),
        this.client.getSettings(),
      ]);
      this.update({
        status: "ready",
        providers,
        defaults,
        settings: mergeWithDefaults(partial, defaults),
      });
    } catch (error) {
      this.update({
        status: "error",
        error:
          error instanceof Error
            ? error.message
            : "Einstellungen konnten nicht geladen werden.",
      });
    }
  }
  save = async (next: Settings): Promise<void> => {
    if (this.snapshot.status !== "ready")
      throw new Error(
        "Einstellungen sind nicht geladen. Speichern ist gesperrt.",
      );
    if (this.snapshot.saving)
      throw new Error("Es wird bereits gespeichert. Bitte warten.");
    // Keep the submitted snapshot stable while the request is in flight.
    const submitted = structuredClone(next);
    this.update({ saving: true });
    try {
      await this.client.saveSettings(submitted);
      this.update({ settings: submitted });
    } finally {
      this.update({ saving: false });
    }
  };
}

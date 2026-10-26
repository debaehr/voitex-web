import { api } from "./api";
import type { HistoryEntry } from "./types";
type Client = Pick<typeof api, "getHistory" | "addHistory" | "deleteHistory" | "clearHistory">;
interface HistoryState {
  entries: HistoryEntry[]; status: "loading" | "ready" | "error"; error: string | null; busy: boolean;
}
export class HistoryStore {
  private snapshot: HistoryState = { entries: [], status: "loading", error: null, busy: false };
  private listeners = new Set<() => void>();
  private loadPromise?: Promise<void>;
  constructor(private client: Client = api) {}
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  getSnapshot = () => this.snapshot;
  private update(next: Partial<HistoryState>) {
    this.snapshot = { ...this.snapshot, ...next }; this.listeners.forEach(listener => listener());
  }
  load = () => this.loadPromise ??= this.loadOnce();
  private async loadOnce() {
    try { this.update({ entries: await this.client.getHistory(), status: "ready" }); }
    catch { this.update({ status: "error", error: "Verlauf konnte nicht geladen werden" }); }
  }
  private async mutate(task: () => Promise<unknown>, update: (entries: HistoryEntry[]) => HistoryEntry[]) {
    await this.load();
    if (this.snapshot.status !== "ready") throw new Error("Verlauf konnte nicht geladen werden");
    if (this.snapshot.busy) throw new Error("Verlauf wird gerade gespeichert. Bitte erneut versuchen.");
    this.update({ busy: true, error: null });
    try {
      await task(); this.update({ entries: update(this.snapshot.entries) });
    } catch (error) {
      this.update({ error: error instanceof Error ? error.message : "Verlauf konnte nicht gespeichert werden." });
      throw error;
    } finally { this.update({ busy: false }); }
  }
  add = (entry: HistoryEntry) => this.mutate(() => this.client.addHistory(entry), entries => [entry, ...entries.filter(item => item.id !== entry.id)]);
  remove = (id: string) => this.mutate(() => this.client.deleteHistory(id), entries => entries.filter(entry => entry.id !== id));
  clear = () => this.mutate(() => this.client.clearHistory(), () => []);
}

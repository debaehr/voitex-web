import { it, expect, vi } from "vitest";
import { filterHistory, sortHistory, exportHistory } from "../src/lib/history";
import { HistoryStore } from "../src/lib/history-store";
import type { HistoryEntry } from "../src/lib/types";
const older: HistoryEntry = { id: "a", createdAt: "2026-01-01T10:00:00Z", mode: "formal", provider: "OpenAI", durationSeconds: 2, text: "Älterer Text", raw: "raw" };
const newer = { ...older, id: "b", createdAt: "2026-02-01T10:00:00Z", mode: "coding" as const, text: "Neuer Text" };
it("filters case-insensitively and sorts dates without mutation", () => {
  const entries = [older, newer];
  expect(filterHistory(entries, " ÄLTER ")).toEqual([older]);
  expect(filterHistory(entries, "")).toEqual(entries);
  expect(filterHistory(entries, "missing")).toEqual([]);
  expect(sortHistory(entries, true)).toEqual([newer, older]);
  expect(sortHistory(entries, false)).toEqual(entries);
  expect(entries[0]).toBe(older);
});
it("exports newest first with dates, labels and final text", () => {
  const exported = exportHistory([older, newer]);
  expect(exported.indexOf("Neuer Text")).toBeLessThan(exported.indexOf("Älterer Text"));
  expect(exported).toContain("Coding"); expect(exported).toContain("2026");
  expect(exported).not.toContain("raw"); expect(exportHistory([])).toBe("");
});
const client = () => ({ getHistory: vi.fn(async () => [older]), addHistory: vi.fn(async (_entry: HistoryEntry) => ({ ok: true as const })), deleteHistory: vi.fn(async (_id: string) => ({ ok: true as const })), clearHistory: vi.fn(async () => ({ ok: true as const })) });
it("loads once and changes state only after successful server writes", async () => {
  const api = client(), store = new HistoryStore(api);
  await Promise.all([store.load(), store.load()]);
  expect(api.getHistory).toHaveBeenCalledTimes(1);
  api.addHistory.mockRejectedValueOnce(new Error("Save failed"));
  await expect(store.add(newer)).rejects.toThrow("Save failed");
  expect(store.getSnapshot().entries).toEqual([older]);
  await store.add(newer); expect(store.getSnapshot().entries).toEqual([newer, older]);
  api.deleteHistory.mockRejectedValueOnce(new Error("Delete failed"));
  await expect(store.remove(older.id)).rejects.toThrow(); expect(store.getSnapshot().entries).toHaveLength(2);
  await store.remove(older.id); expect(store.getSnapshot().entries).toEqual([newer]);
  api.clearHistory.mockRejectedValueOnce(new Error("Clear failed"));
  await expect(store.clear()).rejects.toThrow(); expect(store.getSnapshot().entries).toEqual([newer]);
  await store.clear(); expect(store.getSnapshot().entries).toEqual([]);
});
it("keeps failed load distinct from empty history and blocks writes", async () => {
  const api = client(); api.getHistory.mockRejectedValue(new Error("Load failed"));
  const store = new HistoryStore(api); await store.load();
  expect(store.getSnapshot().status).toBe("error");
  expect(store.getSnapshot().error).toContain("Verlauf konnte nicht geladen werden");
  await expect(store.clear()).rejects.toThrow();
  await expect(store.add(newer)).rejects.toThrow();
  expect(api.clearHistory).not.toHaveBeenCalled(); expect(api.addHistory).not.toHaveBeenCalled();
});
it("publishes no premature changes while server response is pending", async () => {
  const api = client(), store = new HistoryStore(api); await store.load();
  let finish!: () => void;
  api.addHistory.mockImplementation(() => new Promise(resolve => { finish = () => resolve({ ok: true }); }));
  const task = store.add(newer); await Promise.resolve();
  expect(store.getSnapshot().entries).toEqual([older]);
  expect(store.getSnapshot().busy).toBe(true);
  finish(); await task;
  expect(store.getSnapshot().entries).toEqual([newer, older]);
});

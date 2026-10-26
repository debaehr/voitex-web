import { describe, it, expect, vi } from "vitest";
import { SettingsStore } from "../src/lib/settings-store";
import type { Settings } from "../src/lib/types";
const values = {
  original: "openai",
  casual: "openai",
  formal: "openai",
  coding: "openai",
  protocol: "openai",
  summary: "openai",
} as const;
const defaults: Settings = {
  version: 1,
  providers: { ...values },
  prompts: { ...values },
  lexicon: [],
  snippets: [],
  ownSpeakerName: "Ich",
};
function client() {
  return {
    getProviders: vi
      .fn()
      .mockResolvedValue({ stt: [], llm: [], meetings: false }),
    getDefaults: vi.fn().mockResolvedValue(defaults),
    getSettings: vi.fn().mockResolvedValue({}),
    saveSettings: vi.fn().mockResolvedValue({ ok: true }),
  };
}
describe("confirmed settings store", () => {
  it("loads once and merges defaults", async () => {
    const api = client(),
      store = new SettingsStore(api);
    await Promise.all([store.load(), store.load()]);
    expect(api.getSettings).toHaveBeenCalledTimes(1);
    expect(store.snapshot.status).toBe("ready");
    expect(store.snapshot.settings).toEqual(defaults);
  });
  it("blocks saves after load failure", async () => {
    const api = client();
    api.getSettings.mockRejectedValue(new Error("Lesefehler"));
    const store = new SettingsStore(api);
    await store.load();
    expect(store.snapshot.status).toBe("error");
    await expect(store.save(defaults)).rejects.toThrow();
    expect(api.saveSettings).not.toHaveBeenCalled();
  });
  it("keeps confirmed state after failed save", async () => {
    const api = client(),
      store = new SettingsStore(api);
    await store.load();
    api.saveSettings.mockRejectedValue(new Error("Schreibfehler"));
    await expect(
      store.save({ ...defaults, ownSpeakerName: "Neu" }),
    ).rejects.toThrow("Schreibfehler");
    expect(store.snapshot.settings?.ownSpeakerName).toBe("Ich");
    expect(store.snapshot.saving).toBe(false);
  });
  it("updates only after success and rejects simultaneous writes", async () => {
    const api = client(),
      store = new SettingsStore(api);
    await store.load();
    let resolve!: (value: { ok: true }) => void;
    api.saveSettings.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const next = { ...defaults, ownSpeakerName: "Neu" };
    const save = store.save(next);
    next.ownSpeakerName = "Später";
    expect(store.snapshot.settings?.ownSpeakerName).toBe("Ich");
    await expect(store.save(defaults)).rejects.toThrow("gespeichert");
    resolve({ ok: true });
    await save;
    expect(store.snapshot.settings?.ownSpeakerName).toBe("Neu");
  });
});

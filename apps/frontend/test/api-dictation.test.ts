import { afterEach, expect, it, vi } from "vitest";
import { api } from "../src/lib/api";
import { readPreference, writePreference } from "../src/lib/device-preferences";
afterEach(() => vi.unstubAllGlobals());
it("posts multipart audio with provider, mode, auto language and optional prompt", async () => {
  const fetch = vi.fn(async () => new Response(JSON.stringify({ transcript: "Text", provider: "OpenAI" })));
  vi.stubGlobal("fetch", fetch);
  const audio = new Blob(["audio"], { type: "audio/mp4" });
  await api.transcribe({ audio, mode: "formal", provider: "openai", language: "auto", prompt: "Voitex" });
  const [path, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
  expect(path).toBe("/api/transcribe"); expect(init.method).toBe("POST");
  const form = init.body as FormData;
  expect(form.get("provider")).toBe("openai"); expect(form.get("mode")).toBe("formal");
  expect(form.get("language")).toBe("auto"); expect(form.get("prompt")).toBe("Voitex");
  expect((form.get("audio") as File).name).toBe("recording.mp4");
  expect((form.get("audio") as File).size).toBe(audio.size);
});
it("posts processing input without dropping the custom instructions", async () => {
  const fetch = vi.fn(async () => new Response(JSON.stringify({ processed: "Final", provider: "OpenAI" })));
  vi.stubGlobal("fetch", fetch);
  const input = { transcript: "Raw", mode: "original" as const, provider: "openai" as const, instructions: "Clean" };
  expect(await api.process(input)).toEqual({ processed: "Final", provider: "OpenAI" });
  const [path, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
  expect(path).toBe("/api/process"); expect(JSON.parse(init.body as string)).toEqual(input);
});
it("keeps device choices and survives inaccessible local storage", () => {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (key: string) => values.get(key), setItem: (key: string, value: string) => values.set(key, value) });
  writePreference("mode", "formal");
  expect(readPreference("mode", ["original", "formal"], "original")).toBe("formal");
  values.set("mode", "invalid");
  expect(readPreference("mode", ["original", "formal"], "original")).toBe("original");
  vi.stubGlobal("localStorage", { getItem: () => { throw Error("Denied"); }, setItem: () => { throw Error("Denied"); } });
  expect(() => writePreference("mode", "formal")).not.toThrow();
  expect(readPreference("mode", ["formal"], "formal")).toBe("formal");
});

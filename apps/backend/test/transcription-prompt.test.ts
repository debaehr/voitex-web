import { afterEach, describe, expect, it, vi } from "vitest";
import { type Server } from "node:http";
const { transcribe } = vi.hoisted(() => ({ transcribe: vi.fn(async () => ({ text: "text", provider: "OpenAI", model: "mock" })) }));
vi.mock("../src/providers/index.js", async importOriginal => ({
  ...await importOriginal<typeof import("../src/providers/index.js")>(), transcribeAudio: transcribe,
}));
import { createApp } from "../src/app.js";
let server: Server | undefined;
afterEach(async () => {
  vi.clearAllMocks();
  if (server) await new Promise<void>(resolve => { server!.close(() => resolve()); server!.closeAllConnections(); });
});
async function send(provider: string, prompt?: string | string[]) {
  server = createApp({ dataDir: "/tmp/voitex-unused-prompt-test", frontendDir: "/tmp/voitex-unused-prompt-test" }).listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server!.once("listening", resolve));
  const address = server.address(); if (!address || typeof address === "string") throw new Error("address");
  const form = new FormData();
  form.append("audio", new Blob(["audio"]), "test.webm"); form.append("provider", provider); form.append("language", "auto");
  for (const part of Array.isArray(prompt) ? prompt : prompt === undefined ? [] : [prompt]) form.append("prompt", part);
  return fetch(`http://127.0.0.1:${address.port}/api/transcribe`, { method: "POST", body: form });
}
describe("transcription prompt", () => {
  it("trims optional OpenAI prompt", async () => {
    expect((await send("openai", "  Voitex, Fachwort  ")).status).toBe(200);
    expect(transcribe).toHaveBeenCalledWith("openai", expect.objectContaining({ prompt: "Voitex, Fachwort", language: "auto" }));
  });
  it.each([undefined, "   "])("omits empty prompt %s", async prompt => {
    expect((await send("openai", prompt)).status).toBe(200);
    expect(transcribe.mock.calls[0][1]).not.toHaveProperty("prompt");
  });
  it.each(["groq", "mistral"])("ignores prompt for %s", async provider => {
    expect((await send(provider, "term")).status).toBe(200);
    expect(transcribe.mock.calls[0][1]).not.toHaveProperty("prompt");
  });
  it("accepts exactly 1000 trimmed characters", async () => {
    expect((await send("openai", " " + "a".repeat(1000) + " ")).status).toBe(200);
  });
  it.each(["a".repeat(1001), ["a", "b"]])("rejects invalid prompt", async prompt => {
    expect((await send("openai", prompt)).status).toBe(400);
    expect(transcribe).not.toHaveBeenCalled();
  });
});

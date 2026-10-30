import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ProcessInput } from "../src/providers/shared.js";
const sdk = vi.hoisted(() => ({ options: vi.fn(), transcribe: vi.fn(async () => ({ text: "Transcript" })), process: vi.fn(async () => ({ output_text: "Result" })) }));
vi.mock("openai", () => ({
  default: class {
    constructor(options: unknown) { sdk.options(options); }
    audio = { transcriptions: { create: sdk.transcribe } };
    responses = { create: sdk.process };
  },
  toFile: vi.fn(async () => "file")
}));
import * as openai from "../src/providers/openai.js";
import * as mistral from "../src/providers/mistral.js";
import * as groq from "../src/providers/groq.js";
beforeEach(() => {
  vi.clearAllMocks();
  for (const provider of ["OPENAI", "MISTRAL", "GROQ"]) vi.stubEnv(`${provider}_API_KEY`, "test-key");
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
const tasks: Array<[string, Partial<ProcessInput>, number]> = [
  ["default dictation", {}, 180_000],
  ["dictation", { task: "dictation" }, 180_000],
  ["translation", { targetLanguage: "hr" }, 180_000],
  ["legacy translation", { translateToEnglish: true }, 180_000],
  ["protocol", { task: "protocol" }, 900_000],
  ["summary", { task: "summary" }, 900_000]
];
it.each(tasks)("gives OpenAI %s its task timeout and keeps SDK default retries", async (_, task, timeout) => {
  await openai.processTranscript({ transcript: "Text", mode: "formal", ...task });
  expect(sdk.options).toHaveBeenCalledWith({ apiKey: "test-key", timeout });
  expect(sdk.options.mock.calls[0][0]).not.toHaveProperty("maxRetries");
  expect(sdk.process).toHaveBeenCalledOnce();
});
for (const [name, provider] of [["Mistral", mistral], ["Groq", groq]] as const) {
  it.each(tasks)(`gives ${name} %s its task timeout through fetch`, async (_, task, timeoutMs) => {
    const signal = new AbortController().signal;
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(signal);
    const fetch = vi.fn(async () => Response.json({ choices: [{ message: { content: "Result" } }] }));
    vi.stubGlobal("fetch", fetch);
    await provider.processTranscript({ transcript: "Text", mode: "formal", ...task });
    expect(timeout).toHaveBeenCalledExactlyOnceWith(timeoutMs);
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/chat/completions"), expect.objectContaining({ signal }));
  });
  it(`bounds ${name} dictation STT at 120 seconds`, async () => {
    const signal = new AbortController().signal;
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(signal);
    const fetch = vi.fn(async () => Response.json({ text: "Transcript" }));
    vi.stubGlobal("fetch", fetch);
    await provider.transcribeAudio({ buffer: Buffer.from("audio"), filename: "audio.webm", mimetype: "audio/webm" });
    expect(timeout).toHaveBeenCalledExactlyOnceWith(120_000);
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/audio/transcriptions"), expect.objectContaining({ signal }));
  });
}
it("bounds OpenAI dictation STT at 120 seconds with no retries", async () => {
  await openai.transcribeAudio({ buffer: Buffer.from("audio"), filename: "audio.webm", mimetype: "audio/webm" });
  expect(sdk.options).toHaveBeenCalledWith({ apiKey: "test-key", timeout: 120_000, maxRetries: 0 });
  expect(sdk.transcribe).toHaveBeenCalledOnce();
});

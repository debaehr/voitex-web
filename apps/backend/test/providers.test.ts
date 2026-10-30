import { modeInstructions } from "../src/prompts.js";
import { afterEach, expect, it, vi } from "vitest";
const { create, respond } = vi.hoisted(() => ({ create: vi.fn(async () => ({ text: "transcript" })), respond: vi.fn(async () => ({ output_text: "Final" })) }));
vi.mock("openai", () => ({ default: class { responses = { create: respond }; audio = { transcriptions: { create } }; }, toFile: vi.fn(async () => "file") }));
import * as openai from "../src/providers/openai.js";
import * as mistral from "../src/providers/mistral.js";
import * as groq from "../src/providers/groq.js";
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.clearAllMocks(); });
for (const [name, provider] of Object.entries({ openai, mistral, groq })) {
  it.each([undefined, "", "auto", "en", "de"])(`${name} sends only explicit STT languages (%s)`, async language => {
    vi.stubEnv(`${name.toUpperCase()}_API_KEY`, "test-key");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ text: "transcript" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await provider.transcribeAudio({ buffer: Buffer.from("audio"), filename: "test.webm", mimetype: "audio/webm", language });
    const expected = language && language !== "auto" ? language : undefined;
    if (name === "openai") {
      const body = create.mock.calls[0] as unknown as [Record<string, unknown>];
      expect(body[0].language).toBe(expected);
      if (!expected) expect(body[0]).not.toHaveProperty("language");
    } else {
      const call = fetchMock.mock.calls[0] as unknown as [string, { body: FormData }];
      expect(call[1].body.get("language")).toBe(expected ?? null);
    }
  });
}

it("passes prompt to the OpenAI SDK transcription request", async () => {
  vi.stubEnv("OPENAI_API_KEY", "test-key");
  await openai.transcribeAudio({ buffer: Buffer.from("audio"), filename: "test.webm", mimetype: "audio/webm", prompt: "Marcus Hinzen, Voitex" });
  expect(create).toHaveBeenCalledWith(expect.objectContaining({ prompt: "Marcus Hinzen, Voitex" }));
});

it.each([{ contextBias: [] }, { contextBias: [" Voitex ", "voitex", "", "Anna Marcus,Hinzen", "marcus\tHINZEN", ...Array.from({ length: 110 }, (_, n) => `Term${n}`)] }])("sends repeated bounded context_bias fields for Mistral dictation", async ({ contextBias }) => {
  vi.stubEnv("MISTRAL_API_KEY", "test-key");
  const request = vi.fn(async () => new Response(JSON.stringify({ text: "transcript" })));
  vi.stubGlobal("fetch", request);
  await mistral.transcribeAudio({ buffer: Buffer.from("audio"), filename: "test.webm", mimetype: "audio/webm", contextBias });
  const form = (request.mock.calls[0] as unknown as [string, { body: FormData }])[1].body;
  expect(form.get("model")).toBe("voxtral-mini-latest");
  expect(form.getAll("context_bias")).toHaveLength(contextBias.length ? 100 : 0);
  if (contextBias.length) expect(form.getAll("context_bias").slice(0, 4)).toEqual(["Voitex", "Anna", "Marcus", "Hinzen"]);
  expect(form.getAll("context_bias").every(term => typeof term === "string" && !/[\s,]/.test(term))).toBe(true);
});

for (const [name, provider] of Object.entries({ openai, mistral, groq })) {
  it.each(["de", "en", "hr", "source", undefined] as const)(`${name} uses shared processing instructions for %s`, async targetLanguage => {
    vi.stubEnv(`${name.toUpperCase()}_API_KEY`, "test-key");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: "Final" } }] })));
    vi.stubGlobal("fetch", fetchMock);
    const input = { transcript: "Raw", mode: "formal" as const, instructions: "Custom", targetLanguage };
    const { buildProcessInstructions } = await import("../src/providers/shared.js");
    await provider.processTranscript(input);
    if (name === "openai") {
      expect(respond).toHaveBeenCalledWith(expect.objectContaining({ instructions: buildProcessInstructions(input, modeInstructions) }));
    } else {
      const call = fetchMock.mock.calls[0] as unknown as [string, { body: string }];
      expect(JSON.parse(call[1].body).messages[0].content).toBe(buildProcessInstructions(input, modeInstructions));
    }
  });
}

for (const [name, provider] of Object.entries({ openai, mistral, groq })) {
  it.each([undefined, "dictation", "protocol", "summary"] as const)(`${name} uses the task token limit for %s`, async task => {
    vi.stubEnv(`${name.toUpperCase()}_API_KEY`, "dummy-key");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: "Final" } }] })));
    vi.stubGlobal("fetch", fetchMock);
    await provider.processTranscript({ transcript: "Text", mode: "formal", task });
    const limit = task === "protocol" || task === "summary" ? 8000 : 4000;
    if (name === "openai") expect(respond).toHaveBeenCalledWith(expect.objectContaining({ max_output_tokens: limit }));
    else expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toHaveProperty("max_tokens", limit);
  });
}


it.each(["transcribe", "process"])("OpenAI %s records real SDK rejection and recovery", async kind => {
  const { keyStatus } = await import("../src/providers/key-status.js");
  vi.stubEnv("OPENAI_API_KEY", "dummy-status");
  const method = kind === "transcribe" ? create : respond;
  method.mockRejectedValueOnce(Object.assign(new Error("rejected"), { status: 401 }));
  const call = () => kind === "transcribe"
    ? openai.transcribeAudio({ buffer: Buffer.from("audio"), filename: "test.webm", mimetype: "audio/webm" })
    : openai.processTranscript({ transcript: "Text", mode: "formal" });
  await expect(call()).rejects.toMatchObject({ status: 401 });
  expect(keyStatus.invalid()).toContain("openai");
  await call(); expect(keyStatus.invalid()).not.toContain("openai");
});

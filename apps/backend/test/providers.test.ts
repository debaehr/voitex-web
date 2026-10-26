import { afterEach, expect, it, vi } from "vitest";
const { create } = vi.hoisted(() => ({ create: vi.fn(async () => ({ text: "transcript" })) }));
vi.mock("openai", () => ({ default: class { audio = { transcriptions: { create } }; }, toFile: vi.fn(async () => "file") }));
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

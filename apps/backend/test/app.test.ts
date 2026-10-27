import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Server } from "node:http";
import { createApp } from "../src/app.js";
import { DEFAULT_UPLOAD_LIMIT_BYTES } from "../src/routes/api.js";
import { defaultPrompts } from "../src/prompts.js";

let dir: string;
const servers: Server[] = [];
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), "voitex-test-")); });
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
    server.closeAllConnections();
  })));
  vi.unstubAllEnvs();
  await rm(dir, { recursive: true, force: true });
});
async function start(options = {}) {
  const server = createApp({ dataDir: join(dir, "data"), frontendDir: join(dir, "frontend"), ...options }).listen(0, "127.0.0.1");
  servers.push(server);
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing address");
  const base = `http://127.0.0.1:${address.port}`;
  return (path: string, method = "GET", body?: unknown) => fetch(base + path, {
    method, ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
  });
}
const modes = ["original", "casual", "formal", "coding", "protocol", "summary"];
function settings() {
  return { version: 1, providers: Object.fromEntries(modes.map(mode => [mode, "openai"])), prompts: defaultPrompts, lexicon: [], snippets: [], ownSpeakerName: "Ich" };
}

describe("API and frontend", () => {
  it("reports configured providers without disclosing keys", async () => {
    const request = await start();
    for (const key of ["OPENAI_API_KEY", "MISTRAL_API_KEY", "GROQ_API_KEY", "ASSEMBLYAI_API_KEY"]) vi.stubEnv(key, "");
    expect(await (await request("/api/providers")).json()).toEqual({ stt: [], llm: [], meetings: [] });
    vi.stubEnv("OPENAI_API_KEY", "secret-openai"); vi.stubEnv("GROQ_API_KEY", "secret-groq"); vi.stubEnv("ASSEMBLYAI_API_KEY", "secret-meeting");
    expect(await (await request("/api/providers")).json()).toEqual({ stt: ["openai", "groq"], llm: ["openai", "groq"], meetings: ["assemblyai"] });
    vi.stubEnv("MISTRAL_API_KEY", "secret-mistral");
    const available = await (await request("/api/providers")).json();
    expect(available.stt).toEqual(["openai", "mistral", "groq"]);
    expect(available.meetings).toEqual(["mistral", "assemblyai"]);
  });
  it("serves SPA, static files and cache policies while keeping API JSON", async () => {
    await mkdir(join(dir, "frontend/assets"), { recursive: true });
    for (const file of ["index.html", "sw.js", "manifest.webmanifest", "assets/app.js"]) await writeFile(join(dir, "frontend", file), file === "index.html" ? "<html>SPA</html>" : "asset");
    const request = await start();
    for (const path of ["/some/path", "/index.html", "/sw.js", "/manifest.webmanifest"]) {
      const response = await request(path);
      expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-cache");
      if (path === "/some/path") expect(await response.text()).toBe("<html>SPA</html>");
    }
    expect((await request("/assets/app.js")).headers.get("cache-control")).toContain("immutable");
    expect(await (await request("/api/health")).json()).toEqual({ ok: true });
    const missing = await request("/api/unknown"); expect(missing.status).toBe(404); expect(await missing.json()).toHaveProperty("error");
  });
  it("honors environment directory overrides", async () => {
    const dataDir = join(dir, "env-data");
    const frontendDir = join(dir, "env-frontend");
    vi.stubEnv("VOITEX_DATA_DIR", dataDir);
    vi.stubEnv("VOITEX_FRONTEND_DIR", frontendDir);
    await mkdir(frontendDir);
    await writeFile(join(frontendDir, "index.html"), "environment frontend");
    const request = await start({ dataDir: undefined, frontendDir: undefined });
    expect(await (await request("/nested/path")).text()).toBe("environment frontend");
    expect((await request("/api/settings", "PUT", settings())).status).toBe(200);
    expect(JSON.parse(await readFile(join(dataDir, "settings.json"), "utf8"))).toEqual(settings());
  });
  it("isolates data between app instances", async () => {
    const first = await start();
    const second = await start({ dataDir: join(dir, "second-data") });
    await first("/api/history", "POST", { id: "first", text: "Only first app" });
    expect(await (await second("/api/history")).json()).toEqual([]);
    expect(await (await first("/api/history")).json()).toEqual([{ id: "first", text: "Only first app" }]);
  });
  it("returns 503 without a frontend build, but keeps API working", async () => {
    const request = await start(); expect((await request("/some/path")).status).toBe(503);
    expect((await request("/api/health")).status).toBe(200);
  });
  it.each(["/api/transcribe"])("rejects oversized audio as JSON at %s", async path => {
    expect(DEFAULT_UPLOAD_LIMIT_BYTES).toBe(200 * 1024 * 1024);
    const server = createApp({ dataDir: dir, frontendDir: dir, uploadLimitBytes: 32 }).listen(0, "127.0.0.1"); servers.push(server);
    await new Promise<void>(resolve => server.once("listening", resolve));
    const address = server.address(); if (!address || typeof address === "string") throw new Error("address");
    const form = new FormData(); form.append("audio", new Blob([new Uint8Array(33)]), "test.webm");
    const response = await fetch(`http://127.0.0.1:${address.port}${path}`, { method: "POST", body: form });
    expect(response.status).toBe(413); expect(await response.json()).toEqual({ error: "Payload too large." });
  });
});

describe("settings", () => {
  it("returns the complete default shape and persists atomically with backup", async () => {
    const request = await start(); expect(await (await request("/api/settings/defaults")).json()).toEqual({ ...settings(), providers: { ...settings().providers, meetings: "mistral" }, customModes: [], hiddenModes: [] });
    expect(Object.keys(defaultPrompts)).toEqual(modes);
    expect(Object.values(defaultPrompts).every(value => typeof value === "string" && value.length > 0)).toBe(true);
    expect((await request("/api/settings", "PUT", settings())).status).toBe(200);
    const updated = { ...settings(), ownSpeakerName: "Test" };
    expect((await request("/api/settings", "PUT", updated)).status).toBe(200);
    expect(await (await request("/api/settings")).json()).toEqual(updated);
    expect(JSON.parse(await readFile(join(dir, "data/settings.json.bak"), "utf8"))).toEqual(settings());
  });
  it.each([null, [], {}, { ...settings(), version: "1" }, { ...settings(), providers: { ...settings().providers, casual: "invalid" } }, { ...settings(), providers: {} }, { ...settings(), prompts: { ...defaultPrompts, formal: 2 } }, { ...settings(), lexicon: {} }, { ...settings(), snippets: null }, { ...settings(), ownSpeakerName: 1 }])("rejects invalid settings %#", async body => {
    const request = await start(); const response = await request("/api/settings", "PUT", body);
    expect(response.status).toBe(400); expect(await response.json()).toHaveProperty("error");
  });
  it("accepts JSON bodies larger than the previous 1 MB limit", async () => {
    const request = await start(); expect((await request("/api/settings", "PUT", { ...settings(), ownSpeakerName: "x".repeat(1100000) })).status).toBe(200);
  });
});

describe("custom dictation modes", () => {
  const custom = { id: "custom-12345678-1234-1234-1234-123456789abc", label: "Kundenmail", description: "Antwort an Kunden", prompt: "Schreibe eine E-Mail.", provider: "openai" };
  it("loads and round-trips the exact pre-F-013 settings shape unchanged", async () => {
    const legacy = settings();
    const serialized = JSON.stringify(legacy, null, 2);
    await mkdir(join(dir, "data"));
    await writeFile(join(dir, "data/settings.json"), serialized);
    const request = await start();
    const loaded = await (await request("/api/settings")).json();
    expect(loaded).toEqual(legacy);
    expect(await readFile(join(dir, "data/settings.json"), "utf8")).toBe(serialized);
    expect((await request("/api/settings", "PUT", loaded)).status).toBe(200);
    expect(await (await request("/api/settings")).json()).toEqual(legacy);
    expect(JSON.parse(await readFile(join(dir, "data/settings.json"), "utf8"))).toEqual(legacy);
  });
  it.each([
    { customModes: [], hiddenModes: [] },
    { customModes: [custom] },
    { customModes: [{ ...custom, description: undefined }] },
    { hiddenModes: ["original", "coding"] },
    { hiddenModes: ["original", "casual", "formal", "coding"], customModes: [custom] },
    { customModes: [{ ...custom, label: "x".repeat(40), description: "x".repeat(120), prompt: "x".repeat(8000) }] },
    { customModes: Array.from({ length: 20 }, (_, i) => ({ ...custom, id: `custom-12345678-1234-1234-1234-${String(i).padStart(12, "0")}`, label: `Mode ${i}` })) },
  ])("persists valid additive fields %#", async fields => {
    const request = await start();
    const next = JSON.parse(JSON.stringify({ ...settings(), ...fields }));
    expect((await request("/api/settings", "PUT", next)).status).toBe(200);
    expect(await (await request("/api/settings")).json()).toEqual(next);
  });
  it.each([
    { customModes: null }, { customModes: {} }, { customModes: [null] },
    ...["", "   ", "x".repeat(41), 1].map(label => ({ customModes: [{ ...custom, label }] })),
    ...["", "   ", "x".repeat(8001), 1].map(prompt => ({ customModes: [{ ...custom, prompt }] })),
    ...["x".repeat(121), null, 1].map(description => ({ customModes: [{ ...custom, description }] })),
    ...["formal", "custom-invalid", 1].map(id => ({ customModes: [{ ...custom, id }] })),
    { customModes: [{ ...custom, provider: "invalid" }] },
    { customModes: [custom, { ...custom, label: "Other" }] },
    { customModes: [custom, { ...custom, id: "custom-87654321-1234-1234-1234-123456789abc", label: " KUNDENMAIL " }] },
    { customModes: Array.from({ length: 21 }, (_, i) => ({ ...custom, id: `custom-12345678-1234-1234-1234-${String(i).padStart(12, "0")}`, label: `Mode ${i}` })) },
    { hiddenModes: null }, { hiddenModes: "formal" }, { hiddenModes: ["protocol"] },
    { hiddenModes: [custom.id] }, { hiddenModes: ["formal", "formal"] },
    { hiddenModes: ["original", "casual", "formal", "coding"] },
  ])("rejects invalid mode settings as JSON without overwriting existing settings %#", async fields => {
    const request = await start();
    await request("/api/settings", "PUT", settings());
    const response = await request("/api/settings", "PUT", { ...settings(), ...fields });
    expect(response.status).toBe(400);
    expect(await response.json()).toHaveProperty("error");
    expect(await (await request("/api/settings")).json()).toEqual(settings());
  });
  it("preserves legacy history and accepts custom ids with recorded labels", async () => {
    const old = { id: "old", createdAt: "2026-10-27", mode: "formal", provider: "OpenAI", durationSeconds: 2, text: "Old", raw: "Raw" };
    const serialized = JSON.stringify([old], null, 2);
    await mkdir(join(dir, "data"));
    await writeFile(join(dir, "data/history.json"), serialized);
    const request = await start();
    expect(await (await request("/api/history")).json()).toEqual([old]);
    expect(await readFile(join(dir, "data/history.json"), "utf8")).toBe(serialized);
    const entry = { ...old, id: "new", mode: custom.id, modeLabel: "x".repeat(80), targetLanguage: "hr" };
    expect((await request("/api/history", "POST", entry)).status).toBe(200);
    expect(await (await request("/api/history")).json()).toEqual([old, entry]);
  });
  it.each([null, 42, "x".repeat(81)])("rejects invalid history modeLabel %j on POST and legacy PUT", async modeLabel => {
    const request = await start();
    const entry = { id: "new", text: "Text", mode: custom.id, modeLabel };
    for (const method of ["POST", "PUT"]) {
      const response = await request("/api/history", method, method === "PUT" ? [entry] : entry);
      expect(response.status).toBe(400);
      expect(await response.json()).toHaveProperty("error");
    }
  });
});

describe("history", () => {
  it.each([{}, [], { id: "a" }, { id: " ", text: "text" }, { id: "a", text: " " }, { id: "a", text: "text", durationSeconds: "2" }, ...["mode", "provider", "createdAt", "raw"].map(key => ({ id: "a", text: "text", [key]: 1 }))])("validates entries %#", async body => {
    const request = await start(); const response = await request("/api/history", "POST", body);
    expect(response.status).toBe(400); expect(await response.json()).toHaveProperty("error");
  });
  it("appends idempotently and deletes individual entries including unknown IDs", async () => {
    const request = await start(); const entry = { id: "a", text: "Final", raw: "Raw", mode: "original", provider: "OpenAI", createdAt: "2026-10-26", durationSeconds: 12 };
    expect((await request("/api/history", "POST", entry)).status).toBe(200);
    expect((await request("/api/history", "POST", { ...entry, text: "retry" })).status).toBe(200);
    expect(await (await request("/api/history")).json()).toEqual([entry]);
    expect(await (await request("/api/history/a", "DELETE")).json()).toEqual({ ok: true });
    expect(await (await request("/api/history")).json()).toEqual([]);
    const response = await request("/api/history/a", "DELETE"); expect(response.status).toBe(404); expect(await response.json()).toHaveProperty("error");
  });
  it("serializes concurrent POST and DELETE without losing unrelated writes", async () => {
    const request = await start();
    for (let i = 0; i < 10; i++) await request("/api/history", "POST", { id: `old-${i}`, text: "old" });
    const responses = await Promise.all(Array.from({ length: 20 }, (_, i) => i < 10 ? request(`/api/history/old-${i}`, "DELETE") : request("/api/history", "POST", { id: `new-${i}`, text: "new" })));
    expect(responses.every(response => response.status === 200)).toBe(true);
    const result = await (await request("/api/history")).json();
    expect(result.map((entry: { id: string }) => entry.id).sort()).toEqual(Array.from({ length: 10 }, (_, i) => `new-${i + 10}`).sort());
  });
  it("retains whole-history PUT and DELETE", async () => {
    const request = await start(); const entries = [{ id: "legacy", transcript: "preserved" }];
    expect((await request("/api/history", "PUT", entries)).status).toBe(200);
    expect(await (await request("/api/history")).json()).toEqual(entries);
    expect((await request("/api/history", "DELETE")).status).toBe(200);
    expect(await (await request("/api/history")).json()).toEqual([]);
  });
});

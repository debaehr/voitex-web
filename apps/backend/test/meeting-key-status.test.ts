import { afterEach, expect, it, vi } from "vitest";
import { createServer, type Server } from "node:http";
import { meetingRequest } from "../src/providers/meeting-http.js";
import { keyStatus } from "../src/providers/key-status.js";

const upstream = vi.hoisted(() => ({ origin: "" }));
// Exercise the actual native transport through a local upstream, without external requests.
vi.mock("node:https", async () => {
  const { request } = await import("node:http");
  return { request: (url: string, options: Parameters<typeof request>[1], callback: Parameters<typeof request>[2]) => request(upstream.origin + new URL(url).pathname, options, callback) };
});
let server: Server;
afterEach(async () => {
  if (server) await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); });
  vi.unstubAllEnvs();
});
it.each(["mistral", "assemblyai"] as const)("tracks native %s meeting HTTP rejection and recovery", async id => {
  vi.stubEnv(`${id.toUpperCase()}_API_KEY`, "dummy");
  let status = 401;
  server = createServer((_req, res) => { res.writeHead(status); res.end("{}"); }).listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address(); if (!address || typeof address === "string") throw new Error("address");
  upstream.origin = `http://127.0.0.1:${address.port}`;
  const url = id === "mistral" ? "https://api.mistral.ai/v1/audio/transcriptions" : "https://api.assemblyai.com/v2/transcript";
  await meetingRequest(url, {}); expect(keyStatus.invalid()).toContain(id);
  status = 503; await meetingRequest(url, {}); expect(keyStatus.invalid()).toContain(id);
  status = 200; await meetingRequest(url, {}); expect(keyStatus.invalid()).not.toContain(id);
});

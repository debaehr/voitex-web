import { afterEach, expect, it } from "vitest";
import { createServer, type Server, type RequestListener } from "node:http";
import { meetingRequest } from "../src/providers/meeting-http.js";
let server: Server | undefined;
afterEach(async () => {
  if (server) await new Promise<void>(resolve => { server!.close(() => resolve()); server!.closeAllConnections(); });
});
async function listen(handler: RequestListener) {
  server = createServer(handler); server.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server!.once("listening", resolve));
  const address = server.address(); if (!address || typeof address === "string") throw new Error("address");
  return `http://127.0.0.1:${address.port}`;
}
it("streams multipart with its boundary and preserves the upstream JSON response", async () => {
  let requestBody = "", type = "", auth = "";
  const url = await listen(async (req, res) => {
    type = req.headers["content-type"] ?? ""; auth = req.headers.authorization ?? "";
    for await (const chunk of req) requestBody += chunk;
    res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ segments: [] }));
  });
  const form = new FormData(); form.append("diarize", "true"); form.append("file", new Blob(["Audio bytes"]), "test.webm");
  const response = await meetingRequest(url, { method: "POST", headers: { Authorization: "Bearer dummy" }, body: form, signal: AbortSignal.timeout(1000) });
  expect(await response.json()).toEqual({ segments: [] }); expect(auth).toBe("Bearer dummy");
  expect(type).toMatch(/^multipart\/form-data; boundary=/); expect(requestBody).toContain(type.split("boundary=")[1]);
  expect(requestBody).toContain("Audio bytes"); expect(requestBody).toContain('name="diarize"');
});
it("aborts a provider that never returns headers using the caller's deadline", async () => {
  const url = await listen(() => {});
  await expect(meetingRequest(url, { signal: AbortSignal.timeout(50) })).rejects.toMatchObject({ name: "AbortError" });
});
it("preserves provider error status and does not require fetch's dispatcher", async () => {
  const url = await listen((_req, res) => { res.writeHead(429); res.end("rate limited"); });
  const response = await meetingRequest(url, { method: "GET", signal: AbortSignal.timeout(1000) });
  expect(response.ok).toBe(false); expect(response.status).toBe(429); expect(await response.text()).toBe("rate limited");
});

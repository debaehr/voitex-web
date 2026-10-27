import { afterEach, expect, it, vi } from "vitest";
import { api } from "../src/lib/api";
import { localChunk } from "./meeting-fixture";
afterEach(() => vi.unstubAllGlobals());
it("uses raw binary chunk bodies, recorder content type and stable part/chunk URLs for replay", async () => {
  const fetch = vi.fn(async () => new Response(JSON.stringify({ ok: true })));
  vi.stubGlobal("fetch", fetch);
  const chunk = { ...localChunk(0), contentType: "audio/webm;codecs=opus" };
  await api.putMeetingChunk(chunk); await api.putMeetingChunk(chunk);
  expect(fetch.mock.calls).toHaveLength(2);
  for (const [path, init] of fetch.mock.calls as unknown as Array<[string, RequestInit]>) {
    expect(path).toBe("/api/meetings/meeting-1/parts/1/chunks/0"); expect(init.method).toBe("PUT");
    expect(init.body).toBe(chunk.blob); expect(init.headers).toEqual({ "Content-Type": "audio/webm;codecs=opus" });
  }
});
it("creates, finishes, polls, retries and deletes using the live backend contract", async () => {
  const fetch = vi.fn(async () => new Response(JSON.stringify({ id: "meeting-1" })));
  vi.stubGlobal("fetch", fetch);
  await api.createMeeting({ source: "recording", language: "de" });
  const payload = { durationSeconds: 5, parts: [{ part: 1, chunkCount: 1, contentType: "audio/mp4", startedAt: "2026-10-27T08:00:00.000Z", endedAt: "2026-10-27T08:00:05.000Z", durationSeconds: 5 }] };
  await api.finishMeeting("meeting-1", payload); await api.getMeeting("meeting-1"); await api.retryMeeting("meeting-1"); await api.deleteMeeting("meeting-1");
  const calls = fetch.mock.calls as unknown as Array<[string, RequestInit | undefined]>;
  expect(calls.map(([path, init]) => [path, init?.method ?? "GET"])).toEqual([
    ["/api/meetings", "POST"], ["/api/meetings/meeting-1/finish", "POST"], ["/api/meetings/meeting-1", "GET"], ["/api/meetings/meeting-1/retry", "POST"], ["/api/meetings/meeting-1", "DELETE"]
  ]);
  expect(JSON.parse(calls[0][1]!.body as string)).toEqual({ source: "recording", language: "de" });
  expect(JSON.parse(calls[1][1]!.body as string)).toEqual(payload);
});
it("treats an already deleted server meeting as discarded so local cleanup can be retried", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "Meeting not found." }), { status: 404 })));
  await expect(api.deleteMeeting("meeting-1")).resolves.toBeUndefined();
});

import express, { Router, type Request, type Response, type NextFunction } from "express";
import { CHUNK_LIMIT_BYTES, MeetingError, MeetingService, isRecord, normalizeContentType, validIndex, validMeetingId, type PartMetadata } from "../meetings.js";
import { isMeetingProvider } from "../providers/meetings.js";

type Handler = (req: Request, res: Response) => Promise<unknown>;
function route(ready: Promise<void>, handler: Handler) {
  return (req: Request, res: Response, next: NextFunction) => {
    void ready.then(() => handler(req, res)).catch(error => {
      if (error instanceof MeetingError) res.status(error.status).json({ error: error.message });
      else next(error);
    });
  };
}
function invalid(message = "Invalid body."): never { throw new MeetingError(400, message); }
function validTitle(value: unknown): value is string { return typeof value === "string" && value.length <= 200; }
function validDuration(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 10 * 60 * 60; }
function validDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
}
function partsMetadata(value: unknown): PartMetadata[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 1000) return invalid();
  const seen = new Set<number>();
  return value.map(item => {
    if (!isRecord(item) || !validIndex(String(item.part), 1) || typeof item.part !== "number" || seen.has(item.part)) return invalid("Invalid part metadata.");
    seen.add(item.part);
    if (item.chunkCount !== undefined && (typeof item.chunkCount !== "number" || !Number.isInteger(item.chunkCount) || item.chunkCount < 1 || item.chunkCount > 100001)) invalid("Invalid chunk count.");
    if (item.durationSeconds !== undefined && !validDuration(item.durationSeconds)) invalid("Invalid duration.");
    if (item.startedAt !== undefined && !validDate(item.startedAt) || item.endedAt !== undefined && !validDate(item.endedAt)) invalid("Invalid part timestamp.");
    if (item.startedAt && item.endedAt && Date.parse(item.endedAt) < Date.parse(item.startedAt)) invalid("Invalid part timestamps.");
    const contentType = item.contentType === undefined ? undefined : typeof item.contentType === "string" ? normalizeContentType(item.contentType) : undefined;
    if (item.contentType !== undefined && !contentType) invalid("Invalid content type.");
    return { part: item.part, chunkCount: item.chunkCount, durationSeconds: item.durationSeconds, startedAt: item.startedAt, endedAt: item.endedAt, ...(contentType ? { contentType } : {}) };
  });
}

// Mount this router BEFORE express.json: even a JSON Content-Type is a binary chunk.
export function createMeetingChunkRouter(service: MeetingService, ready: Promise<void>) {
  const router = Router();
  router.put("/meetings/:id/parts/:part/chunks/:n", (req, res, next) => {
    if (!validMeetingId(String(req.params.id)) || !validIndex(String(req.params.part), 1) || !validIndex(String(req.params.n), 0)) {
      res.status(400).json({ error: "Invalid meeting id, part or chunk index." }); return;
    }
    next();
  }, express.raw({ type: () => true, limit: CHUNK_LIMIT_BYTES }), route(ready, async (req, res) => {
    if (!Buffer.isBuffer(req.body)) invalid("Missing binary chunk.");
    const contentType = normalizeContentType(req.get("content-type") ?? "application/octet-stream") ?? "application/octet-stream";
    await service.upload(req.params.id as string, Number(req.params.part), Number(req.params.n), req.body, contentType);
    res.json({ ok: true });
  }));
  return router;
}

export function createMeetingRouter(service: MeetingService, ready: Promise<void>) {
  const router = Router();
  router.post("/meetings", route(ready, async (req, res) => {
    const input = req.body;
    if (!isRecord(input) || (input.source !== "recording" && input.source !== "upload") ||
        typeof input.language !== "string" || !/^(auto|[a-z]{2,3}(?:-[A-Za-z]{2})?)$/.test(input.language) ||
        input.title !== undefined && !validTitle(input.title)) invalid();
    const id = await service.create({ title: input.title ?? "", source: input.source, language: input.language });
    res.status(201).json({ id });
  }));
  router.get("/meetings", route(ready, async (_req, res) => {
    res.json((await service.list()).map(meeting => ({
      id: meeting.id, title: meeting.title, source: meeting.source, language: meeting.language,
      createdAt: meeting.createdAt, updatedAt: meeting.updatedAt, durationSeconds: meeting.durationSeconds,
      status: meeting.status, progress: meeting.progress, error: meeting.error,
      provider: meeting.provider, model: meeting.model, audioExpiresAt: meeting.audioExpiresAt, audioDeletedAt: meeting.audioDeletedAt
    })));
  }));
  router.get("/meetings/:id", route(ready, async (req, res) => res.json(await service.get(req.params.id as string))));
  // Parts are 1-based; chunks are 0-based. Optional finish metadata:
  // {durationSeconds?, parts?: [{part, chunkCount?, contentType?, startedAt?, endedAt?, durationSeconds?}]}
  // Supply chunkCount to detect a missing final chunk, and ISO timestamps for gap markers.
  router.post("/meetings/:id/finish", route(ready, async (req, res) => {
    const input = req.body ?? {};
    if (!isRecord(input) || input.durationSeconds !== undefined && !validDuration(input.durationSeconds)) invalid();
    await service.finish(req.params.id as string, partsMetadata(input.parts), input.durationSeconds);
    res.status(202).json({ status: "queued" });
  }));
  router.post("/meetings/:id/retry", route(ready, async (req, res) => {
    const input = req.body ?? {};
    if (!isRecord(input) || input.provider !== undefined && !isMeetingProvider(input.provider)) invalid();
    await service.retry(req.params.id as string, input.provider);
    res.status(202).json({ status: "queued" });
  }));
  router.post("/meetings/:id/protocol", route(ready, async (req, res) => {
    await service.protocol(req.params.id as string); res.status(202).json({ status: "queued" });
  }));
  router.patch("/meetings/:id", route(ready, async (req, res) => {
    const input = req.body;
    if (!isRecord(input) || !Object.keys(input).length || Object.keys(input).some(key => !["title", "speakerNames"].includes(key)) ||
        input.title !== undefined && !validTitle(input.title)) invalid();
    if (input.speakerNames !== undefined && (!isRecord(input.speakerNames) || Object.values(input.speakerNames).some(name => typeof name !== "string" || !name.trim() || name.length > 100))) invalid("Invalid speaker names.");
    res.json(await service.patch(req.params.id as string, input));
  }));
  router.delete("/meetings/:id", route(ready, async (req, res) => {
    await service.delete(req.params.id as string); res.json({ ok: true });
  }));
  router.delete("/meetings/:id/audio", route(ready, async (req, res) => {
    await service.deleteAudio(req.params.id as string); res.json({ ok: true });
  }));
  router.get("/meetings/:id/audio", route(ready, async (req, res) => {
    const part = req.query.part ?? "1";
    if (typeof part !== "string" || !validIndex(part, 1)) invalid("Invalid part index.");
    const audio = await service.audio(req.params.id as string, Number(part));
    res.setHeader("Content-Type", audio.contentType);
    res.setHeader("Content-Disposition", `attachment; filename="part-${part}.${audio.path.split(".").pop()}"`);
    res.setHeader("Cache-Control", "no-store");
    await new Promise<void>((resolve, reject) => res.sendFile(audio.path, error => {
      if (error && (error as NodeJS.ErrnoException).code === "ENOENT") reject(new MeetingError(404, "Meeting audio not found."));
      else if (error) reject(error); else resolve();
    }));
  }));
  return router;
}

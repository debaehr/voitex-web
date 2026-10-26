import { Request, Response, Router } from "express";
import { readFile, open, rename, copyFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import multer from "multer";
import { isProvider, processTranscript, transcribeAudio, WorkMode } from "../providers/index.js";
import { transcribeMeeting } from "../providers/assemblyai.js";

// Resolve storage paths from the compiled runtime location so dev/build layouts behave the same.
const dataDir = join(dirname(fileURLToPath(import.meta.url)), "../../../../data");
const settingsPath = join(dataDir, "settings.json");
const historyPath = join(dataDir, "history.json");
const validWorkModes: WorkMode[] = ["original", "casual", "formal", "coding"];

// Only a missing file counts as empty state. A malformed file throws, so callers
// never answer "empty" and let a client overwrite data that still exists on disk.
async function readJsonFile(path: string): Promise<unknown> {
  let text: string;
  try {
    text = await readFile(path, "utf-8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
  return JSON.parse(text);
}

// Write to a temp file and rename it into place, so a crash mid-write cannot
// leave truncated JSON behind. The previous version is kept as `.bak`.
async function writeJsonFile(path: string, data: unknown): Promise<void> {
  await mkdir(dataDir, { recursive: true });
  const tempPath = `${path}.tmp`;
  const handle = await open(tempPath, "w");
  try {
    await handle.writeFile(JSON.stringify(data, null, 2), "utf-8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await copyFile(path, `${path}.bak`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
  await rename(tempPath, path);
}

// Serialize all read-modify-write cycles per file; concurrent requests would
// otherwise read the same state and the later write would drop the earlier one.
const fileLocks = new Map<string, Promise<unknown>>();

function withFileLock<T>(path: string, task: () => Promise<T>): Promise<T> {
  const previous = fileLocks.get(path) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(task);
  fileLocks.set(path, next);
  return next;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024
  }
});

export const apiRouter = Router();

apiRouter.get("/health", (_req, res) => {
  res.json({ ok: true });
});

apiRouter.get("/settings", (_req, res) => {
  // Route handlers remain sync; async work is delegated to dedicated functions.
  void handleGetSettings(res);
});

apiRouter.put("/settings", (req, res) => {
  void handlePutSettings(req, res);
});

apiRouter.get("/history", (_req, res) => {
  void handleGetHistory(res);
});

// Kept for clients that still replace the whole array (pre-1.2.1 bundles).
apiRouter.put("/history", (req, res) => {
  void handlePutHistory(req, res);
});

apiRouter.post("/history", (req, res) => {
  void handleAppendHistory(req, res);
});

apiRouter.delete("/history", (_req, res) => {
  void handleClearHistory(res);
});

apiRouter.post("/transcribe", upload.single("audio"), (req, res) => {
  void handleTranscribe(req, res);
});

apiRouter.post("/process", (req, res) => {
  void handleProcess(req, res);
});

apiRouter.post("/transcribe-meeting", upload.single("audio"), (req, res) => {
  void handleTranscribeMeeting(req, res);
});

apiRouter.post("/summarize", (req, res) => {
  void handleSummarize(req, res);
});

async function handleTranscribe(req: Request, res: Response) {
  if (!req.file) {
    sendError(res, 400, "Missing audio file.");
    return;
  }

  const provider = req.body?.provider || "openai";
  if (!isProvider(provider)) {
    sendError(res, 400, "Invalid provider.");
    return;
  }

  const mode = String(req.body?.mode ?? "formal") as WorkMode;
  if (!isWorkMode(mode)) {
    sendError(res, 400, "Invalid mode.");
    return;
  }

  try {
    const result = await transcribeAudio(provider, {
      buffer: req.file.buffer,
      filename: req.file.originalname || "recording.webm",
      mimetype: req.file.mimetype || "audio/webm",
      language: req.body?.language,
      mode
    });

    res.json({ transcript: result.text, provider: result.provider, model: result.model });
  } catch (error) {
    console.error("Transcription failed", error);
    sendInternalError(res, "Transcription failed.");
  }
}

async function handleTranscribeMeeting(req: Request, res: Response) {
  if (!req.file) {
    sendError(res, 400, "Missing audio file.");
    return;
  }

  try {
    const result = await transcribeMeeting({
      buffer: req.file.buffer,
      mimetype: req.file.mimetype || "application/octet-stream"
    });

    res.json(result);
  } catch (error) {
    console.error("Meeting transcription failed", error);
    sendInternalError(res, "Meeting transcription failed.");
  }
}

async function handleSummarize(req: Request, res: Response) {
  const transcript = String(req.body?.transcript ?? "").trim();
  const provider = req.body?.provider || "openai";
  const instructions =
    typeof req.body?.instructions === "string"
      ? req.body.instructions
      : "Erstelle eine prägnante Meeting-Zusammenfassung auf Deutsch. Struktur: Kurzfassung, Entscheidungen, Aufgaben, offene Punkte. Erhalte konkrete Namen, Termine und Verantwortlichkeiten, sofern vorhanden.";

  if (!transcript) {
    sendError(res, 400, "Missing transcript.");
    return;
  }

  if (!isProvider(provider)) {
    sendError(res, 400, "Invalid provider.");
    return;
  }

  try {
    const result = await processTranscript(provider, {
      transcript,
      mode: "formal",
      instructions,
      translateToEnglish: req.body?.translateToEnglish === true
    });

    res.json({ summary: result.text, provider: result.provider, model: result.model });
  } catch (error) {
    console.error("Meeting summarization failed", error);
    sendInternalError(res, "Meeting summarization failed.");
  }
}

async function handleProcess(req: Request, res: Response) {
  const transcript = String(req.body?.transcript ?? "").trim();
  const mode = String(req.body?.mode ?? "formal") as WorkMode;

  if (!transcript) {
    sendError(res, 400, "Missing transcript.");
    return;
  }

  if (!isWorkMode(mode)) {
    sendError(res, 400, "Invalid mode.");
    return;
  }

  const provider = req.body?.provider || "openai";
  if (!isProvider(provider)) {
    sendError(res, 400, "Invalid provider.");
    return;
  }

  try {
    const instructions = typeof req.body?.instructions === "string" ? req.body.instructions : undefined;
    const translateToEnglish = req.body?.translateToEnglish === true;
    const result = await processTranscript(provider, { transcript, mode, instructions, translateToEnglish });
    res.json({ processed: result.text, provider: result.provider, model: result.model });
  } catch (error) {
    console.error("Processing failed", error);
    sendInternalError(res, "Processing failed.");
  }
}

async function handleGetSettings(res: Response) {
  try {
    const data = await readJsonFile(settingsPath);
    res.json(data ?? {});
  } catch (error) {
    console.error("Failed to read settings", error);
    sendError(res, 500, "Failed to read settings.");
  }
}

async function handlePutSettings(req: Request, res: Response) {
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
    sendError(res, 400, "Invalid body.");
    return;
  }
  try {
    await withFileLock(settingsPath, () => writeJsonFile(settingsPath, req.body));
    res.json({ ok: true });
  } catch (error) {
    console.error("Failed to save settings", error);
    sendError(res, 500, "Failed to save settings.");
  }
}

async function handleGetHistory(res: Response) {
  try {
    const data = await readJsonFile(historyPath);
    res.json(data ?? []);
  } catch (error) {
    console.error("Failed to read history", error);
    sendError(res, 500, "Failed to read history.");
  }
}

async function handlePutHistory(req: Request, res: Response) {
  if (!Array.isArray(req.body)) {
    sendError(res, 400, "Invalid body: expected array.");
    return;
  }
  try {
    await withFileLock(historyPath, () => writeJsonFile(historyPath, req.body));
    res.json({ ok: true });
  } catch (error) {
    console.error("Failed to save history", error);
    sendError(res, 500, "Failed to save history.");
  }
}

async function handleAppendHistory(req: Request, res: Response) {
  const entry = req.body as Record<string, unknown> | undefined;
  if (
    !entry ||
    typeof entry !== "object" ||
    typeof entry.id !== "string" ||
    !entry.id ||
    typeof entry.transcript !== "string"
  ) {
    sendError(res, 400, "Invalid body: expected history entry.");
    return;
  }
  try {
    await withFileLock(historyPath, async () => {
      const current = await readJsonFile(historyPath);
      if (current !== null && !Array.isArray(current)) {
        throw new Error("history.json does not contain an array.");
      }
      const entries = (current ?? []) as Array<{ id?: unknown }>;
      // Idempotent: a client retrying after a lost response must not create duplicates.
      if (entries.some((item) => item.id === entry.id)) {
        return;
      }
      await writeJsonFile(historyPath, [...entries, entry]);
    });
    res.json({ ok: true });
  } catch (error) {
    console.error("Failed to append history entry", error);
    sendError(res, 500, "Failed to save history.");
  }
}

async function handleClearHistory(res: Response) {
  try {
    await withFileLock(historyPath, () => writeJsonFile(historyPath, []));
    res.json({ ok: true });
  } catch (error) {
    console.error("Failed to clear history", error);
    sendError(res, 500, "Failed to clear history.");
  }
}

function isWorkMode(value: string): value is WorkMode {
  return validWorkModes.includes(value as WorkMode);
}

function sendError(res: Response, status: number, message: string) {
  res.status(status).json({ error: message });
}

function sendInternalError(res: Response, fallbackMessage: string) {
  sendError(res, 500, fallbackMessage);
}

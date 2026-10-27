import { keyStatus } from "../providers/key-status.js";
import { Request, Response, Router } from "express";
import { join } from "node:path";
import multer from "multer";
import { isProvider, processTranscript, transcribeAudio, WorkMode } from "../providers/index.js";
import { defaultPrompts } from "../prompts.js";
import { readJsonFile, writeJsonFile, withFileLock } from "../persistence.js";
import { isMeetingProvider, availableMeetingProviders } from "../providers/meetings.js";
import { contextBiasTerms } from "../context-bias.js";
import { lexiconEntries } from "../lexicon.js";

import { buildTranslationInstructions, isTargetLanguage, isTranslationLanguage } from "../providers/shared.js";

const validWorkModes: WorkMode[] = ["original", "casual", "formal", "coding"];

export const DEFAULT_UPLOAD_LIMIT_BYTES = 200 * 1024 * 1024;

export function createApiRouter(dataDir: string, uploadLimitBytes = DEFAULT_UPLOAD_LIMIT_BYTES) {
  const settingsPath = join(dataDir, "settings.json");
  const historyPath = join(dataDir, "history.json");
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: uploadLimitBytes
    }
  });

  const apiRouter = Router();

  apiRouter.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  apiRouter.get("/providers", (_req, res) => {
    const configured = ["openai", "mistral", "groq"].filter(provider =>
      Boolean(process.env[`${provider.toUpperCase()}_API_KEY`]?.trim())
    );
    res.json({ stt: configured, llm: configured, meetings: availableMeetingProviders(), invalid: keyStatus.invalid() });
  });

  apiRouter.get("/settings/defaults", (_req, res) => {
    res.json({
      version: 1,
      providers: { ...Object.fromEntries(Object.keys(defaultPrompts).map(mode => [mode, "mistral"])), meetings: "mistral" },
      meetingFallback: false,
      prompts: defaultPrompts,
      lexicon: [],
      snippets: [],
      ownSpeakerName: "Ich",
      customModes: [],
      hiddenModes: []
    });
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

  apiRouter.delete("/history/:id", (req, res) => {
    void handleDeleteHistory(req, res);
  });

  apiRouter.delete("/history", (_req, res) => {
    void handleClearHistory(res);
  });

  apiRouter.post("/transcribe", upload.single("audio"), (req, res) => {
    void handleTranscribe(req, res);
  });

  apiRouter.post("/translate", (req, res) => {
    void handleTranslate(req, res);
  });

  apiRouter.post("/process", (req, res) => {
    void handleProcess(req, res);
  });

  async function handleTranscribe(req: Request, res: Response) {
    if (!req.file) {
      sendError(res, 400, "Missing audio file.");
      return;
    }

    const provider = req.body?.provider || "mistral";
    if (!isProvider(provider)) {
      sendError(res, 400, "Invalid provider.");
      return;
    }

    const mode = String(req.body?.mode ?? "formal") as WorkMode;
    if (!isWorkMode(mode)) {
      sendError(res, 400, "Invalid mode.");
      return;
    }

    const prompt = typeof req.body?.prompt === "string" ? req.body.prompt.trim() : undefined;
    if (req.body?.prompt !== undefined && (prompt === undefined || prompt.length > 1000)) {
      sendError(res, 400, "Invalid prompt: expected at most 1000 characters.");
      return;
    }

    try {
      const settings = provider === "mistral" ? await readJsonFile(settingsPath) : null;
      const contextBias = contextBiasTerms(lexiconEntries(isRecord(settings) ? settings.lexicon : undefined).map(entry => entry.correct));
      const result = await transcribeAudio(provider, {
        buffer: req.file.buffer,
        filename: req.file.originalname || "recording.webm",
        mimetype: req.file.mimetype || "audio/webm",
        language: req.body?.language,
        ...(provider === "openai" && prompt ? { prompt } : {}),
        ...(contextBias.length ? { contextBias } : {}),
        mode
      });

      res.json({ transcript: result.text, provider: result.provider, model: result.model });
    } catch (error) {
      console.error("Transcription failed", error);
      sendInternalError(res, "Transcription failed.");
    }
  }

  async function handleTranslate(req: Request, res: Response) {
    const { text, targetLanguage, provider = "mistral" } = req.body ?? {};
    if (typeof text !== "string" || !text.trim()) {
      sendError(res, 400, "Missing text.");
      return;
    }
    if (!isTranslationLanguage(targetLanguage)) {
      sendError(res, 400, "Invalid target language.");
      return;
    }
    if (!isProvider(provider)) {
      sendError(res, 400, "Invalid provider.");
      return;
    }
    try {
      const result = await processTranscript(provider, {
        transcript: text,
        mode: "original",
        instructions: buildTranslationInstructions(targetLanguage)
      });
      res.json({ translated: result.text, provider: result.provider, model: result.model });
    } catch (error) {
      console.error("Translation failed", error);
      sendInternalError(res, "Translation failed.");
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

    const provider = req.body?.provider || "mistral";
    if (!isProvider(provider)) {
      sendError(res, 400, "Invalid provider.");
      return;
    }

    try {
      const instructions = typeof req.body?.instructions === "string" ? req.body.instructions : undefined;
      const translateToEnglish = req.body?.translateToEnglish === true;
      const targetLanguage = req.body?.targetLanguage;
      if (targetLanguage !== undefined && !isTargetLanguage(targetLanguage)) {
        sendError(res, 400, "Invalid target language.");
        return;
      }
      const result = await processTranscript(provider, { transcript, mode, instructions, translateToEnglish, targetLanguage });
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
    if (!isValidSettings(req.body)) {
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
    if (!Array.isArray(req.body) || !req.body.every(entry =>
      !isRecord(entry) || ((entry.targetLanguage === undefined || isTargetLanguage(entry.targetLanguage)) &&
        isValidModeLabel(entry.modeLabel)))) {
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
    const entry = req.body;
    if (!isValidHistoryEntry(entry)) {
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

  async function handleDeleteHistory(req: Request, res: Response) {
    try {
      const deleted = await withFileLock(historyPath, async () => {
        const current = await readJsonFile(historyPath);
        if (current !== null && !Array.isArray(current)) {
          throw new Error("history.json does not contain an array.");
        }
        const entries = (current ?? []) as Array<{ id?: unknown }>;
        const remaining = entries.filter(entry => entry.id !== req.params.id);
        if (remaining.length === entries.length) return false;
        await writeJsonFile(historyPath, remaining);
        return true;
      });
      if (!deleted) {
        sendError(res, 404, "History entry not found.");
        return;
      }
      res.json({ ok: true });
    } catch (error) {
      console.error("Failed to delete history entry", error);
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

  return apiRouter;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isValidSettings(value: unknown): boolean {
  if (!isRecord(value) || typeof value.version !== "number" || !Number.isFinite(value.version)) return false;
  const { providers, prompts } = value;
  if (!isRecord(providers) || !isRecord(prompts)) return false;
  if (value.meetingFallback !== undefined && typeof value.meetingFallback !== "boolean") return false;
  const modes = Object.keys(defaultPrompts);
  return modes.every(mode => isProvider(providers[mode])) &&
    Object.entries(providers).every(([key, provider]) => key === "meetings" ? isMeetingProvider(provider) : isProvider(provider)) &&
    modes.every(mode => typeof prompts[mode] === "string") &&
    Object.values(prompts).every(prompt => typeof prompt === "string") &&
    Array.isArray(value.lexicon) && Array.isArray(value.snippets) && typeof value.ownSpeakerName === "string" &&
    isValidModeSettings(value);
}

function isValidModeSettings(value: Record<string, unknown>): boolean {
  // Optional additive fields: old version-1 files remain valid without rewriting.
  const customModes = value.customModes ?? [];
  const hiddenModes = value.hiddenModes ?? [];
  if (value.customModes === null || value.hiddenModes === null ||
      !Array.isArray(customModes) || customModes.length > 20 || !Array.isArray(hiddenModes)) return false;
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const mode of customModes) {
    if (!isRecord(mode) || typeof mode.id !== "string" ||
        !/^custom-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(mode.id) ||
        typeof mode.label !== "string" || !mode.label.trim() || mode.label.length > 40 ||
        (mode.description !== undefined && (typeof mode.description !== "string" || mode.description.length > 120)) ||
        typeof mode.prompt !== "string" || !mode.prompt.trim() || mode.prompt.length > 8000 ||
        !isProvider(mode.provider)) return false;
    const id = mode.id.toLowerCase();
    const name = mode.label.trim().toLowerCase();
    if (ids.has(id) || names.has(name)) return false;
    ids.add(id);
    names.add(name);
  }
  return hiddenModes.every(mode => typeof mode === "string" && isWorkMode(mode)) &&
    new Set(hiddenModes).size === hiddenModes.length &&
    validWorkModes.length - hiddenModes.length + customModes.length >= 1;
}

function isValidModeLabel(value: unknown): boolean {
  return value === undefined || (typeof value === "string" && value.length <= 80);
}

function isValidHistoryEntry(value: unknown): value is Record<string, unknown> & { id: string; text: string } {
  return isRecord(value) && typeof value.id === "string" && value.id.trim().length > 0 &&
    (value.targetLanguage === undefined || isTargetLanguage(value.targetLanguage)) &&
    isValidModeLabel(value.modeLabel) &&
    typeof value.text === "string" && value.text.trim().length > 0 &&
    ["mode", "provider", "createdAt", "raw"].every(key => value[key] === undefined || typeof value[key] === "string") &&
    (value.durationSeconds === undefined || (typeof value.durationSeconds === "number" && Number.isFinite(value.durationSeconds)));
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

import cors from "cors";
import express from "express";
import { existsSync } from "node:fs";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createApiRouter } from "./routes/api.js";

export type AppOptions = {
  dataDir?: string;
  frontendDir?: string;
  // Test seam to exercise multer's actual limit handling without allocating 200 MB.
  uploadLimitBytes?: number;
};

export function createApp(options: AppOptions = {}) {
  const app = express();
  const dataDir = resolve(options.dataDir ?? process.env.VOITEX_DATA_DIR ?? fileURLToPath(new URL("../../../data", import.meta.url)));
  const frontendDir = resolve(options.frontendDir ?? process.env.VOITEX_FRONTEND_DIR ?? fileURLToPath(new URL("../../frontend/dist", import.meta.url)));
  const defaultCorsOrigins = ["http://127.0.0.1:5174", "http://localhost:5174"];
  const configuredCorsOrigins = process.env.CORS_ORIGINS?.split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
  const allowedCorsOrigins = configuredCorsOrigins?.length ? configuredCorsOrigins : defaultCorsOrigins;

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin) {
          callback(null, true);
          return;
        }

        if (allowedCorsOrigins.includes(origin)) {
          callback(null, true);
          return;
        }

        callback(new Error("CORS origin not allowed."));
      }
    })
  );
  app.use(express.json({ limit: "5mb" }));
  app.use("/api", createApiRouter(dataDir, options.uploadLimitBytes));
  app.use("/api", (_req, res) => { res.status(404).json({ error: "API route not found." }); });

  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "voitex-web-backend" });
  });

  const indexPath = resolve(frontendDir, "index.html");
  app.get("*", (_req, res, next) => {
    if (!existsSync(indexPath)) {
      res.status(503).type("text").send("Frontend build unavailable.");
      return;
    }
    next();
  });
  app.use(express.static(frontendDir, {
    setHeaders(res, path) {
      const name = basename(path);
      if (["index.html", "sw.js", "manifest.webmanifest"].includes(name)) {
        res.setHeader("Cache-Control", "no-cache");
      } else if (path.startsWith(resolve(frontendDir, "assets") + "/")) {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      }
    }
  }));
  app.get("*", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(indexPath, error => { if (error) next(error); });
  });

  // Keep parser, upload and CORS errors in the API's JSON error format.
  app.use((error: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (res.headersSent) { next(error); return; }
    const err = error as { status?: number; statusCode?: number; code?: string; name?: string };
    const status = err.code === "LIMIT_FILE_SIZE" ? 413 : err.name === "MulterError" ? 400 : (err.status ?? err.statusCode ?? 500);
    const message = status === 413 ? "Payload too large." : status < 500 ? "Invalid request." : "Internal error.";
    console.error("Request failed", error);
    res.status(status).json({ error: message });
  });
  return app;
}

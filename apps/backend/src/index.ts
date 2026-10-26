import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { fileURLToPath } from "node:url";
import { apiRouter } from "./routes/api.js";

dotenv.config({ path: fileURLToPath(new URL("../.env", import.meta.url)) });

const app = express();
const port = Number(process.env.PORT ?? 3006);
const host = process.env.HOST ?? "127.0.0.1";
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
app.use(express.json({ limit: "1mb" }));
app.use("/api", apiRouter);

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "voitex-web-backend" });
});

// Body-parser, multer and CORS errors would otherwise reach Express' default
// HTML handler; the frontend expects `{ error }` JSON to show a useful message.
app.use((error: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (res.headersSent) {
    next(error);
    return;
  }
  const err = error as { status?: number; statusCode?: number; code?: string; name?: string };
  const status =
    err.code === "LIMIT_FILE_SIZE" ? 413 : err.name === "MulterError" ? 400 : (err.status ?? err.statusCode ?? 500);
  const message = status === 413 ? "Payload too large." : status < 500 ? "Invalid request." : "Internal error.";
  console.error("Request failed", error);
  res.status(status).json({ error: message });
});

app.listen(port, host, () => {
  console.log(`voitex-web backend listening on ${host}:${port}`);
});

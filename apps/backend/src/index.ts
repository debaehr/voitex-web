import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";

dotenv.config({ path: fileURLToPath(new URL("../.env", import.meta.url)) });

const port = Number(process.env.PORT ?? 3006);
const host = process.env.HOST ?? "127.0.0.1";
if (host === "0.0.0.0" || host === "::") {
  throw new Error("The backend must listen on a loopback address.");
}
createApp().listen(port, host, () => {
  console.log(`voitex-web backend listening on ${host}:${port}`);
});

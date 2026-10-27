import { readFile, open, rename, copyFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

// A corrupt file must never masquerade as missing state.
export async function readJsonFile(path: string): Promise<unknown> {
  try { return JSON.parse(await readFile(path, "utf8")); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function writeJsonFile(path: string, data: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tempPath = `${path}.tmp`;
  const handle = await open(tempPath, "w");
  try { await handle.writeFile(JSON.stringify(data, null, 2), "utf8"); await handle.sync(); }
  finally { await handle.close(); }
  try { await copyFile(path, `${path}.bak`); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  await rename(tempPath, path);
}

const fileLocks = new Map<string, Promise<unknown>>();
export function withFileLock<T>(path: string, task: () => Promise<T>): Promise<T> {
  const next = (fileLocks.get(path) ?? Promise.resolve()).catch(() => undefined).then(task);
  fileLocks.set(path, next);
  void next.finally(() => { if (fileLocks.get(path) === next) fileLocks.delete(path); }).catch(() => undefined);
  return next;
}

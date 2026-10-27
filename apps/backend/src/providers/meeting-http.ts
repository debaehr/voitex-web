import { recordProviderResponse } from "./key-status.js";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { Readable } from "node:stream";
import type { ReadableStream } from "node:stream/web";

// Node's fetch imposes an independent five-minute response-header timeout.
// Native HTTP lets the caller's AbortSignal govern long transcription requests.
export async function meetingRequest(url: string, init: RequestInit): Promise<Response> {
  const payload = init.body == null ? undefined : new Response(init.body);
  const headers = new Headers(init.headers);
  const contentType = payload?.headers.get("content-type");
  if (contentType && !headers.has("content-type")) headers.set("content-type", contentType);
  return new Promise<Response>((resolve, reject) => {
    const request = (new URL(url).protocol === "https:" ? httpsRequest : httpRequest)(url, {
      method: init.method ?? "GET", headers: Object.fromEntries(headers), signal: init.signal ?? undefined
    }, response => {
      recordProviderResponse(url, response.statusCode ?? 500);
      const chunks: Buffer[] = [];
      response.on("data", chunk => chunks.push(Buffer.from(chunk)));
      response.once("error", reject);
      response.once("end", () => {
        const responseHeaders = new Headers();
        for (const [name, value] of Object.entries(response.headers)) {
          if (Array.isArray(value)) for (const item of value) responseHeaders.append(name, item);
          else if (value !== undefined) responseHeaders.set(name, value);
        }
        const status = response.statusCode ?? 500;
        resolve(new Response([204, 205, 304].includes(status) ? null : Buffer.concat(chunks), { status, headers: responseHeaders }));
      });
    });
    request.once("error", reject);
    if (payload?.body) {
      const stream = Readable.fromWeb(payload.body as ReadableStream<Uint8Array>);
      stream.once("error", error => request.destroy(error));
      request.once("error", () => stream.destroy());
      stream.pipe(request);
    } else request.end();
  });
}

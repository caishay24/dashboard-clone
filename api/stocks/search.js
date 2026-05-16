// Vercel serverless function entry. The Hono app is bundled into _app.mjs
// during the Vercel build so Node ESM does not have to resolve TS source imports.
import { Readable } from "node:stream";
import { app } from "../_app.mjs";

export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  const request = toRequest(req);
  const response = await app.fetch(request);

  res.statusCode = response.status;
  response.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });

  if (!response.body) {
    res.end();
    return;
  }

  Readable.fromWeb(response.body).pipe(res);
}

function toRequest(req) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) {
      for (const entry of value) headers.append(key, entry);
    } else if (value !== undefined) {
      headers.set(key, value);
    }
  }

  const protocol = headers.get("x-forwarded-proto") ?? "https";
  const host = headers.get("host") ?? "localhost";
  const url = new URL(req.url ?? "/", `${protocol}://${host}`);
  const init = {
    method: req.method,
    headers
  };

  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = Readable.toWeb(req);
    init.duplex = "half";
  }

  return new Request(url, init);
}

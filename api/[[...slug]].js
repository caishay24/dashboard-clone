// Vercel serverless function entry. The Hono app is bundled into _app.mjs
// during the Vercel build so Node ESM does not have to resolve TS source imports.
import { handle } from "@hono/node-server/vercel";
import { app } from "./_app.mjs";

export const config = { runtime: "nodejs" };
export default handle(app);

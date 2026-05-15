// Vercel serverless function entry — catches all /api/* and routes through Hono.
// Local dev still goes through apps/api/src/index.ts which boots @hono/node-server.
import { handle } from "hono/vercel";
import { app } from "../apps/api/src/index";

export const config = { runtime: "nodejs" };
export default handle(app);

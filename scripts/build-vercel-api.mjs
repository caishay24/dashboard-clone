import { build } from "esbuild";

await build({
  entryPoints: ["apps/api/src/index.ts"],
  outfile: "api/_app.mjs",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  define: {
    "process.env.VERCEL": "\"1\""
  },
  logLevel: "info"
});

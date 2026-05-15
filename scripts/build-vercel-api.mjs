import { build } from "esbuild";
import { resolve } from "node:path";

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
  plugins: [
    {
      name: "workspace-alias",
      setup(build) {
        build.onResolve({ filter: /^@dashboard\/shared$/ }, () => ({
          path: resolve("packages/shared/src/index.ts")
        }));
      }
    }
  ],
  logLevel: "info"
});

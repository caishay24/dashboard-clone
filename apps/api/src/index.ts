import { Hono, type Context } from "hono";
import { ZodError, type ZodTypeAny } from "zod";
import { getOrFetch } from "./cache";
import { getDefiRank } from "./adapters/defiRank";
import { getGithubRepos } from "./adapters/githubRepos";
import { getLiquidityPools } from "./adapters/liquidityPools";
import { getMarketAnalysis } from "./adapters/marketAnalysis";
import { getOnchainStocks } from "./adapters/onchainStocks";
import { getSectorMovers } from "./adapters/sectorMovers";
import { getStablecoinYields } from "./adapters/stablecoinYields";
import { getStocks } from "./adapters/stocks";
import { getStocksSearch } from "./adapters/stocksSearch";
import { getTicker } from "./adapters/ticker";
import { getTradingComp } from "./adapters/tradingComp";
import { envelope } from "./types";
import {
  defiRankQuerySchema,
  githubReposQuerySchema,
  liquidityPoolsQuerySchema,
  marketAnalysisQuerySchema,
  onchainStocksQuerySchema,
  sectorMoversQuerySchema,
  stablecoinYieldsQuerySchema,
  stocksQuerySchema,
  stocksSearchQuerySchema,
  tickerQuerySchema,
  tradingCompQuerySchema
} from "./schemas";

const app = new Hono();
const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>();

app.use("/api/*", async (c, next) => {
  if (c.req.path === "/api/health") {
    await next();
    return;
  }
  const ip = clientIp(c.req.raw);
  const now = Date.now();
  const bucket = rateLimitBuckets.get(ip);
  const active = bucket && bucket.resetAt > now ? bucket : { count: 0, resetAt: now + 60_000 };
  active.count += 1;
  rateLimitBuckets.set(ip, active);

  if (active.count > 60) {
    return c.json(envelope(null, { state: "cold", source: "rate-limit" }, {
      code: "RATE_LIMITED",
      message: "rate limit exceeded"
    }), 429);
  }

  await next();
});

app.get("/api/ticker", async (c) => {
  const query = parseQuery(c, tickerQuerySchema, "ticker");
  if (!query.ok) return query.response;
  const response = await getOrFetch("ticker", 30, 300, getTicker);
  return c.json(envelope(response.data?.data ?? null, {
    state: response.meta.state,
    fetchedAt: response.meta.fetchedAt ? new Date(response.meta.fetchedAt) : null,
    expiresAt: response.meta.expiresAt ? new Date(response.meta.expiresAt) : null,
    source: "ticker",
    cache: response.meta.cache,
    degraded: response.data?.degraded ?? []
  }, response.error), response.meta.state === "cold" ? 502 : 200);
});
app.get("/api/stocks", async (c) => {
  const query = parseQuery(c, stocksQuerySchema, "stocks");
  if (!query.ok) return query.response;
  const response = await getOrFetch(
    `stocks:${query.data.region}:${query.data.sector ?? "all"}`,
    90,
    21_600,
    () => getStocks(query.data)
  );
  return c.json(envelope(response.data?.data ?? [], {
    state: response.meta.state,
    fetchedAt: response.meta.fetchedAt ? new Date(response.meta.fetchedAt) : null,
    expiresAt: response.meta.expiresAt ? new Date(response.meta.expiresAt) : null,
    source: "stocks",
    cache: response.meta.cache,
    degraded: response.data?.degraded ?? []
  }, response.error), response.meta.state === "cold" ? 502 : 200);
});
app.get("/api/stocks/search", async (c) => {
  const query = parseQuery(c, stocksSearchQuerySchema, "stocks-search");
  if (!query.ok) return query.response;
  // Normalise the query string for the cache key (case-insensitive, trim).
  const normalized = query.data.q.trim().toLowerCase();
  const response = await getOrFetch(
    `stocks-search:v2:${query.data.region}:${query.data.limit}:${normalized}`,
    300,    // 5 min TTL — search results don't change often within a window
    21_600, // 6 h hard max
    () => getStocksSearch({ q: query.data.q, region: query.data.region, limit: query.data.limit })
  );
  return c.json(envelope(response.data?.data ?? [], {
    state: response.meta.state,
    fetchedAt: response.meta.fetchedAt ? new Date(response.meta.fetchedAt) : null,
    expiresAt: response.meta.expiresAt ? new Date(response.meta.expiresAt) : null,
    source: "stocks-search",
    cache: response.meta.cache,
    degraded: response.data?.degraded ?? []
  }, response.error), response.meta.state === "cold" ? 502 : 200);
});
app.get("/api/trading-comp", async (c) => {
  const query = parseQuery(c, tradingCompQuerySchema, "trading-comp");
  if (!query.ok) return query.response;
  const response = await getOrFetch(
    `trading-comp:${query.data.exchange}`,
    900,
    86_400,
    () => getTradingComp(query.data)
  );
  return c.json(envelope(response.data ?? [], {
    state: response.meta.state,
    fetchedAt: response.meta.fetchedAt ? new Date(response.meta.fetchedAt) : null,
    expiresAt: response.meta.expiresAt ? new Date(response.meta.expiresAt) : null,
    source: "trading-comp",
    cache: response.meta.cache
  }, response.error), response.meta.state === "cold" ? 502 : 200);
});
app.get("/api/market-analysis", async (c) => {
  const query = parseQuery(c, marketAnalysisQuerySchema, "market-analysis");
  if (!query.ok) return query.response;
  const response = await getOrFetch(
    `market-analysis:${query.data.symbol}:${query.data.interval}`,
    60,
    3_600,
    () => getMarketAnalysis(query.data)
  );
  return c.json(response, response.meta.state === "cold" ? 502 : 200);
});
app.get("/api/defi-rank", async (c) => {
  const query = parseQuery(c, defiRankQuerySchema, "defi-rank");
  if (!query.ok) return query.response;
  const response = await getOrFetch(
    `defi-rank:${query.data.sort}:${query.data.limit}`,
    300,
    21_600,
    () => getDefiRank(query.data)
  );
  return c.json(response, response.meta.state === "cold" ? 502 : 200);
});
app.get("/api/liquidity-pools", async (c) => {
  const query = parseQuery(c, liquidityPoolsQuerySchema, "liquidity-pools");
  if (!query.ok) return query.response;
  const response = await getOrFetch(
    `liquidity-pools:${query.data.chain}:${query.data.sort}:${query.data.limit}`,
    300,
    21_600,
    () => getLiquidityPools(query.data)
  );
  return c.json(response, response.meta.state === "cold" ? 502 : 200);
});
app.get("/api/sector-movers", async (c) => {
  const query = parseQuery(c, sectorMoversQuerySchema, "sector-movers");
  if (!query.ok) return query.response;
  const response = await getOrFetch(
    `sector-movers:${query.data.market}:${query.data.category ?? "top30"}`,
    300,
    21_600,
    () => getSectorMovers(query.data)
  );
  return c.json(response, response.meta.state === "cold" ? 502 : 200);
});
app.get("/api/onchain-stocks", async (c) => {
  const query = parseQuery(c, onchainStocksQuerySchema, "onchain-stocks");
  if (!query.ok) return query.response;
  const response = await getOrFetch(
    `onchain-stocks:${query.data.issuer}:${query.data.category ?? "all"}`,
    300,
    21_600,
    () => getOnchainStocks(query.data)
  );
  return c.json(envelope(response.data?.data ?? [], {
    state: response.meta.state,
    fetchedAt: response.meta.fetchedAt ? new Date(response.meta.fetchedAt) : null,
    expiresAt: response.meta.expiresAt ? new Date(response.meta.expiresAt) : null,
    source: "onchain-stocks",
    cache: response.meta.cache,
    degraded: response.data?.degraded ?? []
  }, response.error), response.meta.state === "cold" ? 502 : 200);
});
app.get("/api/stablecoin-yields", async (c) => {
  const query = parseQuery(c, stablecoinYieldsQuerySchema, "stablecoin-yields");
  if (!query.ok) return query.response;
  const response = await getOrFetch(
    `stablecoin-yields:${query.data.asset}:${query.data.limit}`,
    300,
    21_600,
    () => getStablecoinYields(query.data)
  );
  return c.json(response, response.meta.state === "cold" ? 502 : 200);
});
app.get("/api/github-repos", async (c) => {
  const query = parseQuery(c, githubReposQuerySchema, "github-repos");
  if (!query.ok) return query.response;
  const response = await getOrFetch(
    `github-repos:${query.data.category ?? "all"}`,
    3_600,
    21_600,
    () => getGithubRepos(query.data)
  );
  return c.json(response, response.meta.state === "cold" ? 502 : 200);
});
app.get("/api/health", (c) => c.json(envelope({ ok: true }, {
  state: "fresh",
  fetchedAt: new Date(),
  expiresAt: new Date(Date.now() + 30_000),
  source: "health"
})));

function parseQuery<T extends ZodTypeAny>(c: Context, schema: T, source: string) {
  try {
    return {
      ok: true as const,
      data: schema.parse(Object.fromEntries(new URL(c.req.url).searchParams)) as T["_output"]
    };
  } catch (error) {
    if (error instanceof ZodError) {
      return {
        ok: false as const,
        response: c.json(envelope(null, { state: "cold", source }, {
          code: "BAD_QUERY",
          message: "invalid query"
        }), 400)
      };
    }
    throw error;
  }
}

function clientIp(request: Request) {
  const trustedProxies = (process.env.TRUSTED_PROXIES ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  const directIp = request.headers.get("x-real-ip") ?? "unknown";
  if (trustedProxies.length === 0 || !trustedProxies.includes(directIp)) {
    return directIp;
  }
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || directIp;
}

export { app };

// Only start the standalone Node server when run directly (local dev / VPS).
// On Vercel, /api/[[...slug]].ts imports `app` and invokes it via hono/vercel.
// Use dynamic imports so neither dotenv nor @hono/node-server are pulled into
// the Vercel serverless bundle (smaller cold start, no node:fs at module top).
if (!process.env.VERCEL) {
  void startDevServer();
}

async function startDevServer() {
  await import("dotenv/config");
  const { serve } = await import("@hono/node-server");
  const port = Number(process.env.PORT ?? 8787);
  serve({ fetch: app.fetch, port });
  console.log(`api listening on http://localhost:${port}`);
}

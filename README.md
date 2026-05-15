# dashboard-clone

A free, real-time data dashboard inspired by https://import-command-query-8ca052.surf.computer/ — but with all 9 boards powered by **real public APIs** instead of static snapshots.

## Boards

| Board | Endpoint | Source |
|---|---|---|
| 顶部 Ticker | `/api/ticker` | Binance + 东方财富 push2 + CoinGecko /global + alternative.me FNG + EtherScan V2 |
| 股票市场 | `/api/stocks?region=us\|cn\|hk` | 东方财富 push2 (free) — replaces Yahoo + Polygon |
| 交易赛 | `/api/trading-comp?exchange=okx\|bitget\|gate\|bybit` | OKX official + ChainCatcher cheerio scrape |
| 行情解析 | `/api/market-analysis?symbol=BTCUSDT\|ETHUSDT\|SOLUSDT&interval=1h\|4h\|1d` | Binance klines + local MA/Bollinger/RSI/MACD |
| DeFi 协议榜 | `/api/defi-rank?sort=tvl\|fees\|volume&limit=10..100` | DefiLlama `/protocols` + `/overview/fees` (merge by slug) |
| 流动性池子 | `/api/liquidity-pools?chain=all\|<chain>&sort=tvl\|apr&limit=10..200` | DefiLlama yields `/pools` |
| 板块异动 | `/api/sector-movers?market=crypto` | CoinGecko `/coins/categories` |
| 链上美股 | `/api/onchain-stocks?issuer=all\|xstocks\|ondo&category=...` | DefiLlama coins price + 24h% (token-allowlist.json, 55 entries) |
| 稳定币收益榜 | `/api/stablecoin-yields?asset=USDT\|USDC\|DAI\|all` | DefiLlama yields filtered by stablecoin=true && exposure=single |
| GitHub 库 | `/api/github-repos?category=...` | GitHub REST (github-allowlist.json, 92 repos / 13 categories) |

## Local dev

Requirements: pnpm 9+, Node 22+.

```bash
pnpm install
docker compose up -d  # optional: redis on :6379. Without it, cache falls back to in-memory.

# in two terminals:
pnpm --filter @dashboard/api dev   # api on :8788
pnpm --filter @dashboard/web dev   # web on :5173 (proxies /api → :8788)
```

Open http://localhost:5173.

### Env (`apps/api/.env`)

```
PORT=8788
GITHUB_PAT=github_pat_xxx
ETHERSCAN_API_KEY=xxx
REDIS_URL=redis://127.0.0.1:6379   # optional. Upstash REST URL also supported (cache.ts auto-detects http://)
TRUSTED_PROXIES=                    # empty = ignore X-Forwarded-For
```

### Tests

```bash
pnpm --filter @dashboard/api test   # 27 tests
pnpm --filter @dashboard/web test   # 12 tests
```

## Deploy to Vercel (free tier)

The repo is pre-configured for Vercel — `vercel.json` ships the SPA from `apps/web/dist` and serves `/api/*` via a single Hono serverless function (`api/[[...slug]].ts`).

### Steps (one-time)

1. **Push to GitHub**
   ```bash
   git init
   git add .
   git commit -m "Initial dashboard"
   # Create a private repo `dashboard-clone` at https://github.com/new
   git remote add origin git@github.com:<you>/dashboard-clone.git
   git push -u origin main
   ```

2. **Vercel import**
   - Go to https://vercel.com (sign in with GitHub).
   - Click **New Project** → Import the `dashboard-clone` repo.
   - Vercel auto-detects `vercel.json`; no framework preset needed.
   - Add environment variables (same names as `apps/api/.env`):
     - `GITHUB_PAT` = your fine-grained PAT
     - `ETHERSCAN_API_KEY` = your EtherScan V2 key
   - (Optional but recommended) set up **Upstash Redis** for persistent cache:
     - Sign up at https://upstash.com (free tier: 10k commands/day, 256 MB).
     - Create a Redis database, copy **REST URL** + **REST Token**.
     - Add to Vercel env:
       - `REDIS_URL` = the REST URL (cache.ts checks `http://` prefix)
       - `UPSTASH_REDIS_REST_URL` = same URL (required by `@upstash/redis` `fromEnv()`)
       - `UPSTASH_REDIS_REST_TOKEN` = the token
   - Click **Deploy**.

3. **Done** — you get a `<project>.vercel.app` URL within ~3 min.

### Production data quality (境外 IP)

Local dev shows two artifacts that **automatically disappear in production**:

- **股票 push2 rate limit** — concurrent burst of 28 US stocks from CN-routed IP triggers a temporary block. Production runs on US/EU IP, no rate limit.
- **OKX geo-block** — `/api/v5/support/announcements` returns stale 2024 data from CN-routed IP. Production sees today's announcements.

## Architecture

- **Frontend** (`apps/web`): React 18 + Vite + Tailwind + react-query. URL-hash routing for 9 boards. Dark theme.
- **Backend** (`apps/api`): Hono + zod query schemas + per-IP rate limit. `cache.ts` is three-state (fresh/stale/cold) with inflight promise dedup + memory fallback. All upstream calls go through `fetchWithRetry` (5s timeout + 1 retry + gzip).
- **Vercel wrapper** (`api/[[...slug]].ts`): re-exports the Hono `app` via `hono/vercel` `handle()`.
- **Shared** (`packages/shared`): zod response envelope schema, shared between front and back.

## Plan history

Reviewed 4 rounds (v1 → v4) by Codex before any code, then iterated to v6 during implementation. See `PLAN_DASHBOARD_v6.md`. Week 0 spike findings in `spike-results/SPIKE_RESULTS.md`.

## License

Private.

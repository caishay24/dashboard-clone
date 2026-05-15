# PLAN_DASHBOARD_v2 — 仪表盘动态克隆（v1 → v2 修订版）

> **目标**：复刻 https://import-command-query-8ca052.surf.computer/ 的 9 个板块 UI，所有数据走真实 API + 缓存。
> **9 个板块**（v2 调整）：股票市场 / 交易赛 / 行情解析 / DeFi 协议榜 / 流动性池子 / 板块异动 / 链上美股 / **稳定币收益榜（替代 Web3 理财）** / GitHub 库。
> **不在范围**：移动端、历史回填、告警、用户系统、登录态。
> **数据真实性优先级**：完全真实 > 标记「估算」的近似 > 砍掉。链上美股不显示 APY 列（v2 决策）。

## v1 → v2 主要变更

- **决策 Q1 = (b)**：A 股走东方财富 HTTP 接口（Node 原生，不开 Python 子进程）。
- **决策 Q2 = (c)**：原「Web3 理财」整块改为「稳定币收益榜」，纯走 DefiLlama Yields filter（CEX 理财全砍）。
- **决策 Q3 = (c)**：链上美股砍 APY 列，只留 价格 / 24h / 市值 / holders 四列。
- **§3 数据源矩阵**：Polygon URL 修正、Yahoo v8 降级为「非官方备援」、Binance 改 weight-based、CoinGecko 月额度处理。
- **§4 API**：加 zod query schema + allowlist + limit 上限 + per-IP rate limit + 脱敏 error。
- **§6 节奏**：插入 **Week 0（3 天）spike**，先验证高风险源；总周期 4 周 + 3 天。
- **§7C** 美股「期权 P/C 比」改用 CBOE 日度公开数据（如不可得则砍这一列）。
- **§7E** 交易赛源分 tier-1/2/3。
- **§8** 加 cold-start、hard max-age、fixture 脱敏、weight-based 限速校验等条目。

---

## §1 架构（v2 增 cold-start + hard max-age）

同 v1 三层（React → Hono → Redis），新增：

- **stale 策略升级**：
  - 单 key 三态：`fresh`（age ≤ TTL）/ `stale`（TTL < age ≤ hardMax）/ `cold`（无数据或 age > hardMax）。
  - `hardMax = 6h`（全板块统一；可个别 override）。
  - `fresh` 返 `data + stale:false`；`stale` 返 `data + stale:true + ageSec`；`cold` 返 `data:null + error:{code:"COLD",message}`，前端显示「数据加载失败，X 分钟后自动重试」。
- **per-IP 限速**：Hono middleware，每路由每 IP 60 req/min，超出 429。
- **后端不持密钥**：所有第三方 key 在 `.env`，前端永不见。

---

## §2 目录结构（v2 改 sections 之 Web3Earn → StablecoinYields）

```
skills/dashboard-clone/
├── PLAN_DASHBOARD_v2.md
├── package.json / pnpm-workspace.yaml
├── apps/
│   ├── web/src/
│   │   ├── App.tsx / main.tsx
│   │   ├── components/  (TopBar, PriceTicker, Card, Sparkline, Badge, Table, StaleBanner, ColdState)
│   │   ├── sections/    (Stocks, TradingComp, MarketAnalysis, DefiRank, LiquidityPools,
│   │   │                 SectorMovers, OnchainStocks, StablecoinYields, GithubRepos)
│   │   ├── hooks/useDashboardQuery.ts
│   │   └── lib/format.ts
│   └── api/src/
│       ├── index.ts                    # Hono + rateLimit + schemas
│       ├── cache.ts                    # fresh/stale/cold 三态
│       ├── schemas.ts                  # zod 入参 schema
│       ├── ticker.ts
│       ├── adapters/
│       │   ├── stocks.ts               # 美/港股 = Polygon + Yahoo 兜底；A 股 = 东方财富 HTTP
│       │   ├── tradingComp.ts          # tier-1/2/3 源
│       │   ├── marketAnalysis.ts       # Binance K + indicators + 资讯 RSS
│       │   ├── defiRank.ts             # DefiLlama
│       │   ├── liquidityPools.ts       # DefiLlama yields
│       │   ├── sectorMovers.ts         # CoinGecko + CMC 兜底
│       │   ├── onchainStocks.ts        # 仅价格 + 24h + 市值 + holders
│       │   ├── stablecoinYields.ts     # DefiLlama yields filter stablecoin
│       │   └── githubRepos.ts          # GitHub REST
│       ├── indicators.ts
│       ├── fixtures/                   # 实测响应 sample（**脱敏后**入库）
│       └── types.ts
├── packages/shared/src/types.ts
├── docker-compose.yml  (redis 6379)
└── README.md
```

---

## §3 数据源矩阵 v2

| 板块 | 主源 | 真实 endpoint | Auth | 限速口径 | 缓存 TTL | hardMax | 降级 |
|---|---|---|---|---|---|---|---|
| **顶部行情条** | Binance + Yahoo v8 + DefiLlama | Binance `GET /api/v3/ticker/24hr?symbols=["BTCUSDT","ETHUSDT",...]`（weight 取决于 symbols 数；7 symbols ≈ weight 28，安全）；Yahoo `https://query1.finance.yahoo.com/v8/finance/chart/{T}` 拉股指；DefiLlama `https://api.llama.fi/v2/chains` + `/global`（总市值/BTC.D） | 无 | Binance weight 6000/min IP；Yahoo 无官方 quota 实测约 100/h 后会 429；DefiLlama 宽松 | 30s | 5min | CMC（如有 key）拉股指 |
| **股票市场（美/港）** | Polygon | `GET /v2/snapshot/locale/us/markets/stocks/tickers?tickers=AAPL,NVDA,...`（一次拉一批） + 港股 `/v2/snapshot/locale/global/markets/stocks/tickers`（HK 行情需企业版，若无则砍港股） | API key（免费 5/min，付费 unlimited） | 免费 5/min → MVP 必须付费 Stocks Starter（$29/月） | 90s | 6h | Yahoo v8 仅作**非官方降级**，写 `source:"yahoo-unofficial"` 给前端展示 |
| **股票市场（A 股）** | 东方财富 web HTTP | `https://push2.eastmoney.com/api/qt/clist/get?fs=m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23&fields=f12,f14,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f15,f16,f17,f18,f22,f33,f62`（沪深 A 股全表）+ `https://push2.eastmoney.com/api/qt/stock/get?secid=1.600519&fields=...`（个股详情） | 无 | 实测无明显限速，加 UA 模拟浏览器；保险起见后端单 IP 120 req/min 内 | 90s | 6h | 同花顺 `qt.10jqka.com.cn/quote.php?cate=ALL` 备援 |
| **交易赛** | 分级源 | **tier-1 官方 API**（OKX `/api/v5/public/announcements?annType=announcements-airdrop` 公开）/ **tier-2 RSS**（PANews/Foresight News/ChainCatcher RSS）/ **tier-3 HTML 爬虫**（Bitget/Gate/Bybit 活动页） | 多数无 | 各异，统一加 30s 间隔 | 15m | 24h | tier-3 失败时静默砍该交易所卡片，不挂全板块 |
| **行情解析** | Binance + RSS | `GET /api/v3/klines?symbol=BTCUSDT&interval=1h&limit=300`（>= 35 根 MACD warmup，取 300 富余）+ PANews RSS `https://www.panewslab.com/rss-zh.xml` | 无 | Binance weight 2，宽松 | 60s（K）/30s（资讯） | 1h | 砍资讯保 K 线 |
| **DeFi 协议榜** | DefiLlama | `https://api.llama.fi/protocols`（全量 ~1.5MB，gzip）+ `https://api.llama.fi/overview/fees?excludeTotalDataChart=true` | 无 | 公开宽松，无配额 | 5m | 6h | 无替代，依赖单源 |
| **流动性池子** | DefiLlama Yields | `https://yields.llama.fi/pools`（~5MB，gzip 必开）；server 侧 sort + slice top 200 | 无 | 宽松 | 5m | 6h | 无 |
| **板块异动** | CoinGecko + CMC backup | CG `https://api.coingecko.com/api/v3/coins/categories`（不需要 OHLC，category 自带 24h%、market_cap、volume） | 免费 demo key（30/min + 10000/月） | **不再用 OHLC**（每分类一次 fetch 月额度会爆）；改用 categories 接口 1 次/5min + 每类**代表币的 sparkline**（CG `coins/markets?sparkline=true`，一次拿 100 币的 7d sparkline） | 5m | 6h | CMC `categories` endpoint（如有 key） |
| **链上美股** | 发行方 API + 链上读 | xStocks `https://api.xstocks.com/tokens`（先 curl 验证；若 401/404 → 退到链上）；Ondo 公开 token list；Backed 类似；价格走 CoinGecko + Solana SPL holder 数走 Helius/Solscan 公开端点 | xStocks/Ondo 待实测；Helius 免费 100K/月 | 仅 4 列（价格/24h/市值/holders），**无 APY** | 5m | 12h | 单发行方失败砍那批 token，不挂板块 |
| **稳定币收益榜（替代 Web3 理财）** | DefiLlama Yields | 同流动性池子接口，server 侧 filter `stablecoin: true && exposure: single` | 无 | 宽松 | 5m | 6h | 无 |
| **GitHub 库** | GitHub REST | `GET /repos/{owner}/{name}` 一次拿 stars + primary language + 默认分支（**不再调 `/languages`**）；批量用并发 5；预定义 92 仓库白名单 | PAT token（read-only, public_repo scope） | 5000/h 认证，60/h 未认证 | 1h | 6h | 未认证 fallback 仅显示 stale 数据 |

---

## §4 后端 API 表（v2 加 schema + rate limit + 脱敏 error）

```
GET /api/ticker
GET /api/stocks?region=us|hk|cn&sector=...
GET /api/trading-comp?exchange=okx|bitget|gate|bybit|binance-wallet
GET /api/market-analysis?symbol=BTCUSDT|ETHUSDT|SOLUSDT&interval=1h|4h|1d
GET /api/defi-rank?sort=tvl|fees|volume&limit=10..100
GET /api/liquidity-pools?chain=ethereum|...|all&sort=tvl|apr&limit=10..200
GET /api/sector-movers?market=crypto&category=ai|rwa|...
GET /api/onchain-stocks?issuer=ondo|xstocks|backed|all
GET /api/stablecoin-yields?asset=USDT|USDC|DAI|all&limit=10..100
GET /api/github-repos?category=...
GET /api/health     # 仅返 {adapter: ok|stale|cold, ageSec}，不带原始 URL/error
```

**入参 zod schema 示例**（schemas.ts）：

```ts
const StocksQuery = z.object({
  region: z.enum(["us", "hk", "cn"]),
  sector: z.string().max(40).regex(/^[a-z0-9_-]+$/).optional(),
});
```

- 所有 enum / regex / `.max()` 严格收敛；未匹配 schema 直接 400。
- `limit` 全部带上下限（`.min(10).max(200)`），防资源放大。
- 后端 per-IP rate limit：Hono `hono-rate-limiter`，每 path 60 req/min，超 429。

**统一响应包络（v2）**：

```ts
{
  data: T | null,
  meta: { fetchedAt, source, cacheTtlSec, ageSec, state: "fresh"|"stale"|"cold" },
  error?: { code: "COLD"|"UPSTREAM_DOWN"|"RATE_LIMITED"|"BAD_QUERY", message: string }
  // ⚠ error.message 是固定枚举文案，永不带原始 URL / header / token / stack
}
```

`/api/health` 只返 `{adapter, state, ageSec}`，不带任何上游细节。

---

## §5 前端（v2 微调）

- `sections/Web3Earn.tsx` → `sections/StablecoinYields.tsx`
- `OnchainStocks.tsx` 表头改为：`代币 / 发行方 / 分类 / 价格 / 24H / 市值 / Holders`（移除 APY/全协议年化两列）
- 新增 `<ColdState/>` 组件，显示「数据未加载，X min 后重试」+ retry 按钮（手动 invalidate query）

---

## §6 分阶段交付（v2 加 Week 0 spike）

```
Week 0 (3 天) — SPIKE / 高风险源验证（编码前必跑）
  Day 1: curl 验证 Polygon snapshot 真返回字段（付不付费决策）；东方财富 push2 真返回；
         xStocks/Ondo/Backed 是否真公开 API
  Day 2: OKX announcements 公开 endpoint；PANews/CoinDesk RSS 真可用；CBOE 期权 P/C
  Day 3: CoinGecko categories 月额度核算；GitHub PAT 拿到 + 92 仓库白名单定稿
  → 每个 spike 产物：fixture JSON + 笔记，确认能拿/不能拿。不能拿的源在 plan v3 中替换或砍掉。

Week 1: GitHub 库 + DeFi 协议榜 + 流动性池子 + 稳定币收益榜（全 DefiLlama 复用）
        + 项目脚手架 + Card/Table/Sparkline 组件 + Redis docker
        → 周末 4 个真实板块

Week 2: 行情解析 + 板块异动 + 顶部行情条
        + indicators.ts (MA/Boll/RSI/MACD)
        → 周末顶部行情 + 6 个板块

Week 3: 链上美股 + 股票市场 (美/港)
        + 仅 4 列；A 股留 Week 4
        → 周末 8 个板块（A 股 + 交易赛 待）

Week 4: 股票市场 (A 股 东方财富) + 交易赛 (tier-1 OKX + tier-2 RSS, tier-3 留作 backlog)
        + /api/health 监控页
        → 周末 9 板块全上
```

---

## §7 关键决策 v2

- **A**（沿用）：所有上游统一过后端，前端无 key。
- **B**（沿用 + 强化）：单源失败仅挂自身板块；新增 `hardMax=6h` 边界 + `state="cold"` 显式提示。
- **C**：美股不复刻「主力净流入」；「AI 热度」改用 **CBOE 期权日度 P/C 比**（公开 https://www.cboe.com/us/options/market_statistics/daily/，CSV 日终）— 若 Week 0 spike 验证不可用就**砍这一列**，不强行替代。
- **D**：链上美股**不显示 APY 列**，只展示 价格 / 24h / 市值 / holders 四列。
- **E**：交易赛源分级 — **tier-1**：OKX announcements 等官方 API（强信任）；**tier-2**：PANews / Foresight News / ChainCatcher RSS（中信任，去重）；**tier-3**：HTML 爬虫（Bitget/Gate/Bybit 活动页，仅 best-effort，挂掉静默砍卡片，不挂板块）。
- **F**（重写 v1 F）：**取消 CEX 理财板块**。替换为「稳定币收益榜」纯走 DefiLlama Yields filter（链上 stablecoin 单边池）。
- **G**（新增 v2）：A 股走东方财富 push2 HTTP 接口（Node 原生），不挂 Python 子进程；同花顺备援。
- **H**（新增 v2）：后端所有路由 zod schema + per-IP 60/min；上游 error 全枚举化不外泄。

---

## §8 BLOCKER CHECKLIST v2（实施期必验）

按 v1 12 条 + 新增/修订：

1. **Polygon snapshot**：先 curl `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?tickers=AAPL,NVDA&apiKey=...`，确认返回字段、付费 plan 才放编码。
2. **DefiLlama `/protocols`** 真返回字段名 + null（fees/revenue 字段经常 null）；gzip 必开；前端不全量灌。
3. **DefiLlama yields `/pools`** 2 万池 → 后端按 sort + filter 后再切片。
4. **GitHub `/repos/{}`** 一次拿主 language 是否够替代 `/languages`？测一个仓库的 `language` 字段。
5. **CoinGecko 月额度 10000 + 错误请求计数**：所有 4xx/5xx 都计；后端必须先校验 query 再发请求；超额降级到 stale 不 retry。
6. **xStocks / Ondo / Backed**：Week 0 Day 1 curl 验证；任何一家不公开 → 那部分 token 用链上读 + CoinGecko 价格代替。
7. **东方财富 push2 接口**：实测 UA + Referer 是否需要；返回的 f2/f3/f12 等数字 field 映射要从浏览器 devtools 反推贴 fixture。
8. **交易赛 HTML 爬虫 tier-3**：每个适配器内置 schema fingerprint（关键 selector 命中率），命中率 < 50% 直接降级到 cold + alarm。
9. **CBOE P/C ratio CSV**：URL + 字段格式 spike；下载 CSV 解析；不可得就**砍 P/C 列**。
10. **OKX 公开 announcements 字段**：先 curl，patterns 2026-04-30 警示 OKX 字段命名陷阱。
11. **Binance weight 真核算**：`/ticker/24hr?symbols=[7 syms]` weight = 4×7 = 28 还是单价 2？以响应头 `X-MBX-USED-WEIGHT-1M` 为准；ticker.ts 加 `if (weight > 5500) sleep` 防超限。
12. **AKShare 移除**：v1 §3 行整行删除，所有 fixture / adapter 不出现 Python 依赖。
13. **fixture 落盘脱敏**：`apps/api/src/fixtures/*.json` 必须删除 `Authorization`/`Cookie`/`X-API-Key`/`set-cookie` 头；只存 body sample；落盘前过滤器统一在 `fixtures/scrub.ts`。
14. **rate limit 中间件**：`/api/health` 不计在 60/min 内；其余路径走标准 limiter；写测试覆盖 429 路径。
15. **cold state**：每 adapter 写一个测试用例：清空 cache → 首次失败 → 返 `state:"cold"` + 不卡 hang。

---

## §9 给 Codex review v2 的问题

只评：
1. v1 → v2 是否真把 5 条 BLOCKING 全闭环（Web3 理财改稳收益榜 / Polygon URL / A 股决策 / API 安全边界 / 链上美股 APY）。
2. 数据源矩阵 §3 v2 是否还有错（重点：Polygon HK 是否真要付费 / 东方财富 push2 真公开 / CoinGecko categories 真有 sparkline）。
3. Week 0 spike 3 天够不够；Week 1-4 排序还合理吗。
4. §7 决策 C（P/C 比）若 Week 0 验证不可得后是否需要预备替代方案，还是接受直接砍列。
5. §8 BLOCKER CHECKLIST 还漏什么。

**不评**：组件命名 / 目录结构 / 文本措辞。

如 Codex 仍 REQUEST CHANGES 且本轮没框架性翻盘，按 patterns 2026-05-01 「plan-review 6-8 轮拐点」规则，转入 BLOCKER CHECKLIST 实施。

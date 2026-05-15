# PLAN_DASHBOARD_v3 — 仪表盘动态克隆（v2 → v3 修订版）

> **目标**：复刻 https://import-command-query-8ca052.surf.computer/ 的 9 个板块 UI，所有数据走真实 API + 缓存。
> **9 个板块（v3 最终）**：股票市场（仅美/A）/ 交易赛 / 行情解析 / DeFi 协议榜 / 流动性池子 / 板块异动（无 K 线缩略）/ 链上美股（4 列）/ 稳定币收益榜 / GitHub 库。
> **不在范围**：移动端、历史回填、告警、用户系统、登录态、**港股**（v3 砍）、**AI 热度 / 主力净流入 / 板块异动缩略 K 线 / 链上美股 APY**（v3 全砍）。
> **数据真实性优先级**：完全真实 > 标记「估算」的近似 > 砍掉。所有"算不出来或拿不到"的列一律不显示，绝不假装。

## v2 → v3 主要变更（覆盖 Round 2 review 3 个 BLOCKING）

- **决策 Q4 = (a)**：港股 MVP **砍**。`/api/stocks?region=hk` 直接 404；前端 TopBar 港股 tab 隐藏。
- **决策 Q5 = (a)**：板块异动 **砍 24×4h 缩略 K 线**。板块卡片只留 `分类名 / 24h% / 市值 / 量 / 币数 / 热度`。
- **新决策 I**：链上美股**价格不走 CoinGecko**，改走 **DefiLlama coins `/prices/current/{chain}:{addr}`**（免费、无限速）；CoinGecko 全站只服务板块异动一个接口，配额 8640/月（categories 1/5min × 30d）≤ 10000/月免费上限，留 1360 buffer。
- **新决策 J**：链上美股增 **静态 token-allowlist.json**（人工维护 Top 50：xStocks / Ondo / Backed）；token list issuer API 不公开时直接读 allowlist + DefiLlama 价格 + Solscan holders，不再依赖 issuer API。
- **新决策 K**：CBOE P/C 比**直接砍列**。前端股票表不出现 "AI 热度" 列。原站 "主力净流入" 同步不复刻。
- **§3** Yahoo 港股、CBOE 全删；CoinGecko sparkline 全删；新增 Solscan holders、DefiLlama coins prices。
- **§4** `/api/stocks` 入参 region enum 改 `us|cn`；`/api/sector-movers` 响应不含 sparkline。
- **§6** Week 0 spike 改 **5 天**，加 DefiLlama `/protocols`/`/pools`/stablecoin filter + GitHub `/repos` 也进 spike。
- **§7** tier-3 失败语义统一：**单交易所卡片 cold**，板块整体仍 fresh；tier-1/2 全挂时板块整体 cold + alarm。
- **§8** 加：CG 全站 budget 校验、Solscan endpoint + 10 req/s 限速、Hono `trustProxy` 边界、上游 fetch timeout 5s + 1 次 retry、stablecoin yields 字段真实性、HTTP gzip 必开。
- **NIT**：表达修正为「前端不持密钥，后端 env 持有」；CBOE 砍后 hardMax 单点 override 自然消失，全站统一 6h。

---

## §1 架构（同 v2，无变更）

三层 React → Hono → Redis；三态缓存 `fresh/stale/cold`；hardMax = 6h（全站统一，v3 无 override）；per-IP 60/min rate limit；后端 env 持密钥，前端永不见。

新增：**Hono 的 `trustProxy` 仅信任本机环回 + 自部署的反向代理 IP allowlist**（避免被伪造 `X-Forwarded-For` 绕过限速）。

新增：**上游 fetch 统一 5s timeout + 1 次指数退避 retry**（封装在 `apps/api/src/fetchWithRetry.ts`）。

---

## §2 目录结构（v3 增量）

```
skills/dashboard-clone/
├── PLAN_DASHBOARD_v3.md
├── apps/api/src/
│   ├── token-allowlist.json         # ★ v3 新增：链上美股静态白名单 50 条
│   ├── github-allowlist.json        # ★ v3 新增：GitHub 92 仓库白名单
│   ├── fetchWithRetry.ts            # ★ v3 新增：5s timeout + 1 retry
│   ├── cgBudget.ts                  # ★ v3 新增：CoinGecko 月预算守卫
│   └── adapters/
│       ├── onchainStocks.ts         # 改：读 allowlist + DefiLlama 价 + Solscan holders
│       ├── sectorMovers.ts          # 改：仅 categories，无 sparkline
│       └── stocks.ts                # 改：region 只接受 us|cn
└── （其余同 v2）
```

`token-allowlist.json` schema：

```json
[
  {"symbol":"TSLAX","chain":"solana","contract":"XsbE...","issuer":"xstocks","category":"七姐妹"},
  {"symbol":"NVDAON","chain":"ethereum","contract":"0x...","issuer":"ondo","category":"七姐妹"}
]
```

---

## §3 数据源矩阵 v3

| 板块 | 主源 | 真实 endpoint | Auth | 限速口径 | 缓存 TTL | hardMax | 降级 |
|---|---|---|---|---|---|---|---|
| **顶部行情条** | Binance + Yahoo v8 + DefiLlama | Binance `GET /api/v3/ticker/24hr?symbols=["BTCUSDT","ETHUSDT","SOLUSDT","BNBUSDT","DOGEUSDT"]` (5 symbols, weight 20)；Yahoo `https://query1.finance.yahoo.com/v8/finance/chart/^GSPC` / `^IXIC` / `000001.SS`；DefiLlama `/v2/chains` + `/global` | 无 | Binance weight 6000/min；Yahoo 实测 ~100/h 后 429；DefiLlama 宽松 | 30s | 5min | 单源挂自己，不挂全条 |
| **股票市场（美）** | Polygon | `GET /v2/snapshot/locale/us/markets/stocks/tickers?tickers=AAPL,NVDA,...` | API key（**MVP 必付费 Stocks Starter $29/月**；Week 0 Day 1 验证后决定继续与否） | 付费版 unlimited | 90s | 6h | Yahoo v8 非官方降级，`source:"yahoo-unofficial"` 给前端展示徽章 |
| **股票市场（A 股）** | 东方财富 push2 | `https://push2.eastmoney.com/api/qt/clist/get?fs=m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23&fields=f12,f14,f2,f3,...` (UA 模拟浏览器) | 无 | 后端单 IP 自限 120/min | 90s | 6h | 同花顺 `qt.10jqka.com.cn` |
| **股票市场（港）** | — | — | — | — | — | — | **v3 砍。`/api/stocks?region=hk` 返 404；前端 TopBar 隐藏港股 tab** |
| **交易赛** | 分级源 | tier-1 OKX `/api/v5/public/announcements?annType=announcements-airdrop`；tier-2 **PANews / Foresight News / ChainCatcher RSS**（**不含 CoinDesk**）；tier-3 Bitget/Gate/Bybit HTML | 多数无 | 各源 30s 间隔 | 15m | 24h | **tier-3 失败 = 单交易所卡片 cold**；tier-1/2 全挂才板块整体 cold |
| **行情解析** | Binance + PANews RSS | `/api/v3/klines?symbol=BTCUSDT&interval=1h&limit=300` + `https://www.panewslab.com/rss-zh.xml` | 无 | Binance weight 2 | 60s/30s | 1h | 资讯挂掉只保 K |
| **DeFi 协议榜** | DefiLlama | `https://api.llama.fi/protocols` + `/overview/fees?excludeTotalDataChart=true`（**gzip 必开**） | 无 | 宽松 | 5m | 6h | 无替代 |
| **流动性池子** | DefiLlama Yields | `https://yields.llama.fi/pools`（**gzip 必开**，server 侧 sort + slice top 200） | 无 | 宽松 | 5m | 6h | 无 |
| **板块异动** | CoinGecko | `https://api.coingecko.com/api/v3/coins/categories`（自带 `top_3_coins_id`、`market_cap_change_24h`、`market_cap`、`volume_24h`）；**v3 不再调 `coins/markets?sparkline`**；**v3 不显示缩略 K 线** | 免费 demo key（30/min + 10000/月） | **全站只用此 1 个 endpoint**；1 次/5min = 8640/月（buffer 1360） | 5m | 6h | CMC（如有 key），否则 cold |
| **链上美股** | **token-allowlist + DefiLlama coins + Solscan** | 价：DefiLlama `https://coins.llama.fi/prices/current/solana:{addr},ethereum:{addr}`（一次最多 100 个 token）；holders：Solscan `https://public-api.solscan.io/token/holders?tokenAddress={addr}&limit=1`（仅取 total） | DefiLlama 无；Solscan public 10 req/s | DefiLlama 宽松；Solscan 50 个 token 串行 5s 内拿完 | 5m | 12h | 单 token 失败显示 `—`，不挂板块 |
| **稳定币收益榜** | DefiLlama Yields | 同 `/pools`，server 侧 filter `stablecoin: true && exposure: "single"` | 无 | 宽松 | 5m | 6h | 无 |
| **GitHub 库** | GitHub REST | `GET /repos/{owner}/{name}`（一次拿 stars + language + pushed_at；**不调 `/languages`**）；92 仓库白名单 in `github-allowlist.json`；并发 5 | PAT token (read-only public_repo) | 5000/h | 1h | 6h | 未认证 60/h fallback，全部进 stale |

---

## §4 后端 API 表（v3 改 stocks/sector-movers）

```
GET /api/ticker
GET /api/stocks?region=us|cn&sector=...           # ★ v3：region 去 hk
GET /api/trading-comp?exchange=okx|bitget|gate|bybit|binance-wallet
GET /api/market-analysis?symbol=BTCUSDT|ETHUSDT|SOLUSDT&interval=1h|4h|1d
GET /api/defi-rank?sort=tvl|fees|volume&limit=10..100
GET /api/liquidity-pools?chain=ethereum|...|all&sort=tvl|apr&limit=10..200
GET /api/sector-movers?category=ai|rwa|...        # ★ v3：响应不含 sparkline 字段
GET /api/onchain-stocks?issuer=ondo|xstocks|backed|all
GET /api/stablecoin-yields?asset=USDT|USDC|DAI|all&limit=10..100
GET /api/github-repos?category=...
GET /api/health
```

**响应包络**：同 v2，`error.message` 固定枚举不外泄上游 URL。
**`/api/sector-movers` 响应字段（v3）**：`{ name, change24h, marketCap, volume24h, coinCount, heat }` — 无 `sparkline` 字段。
**`/api/onchain-stocks` 响应字段**：`{ symbol, issuer, category, price, change24h, marketCap, holders }` — 无 `apy`。

---

## §5 前端（v3 改）

- `TopBar.tsx`：18 按钮中港股相关 tab 不渲染（直接从可见列表移除，不显示 "coming soon"，避免误导用户以为之后会有）。
- `sections/SectorMovers.tsx`：板块卡片移除 `<Sparkline/>` 引用；表头无 K 线缩略列。
- `sections/OnchainStocks.tsx`：表头 7 列 `代币 / 发行方 / 分类 / 价格 / 24H / 市值 / Holders`。
- `sections/Stocks.tsx`：region tabs 仅 `美股 / A股`；不显示 AI 热度、主力净流入列；区段说明文案修正为「价格 + 振幅 + 52 周区间位置 + 成交量 + 日线连阳/连阴 + 24H」。

---

## §6 分阶段交付 v3（Week 0 改 5 天）

```
Week 0 (5 天) — SPIKE / 高风险源验证（编码前必跑完）
  Day 1: curl Polygon snapshot（决定付不付费）；东方财富 push2 字段反推 fixture
  Day 2: OKX announcements / PANews / Foresight News / ChainCatcher RSS spike
  Day 3: ★ DefiLlama 三接口 (`/protocols`、`/overview/fees`、`/yields/pools`) curl + 字段笔记
         + stablecoin filter 校验（pool 上的 `stablecoin` 和 `exposure` 字段实际命名）
  Day 4: ★ GitHub PAT 创建 + 92 仓库白名单定稿 + `/repos/{}` 字段实测
         + token-allowlist.json 50 条人工录入（symbol/chain/contract/issuer 4 字段）
  Day 5: ★ CoinGecko categories 月预算验证 + Solscan holders 限速实测 + DefiLlama coins prices 真返回字段
         + 收尾：把 Day 1-4 所有 fixture 入 `apps/api/src/fixtures/`（**脱敏后**）+ 写一页 SPIKE_RESULTS.md
  → 任何一条 spike 不过：plan v4 调整或砍掉对应板块。

Week 1: GitHub 库 + DeFi 协议榜 + 流动性池子 + 稳定币收益榜
        + 项目脚手架 (workspace, tailwind, hono, redis docker)
        + Card/Table 组件（无 Sparkline，v3 没需求了；行情解析的 K 用 lightweight-charts）
        + fetchWithRetry.ts + cgBudget.ts + cache.ts (三态)
        → 周末 4 个真实板块 + 顶部行情条骨架

Week 2: 行情解析 + 板块异动 + 完整顶部行情条
        + indicators.ts (MA/Boll/RSI/MACD)
        → 周末 6 个板块

Week 3: 链上美股（仅 4 列）+ 股票市场（美股 Polygon）
        + token-allowlist.json 联调
        → 周末 8 个板块

Week 4: 股票市场（A 股 东方财富）+ 交易赛（tier-1 OKX + tier-2 RSS；tier-3 backlog）
        + /api/health 监控页 + 429/cold 路径测试
        → 周末 9 板块全上
```

---

## §7 关键决策 v3 汇总

- **A**：所有上游过后端，**前端不持密钥，后端 env 持有**（v3 NIT 修正）。
- **B**：单源失败仅挂自身板块；`hardMax = 6h` 统一全站；`state="cold"` 显式提示。
- **C**：~~CBOE P/C~~ **直接砍 AI 热度列**（v3 决策 K）；股票表无此列。
- **D**：链上美股**仅 4 列**（价格 / 24H / 市值 / Holders），无 APY。
- **E**：交易赛源分级；**tier-3 失败 = 单交易所卡片 cold**（不挂板块整体）；tier-1/2 全挂才板块整体 cold + alarm。
- **F**：取消 CEX 理财；用「稳定币收益榜」（DefiLlama Yields filter）。
- **G**：A 股走东方财富 push2 HTTP（Node 原生）；同花顺备援。
- **H**：所有路由 zod schema + per-IP 60/min；上游 error 全枚举化不外泄。
- **I**（v3）：链上美股**价格走 DefiLlama coins**，CoinGecko 全站只用于板块异动；月预算守卫 cgBudget.ts。
- **J**（v3）：链上美股用**静态 token-allowlist.json**（50 条人工录入），不依赖 issuer API。
- **K**（v3）：~~港股~~ **MVP 砍**；TopBar 隐藏，`/api/stocks?region=hk` 返 404。

---

## §8 BLOCKER CHECKLIST v3（实施期必验）

v2 15 条 + v3 新增/修订：

1. Polygon snapshot 真返回字段 + 付费版决策（Week 0 Day 1）
2. DefiLlama `/protocols` 字段名 + null（fees/revenue 经常 null）；**gzip 必开**
3. DefiLlama yields `/pools` server 侧 sort + filter 后切片
4. GitHub `/repos/{}` 单次拿 `language` 字段是否够（不调 `/languages`）
5. **CoinGecko 全站月预算 ≤ 10000**：`cgBudget.ts` 实现请求计数 + 日落账（用 Redis counter），4xx/5xx 都计数；超 9500 进 stale-only 模式不再发新请求
6. **token-allowlist.json 50 条人工维护**：Week 0 Day 4 必须完成录入，**绝不在运行时生成**（来源不可信）；schema 校验 + CI 检查重复 contract
7. 东方财富 push2 UA/Referer 实测；f2/f3/f12 等数字字段映射从 devtools 反推
8. 交易赛 HTML 爬虫 tier-3 内置 schema fingerprint；命中率 < 50% **降级单交易所卡片到 cold**（不挂板块整体）；tier-1/2 全挂才板块 cold
9. ~~CBOE~~ 已砍，无需 spike
10. OKX 公开 announcements 字段（patterns 2026-04-30 字段命名陷阱）
11. Binance weight 真核算：响应头 `X-MBX-USED-WEIGHT-1M`；`ticker.ts` 加 `if weight > 5500 sleep` 防超限
12. ~~AKShare~~ 已移除
13. fixture 落盘脱敏：`fixtures/scrub.ts` 统一过滤 `Authorization/Cookie/X-API-Key/set-cookie`；仅存 body sample
14. rate limit 中间件：`/api/health` 不计；其他 60/min；429 路径测试
15. cold state：每 adapter 写测试用例（清空 cache → 首次失败 → 返 `state:"cold"` + 不卡 hang）
16. **（v3 新）stablecoin yields 字段真实性**：`pools` 接口的 `stablecoin` 字段类型（boolean 还是字符串？）+ `exposure` 取值枚举；Week 0 Day 3 spike 确认
17. **（v3 新）Solscan holders endpoint**：`https://public-api.solscan.io/token/holders` 真返回（总数字段名？要不要 paginate？）；10 req/s 限速实测；50 个 token 串行 5s 内能否完成
18. **（v3 新）DefiLlama coins prices**：`https://coins.llama.fi/prices/current/{chain}:{addr},{chain}:{addr}` 一次最多多少个？响应字段（`coins.{chain}:{addr}.price`）；价为 null 时怎么显示
19. **（v3 新）Hono trustProxy 边界**：默认**不信**任 `X-Forwarded-For`；只在配置 `TRUSTED_PROXIES` env 包含上游 IP 时才解析；生产部署测一次伪造 header 是否能绕开 60/min
20. **（v3 新）fetchWithRetry**：5s timeout（AbortController）+ 1 次 retry（指数退避 1s）；retry 计数也算 CG 月度配额
21. **（v3 新）gzip**：DefiLlama `/protocols` ~1.5MB、`/pools` ~5MB 必须 `Accept-Encoding: gzip`（Node 18+ undici 默认开，但要校验响应头 `content-encoding: gzip`）
22. **（v3 新）港股 404 路径**：`/api/stocks?region=hk` 必须返 400/404 + `error.code:"BAD_QUERY"`；前端 TopBar 不渲染该 tab

---

## §9 给 Codex review v3 的问题

只评：
1. v2 → v3 三个 BLOCKING 是否真闭环（CG 月预算 / 链上美股 fallback 可执行 / CBOE 砍列后前端 schema 清洁）。
2. **§3 v3** 新源（DefiLlama coins prices、Solscan holders）endpoint 是否真公开真免费；月预算算法 8640 是否漏算 retry 计数。
3. **§7 决策 I/J/K** 是否还有副作用（如砍港股后顶部行情条要不要也砍恒生指数？v3 暂保留 Yahoo `^HSI` 拉，仅顶部条展示，板块层不出现）。
4. **§8 v3 新增条目 16-22** 还漏什么实施期陷阱（特别是 trustProxy / fetchWithRetry / gzip / 港股 404）。
5. Week 0 改 5 天是否够；token-allowlist.json Day 4 一天能否人工录入 50 条 + schema 校验。

**不评**：组件命名 / 目录结构 / 措辞 / 已闭环的 v1/v2 历史条目。

如本轮 Codex APPROVE 或仅 NIT，**转入 BLOCKER CHECKLIST 实施期**（patterns 2026-05-01 「6-8 轮拐点」：v3 是第 3 轮，BLOCKING 已减到 0 即可推进）。

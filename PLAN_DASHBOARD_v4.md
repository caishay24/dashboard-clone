# PLAN_DASHBOARD_v4 — 仪表盘动态克隆（v3 → v4 收敛版）

> **目标**：复刻 https://import-command-query-8ca052.surf.computer/ 的 9 个板块 UI，所有数据走真实 API + 缓存。
> **9 个板块**：股票市场（美/A）/ 交易赛 / 行情解析 / DeFi 协议榜 / 流动性池子 / 板块异动 / 链上美股 / 稳定币收益榜 / GitHub 库。
> **不在范围**：移动端、历史回填、告警、用户系统、登录态、**港股板块**（顶部行情条仍含恒生指数，仅展示，无板块 tab）、**链上美股市值列**（v4 砍）、**Binance Wallet 交易赛源**（v4 backlog）。
> **数据真实性优先级**：完全真实 > 标记「估算」的近似 > 砍掉。

## v3 → v4 主要变更（覆盖 Round 3 review 2 BLOCKING + 6 CHANGES + 2 NIT）

- **BLOCKING ❶ 修复**：`hardMax` 自相矛盾 → §1/§7 改为「默认 6h，按板块覆盖；具体值见 §3 hardMax 列」。
- **BLOCKING ❷ 修复**：链上美股 24h%/marketCap 无来源 → 24h% 走 **DefiLlama `coins.llama.fi/percentage/{coins}?period=24h`**（已 curl 验证返回 `coins.{chain}:{addr}` = 数字百分比）；**marketCap 列直接砍**（tokenized stock supply 不稳定，按"算不出就砍"原则）。表头从 7 列 → 6 列。
- **CHANGE**：Solscan 限速明确化 → 并发 5 / 限速 5 req/s（在 10 req/s 上限内留 buffer）/ 总超时 15s / 单 token 失败显示 `—`；不影响其他 token。
- **CHANGE**：顶部行情条恒生指数定稿 **保留**（Yahoo `^HSI`），仅在 PriceTicker 出现；板块层无港股 tab。
- **CHANGE**：HK 404 状态码定稿 → 统一 **400 + `error.code:"BAD_QUERY"`**（v3 §4 / §8 措辞冲突收敛）。
- **CHANGE**：`/api/trading-comp` exchange enum 去掉 `binance-wallet`（无公开 API，MVP backlog）→ enum = `okx|bitget|gate|bybit`。
- **CHANGE**：GitHub PAT 改 **fine-grained token, no repository scope, public-only metadata read**（不用经典 `public_repo` scope）。
- **CHANGE**：token-allowlist.json schema 统一 5 字段（`symbol/chain/contract/issuer/category`）；Week 0 Day 4 录入 50 条 + zod 校验 + CI 重复 contract 检查。
- **NIT**：§6 Week 4 tier-3 HTML 爬虫明确标 **MVP backlog**（不在 4 周内做）；§3 tier 失败语义保留但默认无 tier-3 卡片渲染。
- **NIT**：§5 "4 列" 措辞改 "3 个指标列（含 token/issuer/category 共 6 列表头）"。

---

## §1 架构（v4 修 hardMax 表述）

三层 React → Hono → Redis；三态缓存 `fresh/stale/cold`。

**hardMax = 默认 6h；按板块覆盖**（具体值见 §3 hardMax 列）。设计意图：高频源（顶部行情条）`hardMax=5min` 避免显示半小时前的价格；低频源（交易赛 RSS / 链上美股 holders）放宽到 12-24h 允许长时间 stale。

`cache.ts` 实现：`getOrFetch(key, ttl, hardMax, fetcher)`；hardMax 不是全局常量而是 per-key 参数。

per-IP 60/min rate limit；**Hono `trustProxy` 默认关；仅 `TRUSTED_PROXIES` env 配置的上游 IP 才解析 `X-Forwarded-For`**。

上游 fetch 统一 5s timeout + 1 次指数退避 retry（`apps/api/src/fetchWithRetry.ts`）；retry 也计入 CG 月度配额。

---

## §2 目录结构（v4 token-allowlist schema 改 5 字段）

```
skills/dashboard-clone/apps/api/src/
├── token-allowlist.json          # ★ 5 字段：symbol/chain/contract/issuer/category
├── github-allowlist.json
├── fetchWithRetry.ts
├── cgBudget.ts
├── cache.ts                       # getOrFetch(key, ttl, hardMax, fetcher)
└── adapters/
    ├── onchainStocks.ts           # 价 = DefiLlama prices; 24h% = DefiLlama percentage; holders = Solscan
    ├── sectorMovers.ts            # 仅 categories，无 sparkline
    └── ...（其余同 v3）
```

`token-allowlist.json` 字段（5 个，schema 与 Day 4 录入统一）：

```json
[
  {"symbol":"TSLAX","chain":"solana","contract":"XsbE...","issuer":"xstocks","category":"七姐妹"},
  {"symbol":"NVDAON","chain":"ethereum","contract":"0x...","issuer":"ondo","category":"七姐妹"}
]
```

---

## §3 数据源矩阵 v4

> **Round 4 review (APPROVED) 增量补充**（在文中相关位置另行体现）：
> - 链上美股 24h%：DefiLlama `/percentage` 须按 chain 分片调用（不混 EVM/Solana），单批 ≤ 30 个 coin，URL 中合约地址原样保留（**EVM 不强制 lower-case**，Solana 保持 base58）；批内 1 个 coin 不存在不影响其他 coin（实测 endpoint 行为：缺失 coin 在 `coins` 对象中省略 key，不报 400）。
> - **`/api/trading-comp` 非 OKX 交易所的失败语义**：MVP 内 `bitget|gate|bybit` 仅靠 tier-2 RSS 关键词过滤（搜 "Bitget" / "Gate" / "Bybit" 出现的活动条目）；若 RSS 无该交易所相关条目则返回该 exchange `data:[] + state:"fresh"`（**不是 cold**，明确表达"暂无活动"而非"数据缺失"）。
> - **链上美股 allowlist 数据真实性**：50 条录入必须从 **xStocks 官网 token list / Ondo Finance 官网 / Backed Finance 官网**三个发行方原始页面交叉核对，禁止从 CMC/CG 二手抓取；每条 allowlist 项要在 commit message 注明来源 URL。
> - **GitHub PAT 限速实测**：Week 0 Day 4 创建 fine-grained PAT 后，立即跑一次 92 仓库 burst 请求验证 `X-RateLimit-Limit: 5000`（响应头），确认 token 走 authenticated 配额而非 60/h 未认证档；若发现走 60/h，则改用 classic PAT no-scope（仍仅 public metadata 可访）。

| 板块 | 主源 | 真实 endpoint | Auth | 限速口径 | TTL | hardMax | 降级 |
|---|---|---|---|---|---|---|---|
| **顶部行情条** | Binance + Yahoo + DefiLlama | Binance `/api/v3/ticker/24hr?symbols=["BTCUSDT","ETHUSDT","SOLUSDT","BNBUSDT","DOGEUSDT"]`；Yahoo `/v8/finance/chart/^GSPC|^IXIC|000001.SS|^HSI`；DefiLlama `/v2/chains` + `/global` | 无 | Binance weight ≈ 20；Yahoo ~100/h；DefiLlama 宽松 | 30s | **5min** | 单源挂自己不挂全条 |
| **股票市场（美）** | Polygon | `/v2/snapshot/locale/us/markets/stocks/tickers?tickers=...` | API key（MVP 必付 Stocks Starter $29/月） | 付费 unlimited | 90s | **6h** | Yahoo v8 `source:"yahoo-unofficial"` 徽章 |
| **股票市场（A 股）** | 东方财富 push2 | `/api/qt/clist/get?fs=m:0+t:6,...&fields=f12,f14,f2,f3,...`（UA 模拟浏览器） | 无 | 后端自限 120/min | 90s | **6h** | 同花顺 `qt.10jqka.com.cn` |
| **股票市场（港）** | — | — | — | — | — | — | **v4 砍板块**；`/api/stocks?region=hk` → 400 + `BAD_QUERY` |
| **交易赛** | 分级 | tier-1 OKX `/api/v5/public/announcements?annType=announcements-airdrop`；tier-2 PANews / Foresight News / ChainCatcher RSS；tier-3 HTML 爬虫 **MVP backlog**（不实现） | 多数无 | 各源 30s 间隔 | 15m | **24h** | tier-3 默认空；tier-1/2 全挂才板块整体 cold |
| **行情解析** | Binance + PANews RSS | `/api/v3/klines?symbol=BTCUSDT&interval=1h&limit=300` + PANews `rss-zh.xml` | 无 | Binance weight 2 | 60s/30s | **1h** | 资讯挂只保 K |
| **DeFi 协议榜** | DefiLlama | `/protocols` + `/overview/fees?excludeTotalDataChart=true`（gzip 必开） | 无 | 宽松 | 5m | **6h** | 无替代 |
| **流动性池子** | DefiLlama Yields | `/pools`（gzip + server 侧 sort + slice top 200） | 无 | 宽松 | 5m | **6h** | 无 |
| **板块异动** | CoinGecko | `/api/v3/coins/categories`（自带 `market_cap_change_24h` / `market_cap` / `volume_24h` / `top_3_coins_id`）；**无 sparkline / 无 OHLC** | demo key（30/min + 10000/月） | 全站只用此 1 endpoint；1次/5min = 8640/月 | 5m | **6h** | CMC backup（如有 key），否则 cold |
| **链上美股** | **allowlist + DefiLlama (2 endpoint) + Solscan** | 价：`https://coins.llama.fi/prices/current/{chain}:{addr},{chain}:{addr}`；24h%：`https://coins.llama.fi/percentage/{coins}?period=24h`（**已 v4 curl 验证返回 `coins.{chain}:{addr}` = number**）；holders：Solscan `https://public-api.solscan.io/token/holders?tokenAddress={addr}&limit=1`（取 total 字段，Week 0 Day 5 实测确认） | DefiLlama 无；Solscan public 10 req/s | DefiLlama 宽松；Solscan **并发 5 / 5 req/s 自限 / 总超时 15s** | 5m | **12h** | 单 token 失败显 `—`；marketCap 列**砍** |
| **稳定币收益榜** | DefiLlama Yields | `/pools` filter `stablecoin: true && exposure: "single"` | 无 | 宽松 | 5m | **6h** | 无 |
| **GitHub 库** | GitHub REST | `/repos/{owner}/{name}`；92 仓库白名单；并发 5 | **fine-grained PAT, no repository scope, public metadata only** | 5000/h | 1h | **6h** | 未认证 60/h fallback |

---

## §4 后端 API 表 v4

```
GET /api/ticker
GET /api/stocks?region=us|cn&sector=...            # region=hk → 400 BAD_QUERY
GET /api/trading-comp?exchange=okx|bitget|gate|bybit   # ★ v4 enum 去 binance-wallet
GET /api/market-analysis?symbol=BTCUSDT|ETHUSDT|SOLUSDT&interval=1h|4h|1d
GET /api/defi-rank?sort=tvl|fees|volume&limit=10..100
GET /api/liquidity-pools?chain=ethereum|...|all&sort=tvl|apr&limit=10..200
GET /api/sector-movers?category=ai|rwa|...
GET /api/onchain-stocks?issuer=ondo|xstocks|backed|all
GET /api/stablecoin-yields?asset=USDT|USDC|DAI|all&limit=10..100
GET /api/github-repos?category=...
GET /api/health
```

**响应包络**：同 v2/v3，`error.code` 枚举 `COLD|UPSTREAM_DOWN|RATE_LIMITED|BAD_QUERY`，`error.message` 固定文案不外泄。

**`/api/onchain-stocks` 响应字段（v4 砍 marketCap）**：
```ts
{ symbol, issuer, category, price, change24h, holders }
```

**`/api/sector-movers` 响应字段**：
```ts
{ name, change24h, marketCap, volume24h, coinCount, heat }   // 无 sparkline
```

---

## §5 前端 v4

- `TopBar.tsx`：港股相关 tab 不渲染。
- `sections/SectorMovers.tsx`：板块卡片移除 `<Sparkline/>`；表头无 K 线缩略列。
- `sections/OnchainStocks.tsx`：**表头 6 列**（`代币 / 发行方 / 分类 / 价格 / 24H / Holders`，其中 3 个指标列：价格、24H、Holders）。
- `sections/Stocks.tsx`：region tabs 仅 `美股 / A股`；无 "AI 热度" / "主力净流入" 列；区段说明：「价格 + 振幅 + 52 周区间位置 + 成交量 + 日线连阳/连阴 + 24H」。
- `components/PriceTicker.tsx`：包含恒生指数 `^HSI`（仅顶部，不下钻港股板块）。

---

## §6 分阶段交付 v4（Week 0 5 天 + Week 1-4 同 v3）

```
Week 0 (5 天) — SPIKE
  Day 1: Polygon snapshot curl（决定付费）+ 东方财富 push2 字段反推
  Day 2: OKX announcements / PANews / Foresight News / ChainCatcher RSS spike
  Day 3: DefiLlama 三接口 (`/protocols`, `/overview/fees`, `/yields/pools`) +
         stablecoin filter 字段实测（`stablecoin` boolean / `exposure` 取值枚举）
  Day 4: GitHub fine-grained PAT 创建（无 scope，公共 metadata 只读）+ 92 仓库白名单定稿 +
         **token-allowlist.json 录入 50 条 5 字段** + zod schema + CI 重复 contract 检查
  Day 5: CoinGecko categories 月预算 + Solscan holders 真返回字段实测（total 字段名？paginate？）+
         DefiLlama `coins.llama.fi/prices/current` + `/percentage?period=24h` 真返回结构 +
         收尾 fixture 入 `apps/api/src/fixtures/`（脱敏）+ SPIKE_RESULTS.md
  → 任一 spike 不过：plan v5 调整或砍掉对应板块/列。

Week 1: GitHub 库 + DeFi 协议榜 + 流动性池子 + 稳定币收益榜
        + 项目脚手架 + Card/Table 组件 + Redis docker
        + fetchWithRetry.ts + cgBudget.ts + cache.ts (三态)
        → 周末 4 板块 + 顶部行情条骨架
Week 2: 行情解析 + 板块异动 + 完整顶部行情条 + indicators.ts
        → 周末 6 板块
Week 3: 链上美股（6 列表头 / 3 指标列）+ 股票市场（美股 Polygon）
        + token-allowlist.json 联调 + DefiLlama prices/percentage + Solscan holders
        → 周末 8 板块
Week 4: 股票市场（A 股 东方财富）+ 交易赛（tier-1 OKX + tier-2 RSS；tier-3 backlog 不做）
        + /api/health 监控页 + 429/cold 路径测试
        → 周末 9 板块全上
```

---

## §7 关键决策 v4 汇总

- **A**：所有上游过后端；**前端不持密钥，后端 env 持有**。
- **B**：单源失败仅挂自身；`hardMax` **默认 6h，按板块覆盖**（具体值 §3）；`state="cold"` 显式提示。
- **C**：~~CBOE / AI 热度~~ 全砍。
- **D**：链上美股 **6 列表头 / 3 指标列**（价格 / 24H / Holders）；marketCap 列 v4 砍。
- **E**：交易赛 tier-1 (OKX 官方) + tier-2 (RSS) 在 MVP 内；tier-3 (HTML 爬虫) **backlog 不做**；tier-1/2 全挂才板块整体 cold。
- **F**：稳定币收益榜替代 CEX 理财。
- **G**：A 股东方财富 push2；同花顺备援。
- **H**：所有路由 zod schema + per-IP 60/min；error 全枚举化。
- **I**：链上美股价格走 DefiLlama，CG 全站仅板块异动用，月预算 8640/10000 守卫。
- **J**：链上美股 token-allowlist.json 静态 50 条 / 5 字段。
- **K**：港股 MVP 砍板块；顶部行情条保留 `^HSI`（v4 定稿）；`/api/stocks?region=hk` → 400 BAD_QUERY。
- **L**（v4）：`binance-wallet` 交易赛源 MVP backlog；enum 仅 `okx|bitget|gate|bybit`。
- **M**（v4）：GitHub PAT 用 **fine-grained, no scope, public metadata only**。

---

## §8 BLOCKER CHECKLIST v4（实施期必验）

承接 v3 22 条，v4 改/补：

1. Polygon snapshot 字段 + 付费决策（Day 1）
2. DefiLlama `/protocols` 字段 + null + **gzip 校验响应头 `content-encoding: gzip`**
3. DefiLlama yields `/pools` server 侧 sort/filter/slice
4. GitHub `/repos/{}` `language` 字段够替代 `/languages`
5. CG 全站月预算 ≤ 10000 守卫；4xx/5xx/retry 都计；超 9500 进 stale-only
6. token-allowlist.json **5 字段 50 条**人工录入；CI 校验 zod + 重复 contract
7. 东方财富 push2 UA/Referer + f2/f3/f12 字段映射
8. 交易赛 tier-1/2 失败语义 + tier-3 不实现
9. ~~CBOE~~
10. OKX announcements 字段（patterns 2026-04-30 命名陷阱）
11. Binance weight：响应头 `X-MBX-USED-WEIGHT-1M`；`if weight > 5500 sleep`
12. ~~AKShare~~
13. fixture 脱敏 `fixtures/scrub.ts`
14. rate limit：`/api/health` 不计；429 路径测试
15. cold state 每 adapter 一个测试用例
16. stablecoin yields 字段（`stablecoin` boolean 还是字符串？`exposure` 枚举）
17. Solscan holders endpoint：total 字段名 + paginate + **并发 5 / 5 req/s / 15s 总超时 / 部分失败 token 显 `—`**
18. DefiLlama coins prices：批量上限 + null 处理
19. **（v4 新）DefiLlama `/percentage?period=24h`**：实测返回结构 `{coins:{<key>:number}}`；空 / null 怎么显示
20. Hono `trustProxy` 边界：默认关；测伪造 `X-Forwarded-For` 不绕开
21. fetchWithRetry：5s timeout + 1 retry；retry 计入 CG 配额
22. gzip：校验 DefiLlama 响应 `content-encoding`
23. HK 状态码：**统一 400 + `error.code:"BAD_QUERY"`**（v3 §4/§8 措辞冲突 v4 收敛）；前端 TopBar 不渲染
24. **（v4 新）链上美股 marketCap 列已砍**：UI 表头 6 列 / 响应字段 6 个；测试覆盖响应不含 `marketCap`
25. **（v4 新）trading-comp enum**：`binance-wallet` 已去除；测试覆盖 `?exchange=binance-wallet` 返 400 BAD_QUERY
26. **（v4 Round 4 后增量）DefiLlama `/percentage` batch 防 poison**：按 chain 分片调用（EVM 一批 / Solana 一批），单批 ≤ 30；EVM 地址原样保留不强制 lowercase；Solana base58 不变；缺失 coin 不会让批失败，但要测一次显式 1 个伪 coin + 5 个真 coin，确认其他 5 个仍正常返回
27. **（v4 Round 4 后增量）trading-comp 非 OKX exchange 失败语义**：bitget/gate/bybit RSS 关键词过滤无结果时返 `data:[] + state:"fresh"`（不是 cold）；测试覆盖空结果路径
28. **（v4 Round 4 后增量）allowlist 重复校验**：按 `chain + 原样 contract` 联合 key 查重；不要 normalize contract（避免误把 EVM 大小写混淆当重复）；CI 跑 `pnpm run check:allowlist`
29. **（v4 Round 4 后增量）allowlist 数据真实性**：50 条 commit 必须每条注明发行方官网来源 URL；review 不通过的 commit 直接 reject；禁止从 CMC/CG 二手数据录入
30. **（v4 Round 4 后增量）GitHub PAT 限速归档**：Day 4 burst 测 92 repos 验证响应头 `X-RateLimit-Limit: 5000` + `X-RateLimit-Remaining` 递减；若发现走 60/h 立即改用 classic PAT no-scope
31. **（v4 Round 4 后增量）PriceTicker vs TopBar 区分**：`PriceTicker` 含 `^HSI`（恒生指数）；`TopBar` 港股板块 tab 不渲染；测试两个组件各自独立校验，避免代码改一处误删另一处

---

## §9 给 Codex review v4 的问题

只评：
1. v3 → v4 两个 BLOCKING 是否真闭环（hardMax 默认 6h / per-板块覆盖；链上美股 24h% 走 DefiLlama percentage + marketCap 砍列）。
2. §3 v4 新源（`coins.llama.fi/percentage`）endpoint 已 curl 验证返回 `coins.{chain}:{addr}=number`；其他细节是否漏。
3. §7 决策 L/M（trading-comp 去 binance-wallet / GitHub PAT fine-grained）是否还有副作用。
4. §8 v4 新增条目 19/23/24/25 还漏什么。
5. Week 0 第 4 天人工录入 50 条 allowlist 是否可行；若不可行是 25 条 + Week 3 补也可以接受。

**不评**：组件命名 / 目录结构 / 措辞 / 已闭环的历史条目。

**Round 4 拐点声明**：v4 是第 4 轮 review，按 patterns 2026-05-01「6-8 轮拐点」规则，本轮若 BLOCKING=0 即转入 BLOCKER CHECKLIST 实施期；若仍 BLOCKING>0，需明确是数据真实性级问题还是文档级问题（数据级 → v5；文档级 → 强行收口进编码）。

---

## §10 STATUS: APPROVED (2026-05-14)

- Round 4 Codex review verdict = **APPROVE**（BLOCKING=0）
- 5 个 CHANGES + 2 个 NIT 已增量补进 §3 / §8（条目 26-31）+ §5 措辞修正
- Plan locked at v4。后续在实施期遇到 spike 失败 / 接口变更 → 创 v5，不在 v4 上改。
- **下一步**：Week 0 spike（5 天）由 Codex 按 §6 Day 1-5 逐日执行；产物每日入 `apps/api/src/fixtures/<source>.fixture.json`（脱敏）+ 一页 SPIKE_RESULTS.md。Day 5 收尾 user 验收后才放开 Week 1 编码。

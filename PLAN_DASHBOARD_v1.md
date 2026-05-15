# PLAN_DASHBOARD_v1 — 仪表盘动态克隆

> **目标**：复刻 https://import-command-query-8ca052.surf.computer/ 的 9 个板块 UI，但所有数据走真实 API + 缓存。
> **范围**：股票市场 / 交易赛 / 行情解析 / DeFi 协议榜 / 流动性池子 / 板块异动 / 链上美股 / Web3 理财 / GitHub 库。
> **不在范围**：移动端、历史回填、告警、用户系统、登录态、原站其他板块（项目空投 / VC / 钱包用户 / AI 资源 等）。
> **数据真实性优先级**：完全真实 > 标记「估算」的近似 > 砍掉。

---

## §1 架构

```
┌──────────────┐    HTTP    ┌──────────────┐    fan-out    ┌────────────────────┐
│ React + Vite │ ─────────► │ Hono backend │ ─────────────►│ 9 个上游适配器     │
│ (SPA, port   │            │ (Node + TS,  │               │ (DefiLlama / CMC / │
│  5173)       │ ◄──────────│  port 8787,  │ ◄─────────────│  Binance / GitHub /│
└──────────────┘    JSON    │  Redis 缓存) │   JSON        │  Yahoo / 金十 ...) │
                            └──────────────┘               └────────────────────┘
                                  │
                                  ▼
                            ┌────────────┐
                            │  Redis     │
                            │  本地 6379 │
                            └────────────┘
```

- **前端只调本地后端**，永远不直连第三方（CORS、密钥、限速都集中在后端）。
- **每个上游适配器单独文件**，失败只影响自己板块；首页 9 板块并行加载，单板块降级显示 stale + last-updated 提示。
- **Redis 缓存策略**：每板块独立 key + TTL，错峰（30s/60s/5m/15m/1h）避免雪崩；上游失败时返回 stale 数据 + 标记 `stale: true`。

---

## §2 目录结构

```
skills/dashboard-clone/
├── PLAN_DASHBOARD_v1.md         # 本文件
├── package.json                 # workspace root
├── pnpm-workspace.yaml
├── apps/
│   ├── web/                     # 前端
│   │   ├── src/
│   │   │   ├── main.tsx
│   │   │   ├── App.tsx          # 顶部导航 + 当前 tab 路由
│   │   │   ├── components/
│   │   │   │   ├── TopBar.tsx       # 18 个分类按钮（先做 9 个，剩余灰）
│   │   │   │   ├── PriceTicker.tsx  # BTC/ETH/SOL/BNB/DOGE + 沪/标普/纳指 + 总市值 etc.
│   │   │   │   ├── Card.tsx         # 项目/代币/池子卡片基类
│   │   │   │   ├── Sparkline.tsx    # 缩略 K 线
│   │   │   │   ├── Badge.tsx
│   │   │   │   ├── Table.tsx        # 协议榜 / 链上美股表格
│   │   │   │   └── StaleBanner.tsx
│   │   │   ├── sections/        # 9 个板块各一个文件
│   │   │   │   ├── Stocks.tsx
│   │   │   │   ├── TradingComp.tsx
│   │   │   │   ├── MarketAnalysis.tsx
│   │   │   │   ├── DefiRank.tsx
│   │   │   │   ├── LiquidityPools.tsx
│   │   │   │   ├── SectorMovers.tsx
│   │   │   │   ├── OnchainStocks.tsx
│   │   │   │   ├── Web3Earn.tsx
│   │   │   │   └── GithubRepos.tsx
│   │   │   ├── hooks/useDashboardQuery.ts  # react-query wrapper 统一 stale handling
│   │   │   └── lib/format.ts    # $123.4M / 4.20% 等格式化
│   │   ├── index.html
│   │   ├── tailwind.config.ts
│   │   ├── vite.config.ts
│   │   └── tsconfig.json
│   └── api/                     # 后端
│       ├── src/
│       │   ├── index.ts         # Hono app, 注册 9 个路由
│       │   ├── cache.ts         # Redis 包装 (getOrFetch with TTL + stale)
│       │   ├── ticker.ts        # 顶部行情条聚合
│       │   ├── adapters/
│       │   │   ├── stocks.ts            # Polygon / Yahoo / AKShare
│       │   │   ├── tradingComp.ts       # 交易所活动爬虫
│       │   │   ├── marketAnalysis.ts    # Binance K + 指标 + 金十
│       │   │   ├── defiRank.ts          # DefiLlama protocols
│       │   │   ├── liquidityPools.ts    # DefiLlama yields
│       │   │   ├── sectorMovers.ts      # CMC / CoinGecko categories
│       │   │   ├── onchainStocks.ts     # xStocks/Ondo + DEX subgraphs
│       │   │   ├── web3Earn.ts          # CEX Simple Earn
│       │   │   └── githubRepos.ts       # GitHub REST
│       │   ├── indicators.ts    # MA/Bollinger/RSI/MACD 本地算
│       │   └── types.ts         # 9 个板块的响应 schema
│       ├── .env.example         # API keys 模板
│       └── tsconfig.json
├── packages/
│   └── shared/                  # 前后端共享类型
│       └── src/types.ts
├── docker-compose.yml           # redis 6379
└── README.md
```

**说明**：pnpm workspace；shared 包导出 zod schema + 推导类型，前后端单一真源；前后端各自 tsc/build；后端用 esbuild/tsx 跑 dev。

---

## §3 数据源矩阵（**实施前 Codex 必须逐项核验 endpoint + auth + rate-limit**）

| 板块 | 主源 | Endpoint | Auth | 限速 | 缓存 TTL | 备份/降级 |
|---|---|---|---|---|---|---|
| **顶部行情条** | Binance + Yahoo + CoinGecko | `/api/v3/ticker/24hr?symbols=...` (Binance, 公开) / Yahoo Finance v8 (免费) / CG `/global` | 无 / 无 / 无 | 1200/min / 100/h / 30/min | 30s | CG → CMC（需 key） |
| **股票市场** | Polygon (主) / Yahoo (备) / AKShare (A股) | Polygon `/v2/aggs/ticker/{T}/prev`、`/v3/snapshot/locale/us` | Polygon: API key (Stocks Starter $29/月，否则限 5 req/min) | 5/min 免费 → 不可用 | 90s | 全砍到 Yahoo 免费 v8（更慢但稳） |
| **交易赛** | 交易所活动页 + 资讯 RSS | Bitget `/v1/spot/market/activity-list`（无文档，要逆向）/ Gate `/v4/announcements` / Bybit announcements / Binance Square / OKX events；资讯：CoinDesk RSS、PANews RSS | 多数公开 | 各异 | 15m | 单源失败不挂全板块，部分卡片显示 stale |
| **行情解析** | Binance + 金十 | Binance `/api/v3/klines?symbol=BTCUSDT&interval=1h&limit=200` + 金十 RSS / WS | 公开 | 1200/min | 60s（K线）/30s（快讯） | TradingView lightweight-charts 本地渲染 |
| **DeFi 协议榜** | DefiLlama | `https://api.llama.fi/protocols` + `/fees/protocols` + `/overview/dexs/protocols` | 无 | 宽松 | 5m | 无（DefiLlama 是事实标准） |
| **流动性池子** | DefiLlama Yields | `https://yields.llama.fi/pools` | 无 | 宽松 | 5m | 无 |
| **板块异动** | CMC categories / CoinGecko categories | CG `/coins/categories` + 每类代表币 K 线 `/coins/{id}/ohlc?days=1` | CG 公开 30/min；CMC 需 key | 30/min | 5m | CG → CMC（如有 key） |
| **链上美股** | xStocks API + Ondo + Backed + The Graph | xStocks `https://api.xstocks.com/tokens`（未公开文档）/ Ondo `https://api.ondo.foundation/...` / Backed Finance；APY：Aerodrome / Uniswap V3 / Raydium CLMM / Orca Whirlpool subgraph | The Graph 部分要 API key | 各异 | 5m | APY 拿不到的标「估算」徽章 |
| **Web3 理财** | CEX 公开 API | Binance Simple Earn `/sapi/v1/simple-earn/flexible/list`（需签名）/ OKX `/api/v5/finance/savings/lending-rate-summary`（公开） / Bybit / Bitget / Gate | Binance 需 API key；OKX 公开 | 多数宽松 | 5m | 单 CEX 失败不挂全板块 |
| **GitHub 库** | GitHub REST | `/repos/{owner}/{name}` + `/repos/{owner}/{name}/languages` | 认证 token 5000/h | 5000/h | 1h | unauthenticated 60/h fallback |

---

## §4 后端 API 表（前端只用这 11 个）

```
GET /api/ticker             # 顶部行情条聚合
GET /api/stocks             # ?region=us|cn|hk&sector=...
GET /api/trading-comp       # ?exchange=bitget|gate|...
GET /api/market-analysis    # ?symbol=BTCUSDT&interval=1h
GET /api/defi-rank          # ?sort=tvl|fees|volume&limit=100
GET /api/liquidity-pools    # ?chain=...&sort=tvl|apr&limit=200
GET /api/sector-movers      # ?market=crypto|us|cn
GET /api/onchain-stocks     # ?issuer=ondo|xstocks|backed&category=...
GET /api/web3-earn          # ?type=flexible|locked|dual&asset=USDT|USDC|BTC|ETH
GET /api/github-repos       # ?category=...
GET /api/health             # 所有适配器最近一次成功时间
```

**统一响应包络**：

```ts
{
  data: T,
  meta: {
    fetchedAt: number,   // unix ms
    stale: boolean,
    source: string,      // 'defillama' / 'polygon' / 'yahoo'
    cacheTtlSec: number,
  },
  error?: { code: string, message: string }   // 软失败时 data 给空但有 error
}
```

---

## §5 前端组件 / 板块拆解（粗粒度）

- **TopBar**：18 按钮，9 个激活 + 9 个 disabled（带 `coming soon` tooltip）
- **PriceTicker**：横向滚动 marquee，单元格 = `<TickerCell symbol price changePct/>`
- **Card**（airdrop 风格的卡片基类）：rank 角标 / title / subtitle / metric 行 / badge 行 / 适合标签 / CTA
- **Table**：DeFi 协议榜 / 链上美股 / Web3 理财（都是密度型表格，sortable header + sticky thead）
- **Sparkline**：用 lightweight-charts 或 svg `<path>` 手画（200 点以内 svg 更轻）
- **板块异动卡片**：分类名 + 涨跌 + 市值 / 量 + 4h × 24 K 线缩略

每个 section 文件 ~150-300 行，全部走 `useDashboardQuery(key, refetchInterval)` hook。

---

## §6 分阶段交付（4 周节奏；每周末 user 验收）

```
Week 1: GitHub 库  +  DeFi 协议榜  +  流动性池子
        + 项目脚手架 (workspace, tailwind, hono, redis docker)
        + Card/Table/Sparkline 基础组件
        + 数据源 = 完全干净（DefiLlama + GitHub）
        → 周末有 3 个真实板块可演示

Week 2: 行情解析  +  Web3 理财
        + 顶部行情条 (Ticker)
        + indicators.ts (MA/Bollinger/RSI/MACD 本地算)
        → 周末顶部行情 + 5 个板块

Week 3: 板块异动  +  链上美股
        + CMC/CoinGecko categories 适配
        + 4 个 DEX subgraph APY 查询 (拿不到的标"估算")
        → 周末 7 个板块

Week 4: 股票市场  +  交易赛
        + Polygon / Yahoo / AKShare 三源容灾
        + 多交易所活动爬虫 (5-6 个解析器)
        → 周末 9 板块全上 + Stage F 监控页 (/api/health)
```

---

## §7 关键设计决策（user 5/12 已拍板，列出供 Codex review）

- **决策 A**：所有上游统一走后端代理 + Redis；前端不持有任何 API key、不直连第三方。
- **决策 B**：数据源单源失败不挂全站，只挂自己板块；显示 stale 数据 + 角标提示「上次更新 X 分钟前」。
- **决策 C**：「主力净流入」「AI 热度」原站特征**不复刻**，改为：A 股不显示该列；美股替换为「期权 P/C 比」（公开数据可拿）。如 Codex 觉得有更好的替代再提。
- **决策 D**：链上美股 APY 仅展示**能从 subgraph 真拿到**的协议（Aerodrome/Uniswap V3/Raydium CLMM/Orca），其余协议留空 + 「估算」徽章保留交易聚合器路径（Codex 评估是否值得做）。
- **决策 E**：交易赛板块只做 5 个交易所 MVP（Bitget / Gate / Bybit / Binance Wallet / OKX Wallet），不做 LBank / MEXC 等长尾。
- **决策 F**：Web3 理财不接需要 API key 的 CEX（Binance simple-earn flexible 接口需签名）。先做完全公开的（OKX/Bybit/Bitget 公开 lending-rate）+ Gate（如公开）；Binance/OKX 高级产品标「需登录查看」按钮跳官网。

---

## §8 BLOCKER CHECKLIST（实施期必验，mock 测不到的真实环境陷阱）

按 patterns 2026-04-30 (`单测 mock 通过 ≠ 真能跑`) 和 2026-05-01 (`mock 67 个全过，真跑 3 bug`) 的教训：

1. **DefiLlama `/protocols`** 真返回字段名 + null 处理（fees/revenue 不少协议是 null）；分页或一次全拉？响应体大小（实测 1MB+，要 gzip）
2. **DefiLlama yields `/pools`** 响应是 2 万+ 池，要 server 侧 sort+limit 后再返前端
3. **GitHub `/repos/{}/languages`** 频率高的话快速吃 5000/h；用 `/repos/{}` 一次拿主语言够不够？
4. **CoinGecko 免费 30/min**：板块异动需要 N 个分类 × 24 点 K 线，会超限；用 CMC 还是降级到 4h × 6 点
5. **Binance Klines 公开**：interval=1h limit=200 返 200 根，indicators.ts 算的起点要看够长（MACD 26 + 9 = 35 根 warmup）
6. **xStocks / Ondo API 是否真公开**：先 curl 验证返回结构；不公开 → 退回到链上直读 token-holder + price oracle
7. **The Graph subgraph 限速**：Aerodrome/Uniswap V3/Raydium CLMM/Orca Whirlpool 各家 hosted service 限速不同，部分要 API key
8. **交易所活动爬虫**：HTML 结构 1-2 周必变，要内置 schema fingerprint，结构变了立即 alarm 不静默挂掉
9. **金十数据 RSS**：是否真公开？还是要付费？降级用 PANews / Foresight News RSS
10. **OKX `/api/v5/finance/savings/lending-rate-summary`**：实测返回字段名，patterns 2026-04-30 警示 OKX/Binance 字段命名不一致（如 `clientAlgoId` vs `origClientOrderId`）
11. **Yahoo Finance v8 非官方**：可能限速 100/h；批量请求要分批
12. **AKShare**：是 Python 库，Node 后端要么改 Python 子进程，要么走它底层 RPC（东方财富/同花顺接口）

每条要求 Codex 实施时先 curl/fetch 一次真接口，把返回 sample 贴到 `apps/api/src/adapters/{name}.fixture.json`，写解析 ≠ 写完单测就算完。

---

## §9 Codex review 提问清单

请评 plan 时只关注：
1. 数据源矩阵 (§3) 是否有遗漏 / 误判 (是否真公开 / 限速是否真准 / 是否漏了关键备份)
2. 后端 API 表 (§4) 边界划分是否合理（11 个接口够不够 / 有没有过度拆分）
3. 4 周交付节奏 (§6) 是否现实，先做哪 3 个的优先级是否对
4. BLOCKER CHECKLIST (§8) 还漏什么实施期陷阱
5. 决策 C/D/E/F 是否需要重议

**不评**：目录结构 (§2) / 组件命名 (§5) / 命名风格 / 注释 — 这些 Codex 实施时自行决定。

# PLAN_DASHBOARD_v6 — 仪表盘动态克隆（v5 → v6 Week 0 Spike 结论版）

> **触发**：Week 0 Day 1-5 spike 实测（见 `spike-results/SPIKE_RESULTS.md`），v4/v5 计划与现实多处不符。User 2026-05-14 拍板 Q8=a / Q9=cheerio 爬资讯站 / Q10=a。

## v5 → v6 主要变更

- **决策 R**（Q8=a）：链上美股 **holders 列砍**。Solscan public API 已下线，没有免费源。表头 5 列：`代币 / 发行方 / 分类 / 价格 / 24H`。
- **决策 S**（Q9=cheerio 爬虫）：交易赛 tier-2 RSS 砍（3 个源 URL 全错），改 **cheerio + got 静态 HTML 爬虫**抓 PANews / Foresight News / ChainCatcher 文章列表 + 关键词过滤交易所活动。`Bitget/Gate/Bybit` 单 exchange 失败 = `data:[] + state:"fresh"`。
- **决策 T**（Q10=a）：**Polygon $29/月 砍**。东方财富 push2 已实测能拿美股个股（105.AAPL/NVDA/TSLA/QCOM）+ 美股指数（100.SPX/NDX/DJIA）+ 港股个股（116.00700/09988），完全替代。**MVP 月费 $0**。
- **§3 修正**：
  - OKX endpoint 路径修正为 `/api/v5/support/announcements`（v4 写错）
  - DefiLlama `/protocols` 字段标注：`fees/revenue/mcap/volume_1d` **100% null**，必须配 `/overview/fees`
  - DefiLlama yields 字段名修正：`tvlUsd` 不是 `tvl`
  - EtherScan 升级 V2 + 加 `ETHERSCAN_API_KEY` env
  - 顶部行情条股指源全部走东方财富（不再 Polygon）
- **§8 BLOCKER 增条 36-40**：v6 实测发现陷阱

## v6 部署影响

因 cheerio 爬虫 + Hono 在 Node Function 跑没问题（无 headless），仍可走 **Vercel Functions + Upstash Redis** serverless 全栈。但若以后加 playwright（如反爬升级）需迁移独立 VPS。MVP 阶段保持 Vercel。

---

## §1 架构（v6 无变动，仅澄清部署）

部署 = **前端 Vercel Pages + 后端 Vercel Functions + Upstash Redis**（境外 region：sfo1 或 iad1）；本地 dev 用 docker-compose redis。

爬虫栈：`got` (HTTP) + `cheerio` (DOM 解析)。**禁止用 playwright/puppeteer** MVP 内（Vercel Function 限制）；如未来需要再迁 VPS。

---

## §2 目录结构（v6 微调）

```
skills/dashboard-clone/apps/api/src/
├── adapters/
│   ├── tradingComp.ts             # ★ v6 改：tier-1 OKX api + tier-2 cheerio 资讯爬虫
│   ├── onchainStocks.ts           # ★ v6 改：5 列输出，去掉 holders 字段
│   ├── stocks.ts                  # ★ v6 改：region us|cn|hk 全走东方财富
│   └── ...
├── crawlers/                      # ★ v6 新增
│   ├── chaincatcher.ts            # cheerio 解析
│   ├── panews.ts
│   ├── foresight.ts
│   └── keyword-filter.ts          # 共用关键词匹配（Bitget/Gate/Bybit/OKX/Binance Wallet）
└── ...
```

---

## §3 数据源矩阵 v6

| 板块 | v6 源 | endpoint | Auth | TTL | hardMax |
|---|---|---|---|---|---|
| **顶部行情条** | Binance + 东方财富 + DefiLlama + alternative.me + EtherScan V2 | Binance ticker 5 syms；东方财富 secid=1.000001/100.SPX/100.NDX/100.DJIA/100.HSI；DefiLlama `/global`；`api.alternative.me/fng/`；EtherScan V2 `gastracker` | EtherScan V2 需 free key | 30s | 5min |
| **股票市场（美）** | **东方财富** | `/api/qt/clist/get?fs=...&fields=f12,f14,f2,f3,f4,f5,f6,f7,f8,f10,f15,f16,f17,f18,f47,f48,f50,f161,f168` (美股 fs 见 Day 2 spike 实测) | 无 | 90s | 6h |
| **股票市场（A 股）** | **东方财富** | 同 v4 沪深 A 股 fs 串 | 无 | 90s | 6h |
| **股票市场（港）** | **东方财富** | `secid=116.{code}` 个股 | 无 | 90s | 6h |
| **交易赛 tier-1** | OKX 官方 | `/api/v5/support/announcements`（**v6 修正路径**）| 无 | 15m | 24h |
| **交易赛 tier-2** | **cheerio 爬虫** | PANews `panewslab.com/zh/articles` / Foresight `foresightnews.pro` / ChainCatcher `chaincatcher.com/news` 列表页 + 关键词过滤含 "Bitget"/"Gate"/"Bybit"/"Binance Wallet" 的条目 | 无 | 15m | 24h |
| **行情解析** | Binance + cheerio (资讯) | `/api/v3/klines?symbol=BTCUSDT&interval=1h&limit=300` + 资讯爬虫 | 无 | 60s/30s | 1h |
| **DeFi 协议榜** | DefiLlama **二接口** | `/protocols`（TVL + change）+ `/overview/fees`（fees/revenue real）；前端 merge by `name` | 无 | 5m | 6h |
| **流动性池子** | DefiLlama Yields | `/pools`（字段 **`tvlUsd` 不是 tvl**） | 无 | 5m | 6h |
| **板块异动** | CoinGecko categories | `/api/v3/coins/categories`（**无 key 也 200**，但 plan 仍用 demo key 避免被未来加限） | demo key 30/min + 10000/月 | 5m | 6h |
| **链上美股** | DefiLlama coins (2 endpoint) + token-allowlist | `coins.llama.fi/prices/current/{coins}` + `coins.llama.fi/percentage/{coins}?period=24h`；混 chain 批量 + 假 coin 静默省略已验 | 无 | 5m | 12h |
| **稳定币收益榜** | DefiLlama yields | `/pools` filter `stablecoin: true && exposure: "single"` | 无 | 5m | 6h |
| **GitHub 库** | GitHub REST | `/repos/{owner}/{name}` | fine-grained PAT | 1h | 6h |

---

## §4 API 表 v6（无变化）

11 个路由同 v4。**`/api/onchain-stocks` 响应字段 v6**：

```ts
{ symbol, issuer, category, price, change24h }   // ★ v6 砍 holders
```

---

## §5 前端 v6

- `sections/OnchainStocks.tsx`：**表头 5 列**（`代币 / 发行方 / 分类 / 价格 / 24H`）。
- `sections/Stocks.tsx`：region tabs 改 `美股 / A股 / 港股`（v6 加港股，因东方财富免费拿到）。
- `components/PriceTicker.tsx`：13 项；顶部条数据全部走东方财富（沪/标普/纳指/恒指）+ Binance（加密 5 项）+ DefiLlama global + alternative.me 情绪 + EtherScan ETH gas。

**注意**：v6 加回港股板块（v5 砍的，因为 Yahoo 不可用；现在东方财富能拿，重新加回）。

---

## §6 交付节奏 v6（已用 Week 0 spike 5 天，进入 Week 1）

```
Week 0 — ✅ 完成
  Day 1-5 spike：本目录 SPIKE_RESULTS.md 已交付
  待办：
    a) user 修 mihomo DIRECT 规则放行 binance.com / polygon.io（v6 已砍 Polygon，仅 Binance 需要）+ chatgpt.com / openai.com
    b) user 创建 fine-grained GitHub PAT + EtherScan V2 free key
    c) user 创建 CoinGecko demo key（虽 spike 显示无 key 也可，但加 key 防未来限速；可不做）

Week 1（用东方财富 + DefiLlama × 4 + GitHub）：
  Day 1-2: 项目脚手架（待 Codex 重启）+ Card/Table 组件 + cache.ts/fetchWithRetry.ts/cgBudget.ts
  Day 3: DeFi 协议榜（DefiLlama /protocols + /overview/fees 双源 merge）
  Day 4: 流动性池子（DefiLlama /pools server filter）+ 稳定币收益榜（同源 filter stablecoin+single）
  Day 5: GitHub 库（92 仓库 white list 录入 + adapter）
  Day 6-7: 顶部行情条（东方财富指数 + Binance + DefiLlama global + alternative.me + EtherScan）

Week 2: 行情解析 + 板块异动 + 链上美股
  + token-allowlist.json 录入 50 条（5 字段）
  + DefiLlama coins prices/percentage adapter

Week 3: 股票市场 美/A/港 三 region 全东方财富 + 字段 ×100 还原层
  + 实施 BLOCKER #32 ×100 还原器 + 充分单测

Week 4: 交易赛 tier-1 OKX + tier-2 cheerio 资讯爬虫
  + 关键词过滤器 + cold 单卡片降级
  + /api/health + 429/cold 测试
```

总进度：**Week 0 → ✅，Week 1-4 共 4 周编码（vs v4 的 4 周不变）**。

---

## §7 关键决策 v6 增量

承接 v5 决策 A-Q，新增：

- **R（v6）**：链上美股 **5 列**（holders 砍）。
- **S（v6）**：交易赛 tier-2 = **cheerio + got 静态 HTML 爬虫**抓 3 资讯站文章列表 + 关键词过滤；MVP 不上 playwright（Vercel Functions 限制）。
- **T（v6）**：Polygon **完全砍**；东方财富覆盖美/A/港股全部。
- **U（v6）**：港股板块 **重新加回**（v5 决策 K 反转）；表 region enum = `us|cn|hk`。

> **注意 §7 K 反转**：v5 K 写「港股 MVP 砍」是因为 Yahoo 不可用；现在确认东方财富能免费拿到港股（`secid=116.{code}`），故 v6 重新加回港股 tab + `/api/stocks?region=hk` 正常路由（不再 400 BAD_QUERY）。

---

## §8 BLOCKER CHECKLIST v6 增量

承接 v4/v5 1-35，v6 新增：

36. **（v6 / spike 实证）DefiLlama `/protocols` fees/revenue/mcap/volume_1d 100% null**：
    - adapter 必须**同时调** `/protocols` (拿 TVL/change/chains) + `/overview/fees` (拿 total24h/7d/30d)
    - 二源在后端 merge by `slug` 或 `name`（`/overview/fees` 用 `slug` 字段）
    - 单测：从 fixture merge 后确认 fees != null 且 tvl != null

37. **（v6 / spike 实证）DefiLlama yields 字段名 `tvlUsd` 非 `tvl`**：
    - 写 zod schema 时字段名严格按真实接口；前端 format 函数也按 `tvlUsd` 取
    - 单测：解析 fixture 后断言 `pool.tvlUsd > 0`

38. **（v6 / spike 实证）OKX endpoint 路径**：
    - `/api/v5/support/announcements`（不是 `/api/v5/public/`）
    - 响应嵌套 `data[0].details[]` 而非 `data[]` 直接是 list
    - 字段：`annType / title / url / pTime`（ms timestamp）/ `businessPTime`

39. **（v6）cheerio 爬虫稳定性**：
    - 每爬一站写一个 `*.fingerprint.txt` 记录 1-2 个稳定 selector（如 `a[href^="/article/"]`）+ 关键词
    - adapter 启动时跑一次 fingerprint check：HTML 中 selector 命中 < 50% 立即降级 cold 该 exchange
    - 单测：用 fixture HTML 跑 fingerprint 校验，确保解析器至少能拿到 5 条文章

40. **（v6）东方财富港股 / 美股 fs 串实测**：
    - Day 2 spike 只测了单个 secid 不是 clist 列表 fs 串
    - Week 3 编码前必须 spike 出美股完整 fs 串（如 `m:105+t:1,m:105+t:2,...`）和港股 fs 串
    - 不能假设和 A 股完全一致

41. **（v6）EtherScan V2 endpoint 迁移**：
    - 旧 `https://api.etherscan.io/api?module=gastracker&action=gasoracle` → NOTOK
    - 新 `https://api.etherscan.io/v2/api?module=gastracker&action=gasoracle&chainid=1&apikey={KEY}`
    - 需 ETHERSCAN_API_KEY env（免费 5/req/s）

42. **（v6）链上美股响应 schema 砍 holders**：
    - 测试覆盖响应 **不包含** `holders` 字段
    - 防止前端旧渲染逻辑残留显示 `undefined`

---

## §9 STATUS v6

- v6 = **incremental from v5 + Week 0 spike 实证收敛**
- 历史文件保留：v1 / v2 / v3 / v4 / v5
- 实施期参考顺序：**v6 → v5 → v4 兜底**
- **Round 5 拐点已过**（v4 APPROVE）；v5/v6 是 spike 实证驱动的微调，不再 Codex review，直接进编码
- **下一步**：user 修 mihomo → Codex 脚手架重启 + 我 Day 2 完成（PANews/Foresight cheerio spike）；spike 全绿后开 Week 1

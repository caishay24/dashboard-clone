# Week 0 Spike Results — 2026-05-14

> Day 1-5 真接口实测。所有 fixture 在本目录 `*.json`。结论 = "✅ 通过 / ⚠️ 警告 / ❌ 受阻"。

## 一句话结论
**计划 v4 写的 9 个数据源里，4 个有问题；好消息是发现 1 个免费源（东方财富）能替代付费 Polygon。v6 plan 需要修。**

---

## ✅ 通过（5 个源）

### 1. 东方财富 push2 — 真正的免费王者
- ✅ A 股全表（5529 只）：`/api/qt/clist/get?fs=m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23&fields=...`
- ✅ 沪指：`secid=1.000001` → "上证指数" 4177.92
- ✅ 恒指：`secid=100.HSI` → "恒生指数" 26386.06
- ✅ 标普：`secid=100.SPX` → 7444.25
- ✅ 纳指：`secid=100.NDX` → 26402.34
- ✅ 道琼斯：`secid=100.DJIA` → 49693.20
- ✅ 美股个股：`secid=105.AAPL/NVDA/TSLA/QCOM` → 价格/量/振幅/PE/振幅 全部齐
- ✅ 港股个股：`secid=116.00700/09988` → 腾讯/阿里巴巴可拿

**字段陷阱**（已记入 BLOCKER #32）：所有价格 / 百分比 / 涨跌额字段 ×100（如 f3=2001 → 涨 20.01%）。adapter 必须 ÷ 100 还原。

### 2. DefiLlama 三接口
- ✅ `/protocols` (2.1MB / 7498 协议，含 TVL + change_1d/7d + chains)
  - **关键修正**：`/protocols` 接口 `fees/revenue/mcap/volume_1d` **100% 都是 null**（v4 §8.2 写"经常 null"不准；实际全 null）
  - fees 必须从 `/overview/fees` 拿
- ✅ `/overview/fees`（540KB / 2154 协议含真 fees, total24h/7d/30d）
- ✅ `/yields/pools` (2.6MB / 20431 池)
  - `stablecoin: bool` ✅（不是字符串）
  - `exposure: 'single' | 'multi'` ✅
  - stablecoin+single filter → 2900 个池
  - **关键陷阱**：字段名是 `tvlUsd` 不是 `tvl`

### 3. DefiLlama coins （链上美股价格用）
- ✅ `/prices/current/{chain}:{addr},...` 批量混 chain 一次性返
- ✅ `/percentage/{coins}?period=24h` 同样混 chain 工作
- ✅ **batch poison 不存在**：假 coin 静默省略不报错（Round 4 review 顾虑解除）

### 4. CoinGecko categories
- ✅ **无 key 也能用 HTTP 200**！705 个 categories，字段 `id/name/market_cap/market_cap_change_24h/volume_24h/top_3_coins`
- 月预算 8640 留 1360 buffer 仍成立

### 5. alternative.me Fear & Greed
- ✅ `https://api.alternative.me/fng/?limit=1`
- 字段 `data[0].value` (0-100) + `value_classification` (Fear/Neutral/Greed)
- 替代原站「情绪 50/100 中性」

### 6. GitHub API
- ✅ 直连 + 代理均可
- ✅ `/repos/{owner}/{name}` 一次返 `language` 主语言 + stargazers_count + pushed_at（v4 §8.4 提问回答）

### 7. OKX 公告（v4 写错路径）
- ❌ v4 plan §3 写的 `/api/v5/public/announcements` → **404 不存在**
- ✅ 真路径 = `/api/v5/support/announcements`
- 字段：`data[0].details[].annType / title / url / pTime / businessPTime`

---

## ⚠️ 警告（条件性可用）

### Polygon stocks — endpoint 活但需付费
- ✅ `/v2/snapshot/locale/us/markets/stocks/tickers` endpoint 路径正确
- ✅ 401 错误结构 `{status:"ERROR", request_id, error}` 标准
- ❌ DEMO key 不工作；MVP 需 $29/月 Stocks Starter
- **但**：东方财富已能覆盖所有美股数据 → **Polygon 可以省**

### Codex CLI 本地
- ❌ 受 mihomo MITM 影响 TLS 握手 EOF
- 等 user 修 mihomo DIRECT 规则放行 `chatgpt.com/openai.com` 后重启

---

## ❌ 受阻（v4 plan 与现实不符）

### A. Yahoo Finance v8 → 已 user 决策砍

### B. Solscan public holders endpoint 下线
- `public-api.solscan.io` → 404
- `pro-api.solscan.io/v2.0` → 401（需要付费 key，$99/月起）
- Solana mainnet RPC `getTokenLargestAccounts` → 429（公开节点限速）
- Birdeye → 401（付费）
- **影响**：链上美股的 holders 列**没有免费源**了

**3 个选项**：
- (a) **砍 holders 列**，链上美股表头从 6 → 5 列（最干净）
- (b) user 注册免费 Helius API key（100k 请求/月，够 50 token × 30d × 24h）— 加复杂度
- (c) HTML 爬 solscan.io 网页（脆弱，反爬）

### C. 交易赛 tier-2 RSS 三个源 v4 写的 URL 全错
- PANews `/rss-zh.xml` → 404
- Foresight News `/rss` → HTML 非 RSS
- ChainCatcher `/rss/news.xml` → mihomo TLS error

需要重新找。**新方案候选**：
- (a) 砍 tier-2 RSS，MVP 仅做 tier-1（OKX 官方 announcements）
- (b) 用 CryptoPanic Free API（https://cryptopanic.com/developers/api/，公开 500 req/day）
- (c) Bitget 也有公开活动 endpoint，可 spike `https://www.bitget.com/v1/cms/announcement/list`（待验证）

### D. EtherScan V1 deprecated
- 旧 `api?module=gastracker&action=gasoracle` 返 NOTOK
- V2 要 API key（免费 5/req/s）
- user 注册 key 即可，1 分钟事

---

## v5 → v6 需要 user 拍板 3 个

**Q8 · Solscan holders 列**
- (a) 砍列（链上美股 5 列）
- (b) 注册 Helius free key
- (c) HTML 爬 solscan

**Q9 · 交易赛 tier-2 RSS**
- (a) 砍 tier-2，仅 OKX
- (b) 加 CryptoPanic Free API
- (c) spike Bitget 官方 activity endpoint

**Q10 · Polygon $29/月**
- (a) 砍（全部走东方财富免费）
- (b) 保留作美股 paid backup

**建议**：Q8=a / Q9=c (先 spike Bitget) / Q10=a。这三个决定让 plan v6 月费用 **从 $29 降到 $0**，技术栈也更稳。

---

## Plan v4 § 必须修正的 BLOCKER 增量（进 v6）

- §3 OKX 路径修正为 `/api/v5/support/announcements`
- §3 DefiLlama `/protocols` 字段标注 "fees/revenue/mcap/volume_1d 全 null，必须分接口拿"
- §3 yields 字段名修正：`tvlUsd` 不是 `tvl`
- §3 Solscan 全删（依 Q8 结果）
- §3 PANews/Foresight/ChainCatcher RSS 全删（依 Q9 结果）
- §3 ETH gas 改 EtherScan V2 endpoint + 加 ETHERSCAN_API_KEY env
- §3 顶部行情条字段细化（依 v5 已写）
- §8.32 东方财富 ×100 ✅ 已在 v5

---

## 已存档 Fixture（脱敏后）

- `eastmoney-clist-cn-a-shares.json`（A 股全表前 3 条）
- `eastmoney-indices.json`（沪/标普/纳指/道琼斯/恒指 5 项 stock get 响应）
- `eastmoney-us-stocks.json`（AAPL/NVDA/TSLA/QCOM 4 项 stock get 响应）
- `eastmoney-hk-stocks.json`（00700/09988 2 项）
- `defillama-protocols.json` (头 10 协议样本)
- `defillama-overview-fees.json` (头 10 协议含真 fees)
- `defillama-yields-pools.json` (头 10 池 + 1 个 stablecoin/single 样本)
- `defillama-coins-prices.json` (混 chain 批量样本)
- `defillama-coins-percentage.json` (混 chain 批量样本)
- `coingecko-categories.json` (头 5 categories)
- `alternative-fng.json`
- `okx-announcements.json` (头 5 公告)
- `github-repos-react.json`

Day 4 待办（user 修 mihomo 后）：
- token-allowlist.json 50 条人工录入（xStocks/Ondo/Backed 官网交叉核对）
- 92 仓库 GitHub white list 定稿 + PAT 实测 5000/h

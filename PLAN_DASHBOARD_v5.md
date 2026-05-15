# PLAN_DASHBOARD_v5 — 仪表盘动态克隆（v4 → v5 砍 Yahoo + 部署定稿）

> **触发原因**：Day 1 spike 实测发现 Yahoo Finance v8 从亚太/国内 IP 返回 sad-panda 反爬页面；user 决策（2026-05-14）：Q6=a 部署目标境外（Vercel / Cloudflare Workers）/ Q7 = 砍 Yahoo。

## v4 → v5 主要变更

- **决策 N（v5）**：部署目标 = **境外** Vercel / Cloudflare Workers / 境外 VPS（**生产环境所有源原生可达**）。本地 dev 环境通过 mihomo 代理已加 DIRECT 规则放行 Binance/Polygon/OpenAI。
- **决策 O（v5）**：**Yahoo Finance v8 全部砍**（顶部行情条股指 + 美股板块 fallback）。
- **§3 顶部行情条股指改源**：
  - `^GSPC` / `^IXIC`（美股指数）→ **Polygon** `/v2/aggs/ticker/I:SPX/prev` 类型 endpoint（Indices plan，付费版含）
  - `000001.SS`（上证指数）→ **东方财富 push2** `/api/qt/stock/get?secid=1.000001&fields=f43,f44,f45,f46,f60,f170`（同套接口）
  - `^HSI`（恒生指数）→ **东方财富 push2** `secid=100.HSI`（Day 2 spike 实测确认）
- **§3 美股 fallback 完全砍**：仅 Polygon 付费源（Stocks Starter $29/月已确定）；若 Polygon 挂了显示 cold，不再回落 Yahoo。
- **§3 增 deployment 章节**：明确生产部署细节 + dev 环境 mihomo 配置要求。
- **§8 BLOCKER 增条 32-33**：东方财富 字段 ×100 陷阱（Day 1 spike 实测发现）；mihomo MITM 已知 host 列表。

---

## §1 架构（v5 增 deployment 子段）

同 v4 三层（React → Hono → Redis），**部署目标定为 Vercel / Cloudflare Workers**（前端 Vercel Pages，后端 Vercel Functions 或独立 Node 服务器在境外 VPS）。

### Deployment（v5 新增）

```
┌──────────────────────┐    ┌──────────────────────┐
│ Vercel Pages         │    │ 境外 Node VPS         │
│ (web SPA)            │───►│ (Hono server,        │
│ port 443             │    │  Upstash Redis)      │
└──────────────────────┘    └──────────────────────┘
                                      │
                                      ▼
                                ┌─────────────┐
                                │ 9 个上游    │
                                │（原生可达） │
                                └─────────────┘
```

或者：**Vercel Functions + Upstash Redis**（serverless 全栈，单 region 选境外如 sfo1/iad1）。Week 1 编码完后 user 再选具体方案，**不影响 plan 主体**。

**本地 dev 环境要求**（mihomo 用户）：
- 给以下 host 加 DIRECT 规则（避免 mihomo MITM 引发 TLS 握手失败）：
  - `api.binance.com`
  - `api.polygon.io`
  - `chatgpt.com` / `openai.com`（Codex 用）
- 其余 host (DefiLlama / CoinGecko / GitHub / 东方财富 / OKX) 默认行为即可

---

## §2 目录结构（v5 微调）

同 v4，仅 `apps/api/src/adapters/`：
- 砍 `stocks.ts` 内 Yahoo fallback 分支
- 顶部行情条 ticker.ts 不再调 Yahoo；股指走 Polygon + 东方财富

新增 `infra/`（可选，部署脚本）：
- `infra/vercel.json` Vercel deploy config
- `infra/redis.md` Upstash Redis 接入说明

---

## §3 数据源矩阵 v5（仅列 v4 → v5 变化项）

| 板块 | v4 主源 | **v5 改** |
|---|---|---|
| **顶部行情条** | Binance + Yahoo + DefiLlama | **Binance + Polygon（美股指）+ 东方财富（沪指/恒指）+ DefiLlama**；Yahoo 砍 |
| **股票市场（美）** | Polygon (Yahoo fallback) | **Polygon only**（无 Yahoo fallback；挂了显示 cold） |

顶部行情条字段细化（v5）：

| Symbol | 源 | endpoint |
|---|---|---|
| BTC/USDT, ETH/USDT, SOL/USDT, BNB/USDT, DOGE/USDT | Binance | `/api/v3/ticker/24hr?symbols=[...]` (5 syms, weight ~20) |
| 美股指 ^GSPC | Polygon | `/v2/aggs/ticker/I:SPX/prev` (Day 1 v5 spike 验证 endpoint) |
| 美股指 ^IXIC | Polygon | `/v2/aggs/ticker/I:NDX/prev` 或 `I:COMP` (Day 1 v5 spike) |
| 上证指数 000001.SS | 东方财富 push2 | `/api/qt/stock/get?secid=1.000001&fields=f43,f44,f45,f46,f60,f170,f47` |
| 恒生指数 ^HSI | 东方财富 push2 | `secid=100.HSI`（Day 2 v5 spike 实测确认 secid 前缀） |
| 总市值 / BTC.D / 山寨指数 | DefiLlama | `/global` |
| ETH gas | EtherScan 公开 | `/api?module=gastracker&action=gasoracle` (无 key 可调用，5 req/s) |
| 山寨指数 / 性压抑指数 / 情绪 / 山寨 47/100 等 | **MVP 砍** | 这些是原站自创指标，没公开数据源；改用 alternative.me Fear & Greed（公开 https://api.alternative.me/fng/） 替代「情绪」一项；其余三项前端不显示 |

---

## §4 API 表 v5（不变）

同 v4 11 条路由。`/api/ticker` 响应字段保持稳定，仅源切换；前端无感。

---

## §5 前端 v5（微调）

- `PriceTicker.tsx` 字段列表更新（v5 文档同步）：
  - 加密 5 项（BTC/ETH/SOL/BNB/DOGE）
  - 股指 4 项（^GSPC/^IXIC/沪/^HSI）
  - 全局 4 项（总市值/BTC.D/情绪/ETH gas）
  - 砍：山寨指数 / 性压抑指数 / 山寨领先（这些是原站自造无数据源）
- 共 13 项滚动条目（v4 是 14 项含 4 个自造指标，v5 精简到 13 项真数据）。

---

## §6 分阶段交付 v5

```
Week 0 Day 1 (本日 - v5 已完成部分):
  ✅ 东方财富 push2 实测（5529 只 A 股 / 字段陷阱 ×100 记入 §8.32）
  ✅ Polygon endpoint 验证（路径正确，401 = key 错误符合预期）
  ⏸ Binance / Yahoo: Yahoo v5 已砍；Binance 待 user 修 mihomo 后重测
  ⏸ Codex 脚手架待 user 修 mihomo 后重启

Week 0 Day 2:
  ✅（自动从 Day 1 转入）东方财富 secid 列表 spike：
    - 上证指数 secid=1.000001
    - 恒生指数 secid=? (实测尝试 100.HSI / 124.HSI)
    - 美股指 ^GSPC/^IXIC 是否东方财富也有？(secid=100.SPX) - 实测确认能否完全替代 Polygon
  + OKX announcements + PANews/Foresight News/ChainCatcher RSS 实测
  + alternative.me Fear & Greed 实测（情绪指数源）
  + EtherScan gas tracker 实测

Week 0 Day 3-5: 同 v4
```

---

## §7 关键决策 v5 增量

承接 v4 决策 A-M，新增：

- **N（v5）**：部署目标 **Vercel / CF Workers / 境外 VPS**；本地 dev 通过 mihomo + DIRECT 规则。
- **O（v5）**：Yahoo Finance v8 **全砍**。
- **P（v5）**：美股指数尝试用东方财富 secid=100.SPX 替代 Polygon Indices（Day 2 spike 确认）；若 OK 则 Polygon 仅服务个股 snapshot，月费用法更经济。
- **Q（v5）**：原站「山寨指数 / 性压抑指数」**砍**；「情绪」改 alternative.me Fear & Greed 公开 API。

---

## §8 BLOCKER CHECKLIST v5 增量

承接 v4 1-31，新增：

32. **（v5 / Day 1 spike 实证）东方财富 push2 字段 ×100 陷阱**：
    - 所有价格字段（f2/f15/f16/f17/f18）以分为单位（实际值 × 100）
    - 所有百分比字段（f3 涨跌幅/f7 振幅/f8 换手率/f10 量比）× 100
    - 涨跌额 f4 × 100
    - 成交额 f6 是元（不 ×100）/ 成交量 f5 是手
    - PE f9 × 100
    - adapter 实现里**必须**做 `÷ 100` 还原，否则前端显示 9490 而非 94.90 元
    - 测试用例：用 Day 1 spike fixture 校验解析后字段值与人工 ÷ 100 计算一致
33. **（v5）mihomo MITM 已知不兼容 host**：
    - dev 环境 README 写明需为 `api.binance.com / api.polygon.io / chatgpt.com / openai.com` 加 mihomo DIRECT 规则
    - 不影响生产部署（境外 VPS / Vercel / CF 无此问题）
34. **（v5）东方财富 secid 编码**：
    - 沪市 = `1.{code}`（如 1.000001 上证指数 / 1.600519 茅台）
    - 深市 = `0.{code}`
    - 港股 = `116.{code}`（待 Day 2 spike 确认）
    - 美股 = `105.{code}` 个股 / `100.{ticker}` 指数（待 Day 2 spike 确认）
    - 指数 secid 前缀与个股不同，需在 spike 阶段穷举 - 不能假设
35. **（v5）alternative.me Fear & Greed 限速**：
    - endpoint: `https://api.alternative.me/fng/?limit=1`
    - 公开免费无限速文档，但保守加 5 min cache
    - 响应字段 `data[0].value` (0-100) + `value_classification`（"Extreme Fear" / "Fear" / "Neutral" / "Greed" / "Extreme Greed"）

---

## §9 STATUS（v5）

- v5 = **incremental from v4**（v4 主体仍有效；仅本文件列出 delta）。
- v4 文件保留作历史对照。
- 实施期参考顺序：**v5 优先 → v4 兜底**。
- 下一个 review 拐点：v5 是 Round 5。本 v5 仅是数据源精化 + 部署定稿，不是新 scope，**预期 Codex review 直接 APPROVE 或最多 NIT**；若 APPROVE 立即进 Day 2 spike + 重启 Codex 脚手架。

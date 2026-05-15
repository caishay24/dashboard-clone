# SPIKE_FAILED_B2A

Date: 2026-05-15

## What Completed

- Implemented `/api/stocks` route wiring, adapter, cache TTL/hardMax, sector pre-filtering, concurrency cap, and `meta.degraded[]` partial failure behavior.
- Implemented `/api/trading-comp` route wiring, OKX official tier-1 adapter, ChainCatcher tier-2 adapter, and cheerio crawler.
- Added Vitest coverage for both adapters and the ChainCatcher crawler.
- API tests pass: 25/25.
- Root build passes.

## Blockers / Deviations

1. Eastmoney real smoke from this environment returned empty replies for both `push2.eastmoney.com` and `push2his.eastmoney.com`.
   - Direct probe example: `curl` returned `Empty reply from server` for `secid=105.AAPL`.
   - Route behavior is still correct for partial failure: response stays `state:"fresh"`, `data:[]`, and failed stock codes are listed in `meta.degraded[]`.

2. The checked-in `apps/api/src/fixtures/chaincatcher-homepage.sample.html` contains only 4 `a[href^="/article/"]` anchors.
   - The requested fixture assertion of `>=10` extracted articles is impossible with this fixture without changing the fixture or fabricating records.
   - Tests assert the real fixture minimum (`>=4`) while preserving the requested production selector.

3. The checked-in Eastmoney client exposes `fetchEastmoneyQuote`, not `fetchStock`, and does not expose volume/amount/amplitude fields.
   - `apps/api/src/lib/eastmoney.ts` was left untouched per task constraint.
   - The stocks adapter uses the existing normalized quote fields and returns `null` for `volume`, `amount`, and `amplitude_pct`.

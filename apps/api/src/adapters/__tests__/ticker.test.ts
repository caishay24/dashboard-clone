import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { countCoinGeckoAttempt, isCoinGeckoStaleOnly } from "../../cgBudget";
import { fetchWithRetry } from "../../fetchWithRetry";
import { fetchTicker24h } from "../../lib/binance";
import { fetchEastmoneyQuote } from "../../lib/eastmoney";
import { getTicker } from "../ticker";

vi.mock("../../lib/binance", () => ({
  fetchTicker24h: vi.fn()
}));
vi.mock("../../lib/eastmoney", () => ({
  fetchEastmoneyQuote: vi.fn()
}));
vi.mock("../../fetchWithRetry", () => ({
  fetchWithRetry: vi.fn()
}));
vi.mock("../../cgBudget", () => ({
  countCoinGeckoAttempt: vi.fn(),
  isCoinGeckoStaleOnly: vi.fn(async () => false)
}));

const coingeckoGlobalFixture = JSON.parse(readFileSync(
  resolve(import.meta.dirname, "../../fixtures/coingecko-global.sample.json"),
  "utf8"
)) as {
  data: {
    total_market_cap: { usd: number };
    market_cap_percentage: { btc: number };
    market_cap_change_percentage_24h_usd: number;
  };
};

const fetchTicker24hMock = vi.mocked(fetchTicker24h);
const fetchEastmoneyQuoteMock = vi.mocked(fetchEastmoneyQuote);
const fetchWithRetryMock = vi.mocked(fetchWithRetry);
const countCoinGeckoAttemptMock = vi.mocked(countCoinGeckoAttempt);
const isCoinGeckoStaleOnlyMock = vi.mocked(isCoinGeckoStaleOnly);

describe("getTicker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isCoinGeckoStaleOnlyMock.mockResolvedValue(false);
    fetchTicker24hMock.mockResolvedValue([{ symbol: "BTCUSDT", price: 100, changePct: 1 }]);
    fetchEastmoneyQuoteMock.mockResolvedValue({
      code: "SPX",
      name: "标普500",
      price: 5000,
      high: 5100,
      low: 4900,
      previousClose: 4950,
      open: 4960,
      volume: 1000,
      amount: 2000,
      amplitudePct: 1.2,
      changeAbs: 50,
      changePct: 1
    });
    countCoinGeckoAttemptMock.mockResolvedValue(1);
    fetchWithRetryMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("coingecko.com/api/v3/global")) {
        return new Response(JSON.stringify(coingeckoGlobalFixture));
      }
      if (url.includes("alternative.me")) {
        return new Response(JSON.stringify({ data: [{ value: "34", value_classification: "Fear" }] }));
      }
      return new Response(JSON.stringify({ result: { ProposeGasPrice: "0.33" } }));
    });
  });

  it("aggregates ticker sources into response shape", async () => {
    const result = await getTicker();

    expect(result.degraded).toEqual([]);
    expect(result.data.crypto[0]).toEqual({ symbol: "BTCUSDT", price: 100, changePct: 1 });
    expect(result.data.indices).toHaveLength(5);
    expect(result.data.totalMcap).toBe(coingeckoGlobalFixture.data.total_market_cap.usd);
    expect(result.data.btcDominance).toBe(coingeckoGlobalFixture.data.market_cap_percentage.btc);
    expect(result.data.mcap24hChange).toBe(coingeckoGlobalFixture.data.market_cap_change_percentage_24h_usd);
    expect(result.data.fng).toEqual({ value: 34, classification: "Fear" });
    expect(result.data.ethGas).toBe(0.33);
    expect(countCoinGeckoAttemptMock).toHaveBeenCalledTimes(1);
  });

  it("marks failed sources degraded without failing the whole ticker", async () => {
    fetchTicker24hMock.mockRejectedValue(new Error("down"));

    const result = await getTicker();

    expect(result.degraded).toContain("binance");
    expect(result.data.crypto).toEqual([]);
    expect(result.data.indices).toHaveLength(5);
  });

  it("uses Sina fallback for all indices without marking eastmoney degraded", async () => {
    fetchEastmoneyQuoteMock.mockRejectedValue(new Error("push2 blocked"));
    fetchWithRetryMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("hq.sinajs.cn")) {
        return new Response([
          'var hq_str_s_sh000001="上证指数,4135.3894,-42.5281,-1.02,7331623,151924003";',
          'var hq_str_hkHSI="HSI,恒生指数,26391.020,26389.039,26391.020,25847.150,25962.730,-426.309,-1.615,0.00000,0.00000,325385515,19830055956,0.000,0.000,28056.100,22668.350,2026/05/15,16:10";',
          'var hq_str_gb_inx="标普500指数,7501.2402,0.77,2026-05-15 05:03:23,56.9900,7454.3999,7517.1201,7454.3999,7460.0400,5767.4102";',
          'var hq_str_gb_ixic="纳斯达克,26635.2219,0.88,2026-05-15 09:44:06,232.8781,26425.4684,26707.1412";',
          'var hq_str_gb_dji="道琼斯,50063.4609,0.75,2026-05-15 05:03:23,370.2600,49843.5781,50200.5391";'
        ].join("\n"));
      }
      if (url.includes("coingecko.com/api/v3/global")) {
        return new Response(JSON.stringify(coingeckoGlobalFixture));
      }
      if (url.includes("alternative.me")) {
        return new Response(JSON.stringify({ data: [{ value: "34", value_classification: "Fear" }] }));
      }
      return new Response(JSON.stringify({ result: { ProposeGasPrice: "0.33" } }));
    });

    const result = await getTicker();

    expect(result.degraded).not.toContain("eastmoney");
    expect(result.data.indices).toEqual([
      { name: "上证指数", code: "000001", price: 4135.3894, changePct: -1.02 },
      { name: "恒生指数", code: "HSI", price: 25962.73, changePct: -1.615 },
      { name: "标普500", code: "SPX", price: 7501.2402, changePct: 0.77 },
      { name: "纳斯达克", code: "NDX", price: 26635.2219, changePct: 0.88 },
      { name: "道琼斯", code: "DJIA", price: 50063.4609, changePct: 0.75 }
    ]);
  });

  it("marks CoinGecko global degraded and nulls market totals when it fails", async () => {
    fetchWithRetryMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("coingecko.com/api/v3/global")) {
        return new Response("service unavailable", { status: 503 });
      }
      if (url.includes("alternative.me")) {
        return new Response(JSON.stringify({ data: [{ value: "34", value_classification: "Fear" }] }));
      }
      return new Response(JSON.stringify({ result: { ProposeGasPrice: "0.33" } }));
    });

    const result = await getTicker();

    expect(result.degraded).toContain("coingecko-global");
    expect(result.data.totalMcap).toBeNull();
    expect(result.data.btcDominance).toBeNull();
    expect(result.data.mcap24hChange).toBeNull();
  });
});

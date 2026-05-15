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

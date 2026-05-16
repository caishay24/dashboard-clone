import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchEastmoneyQuote } from "../../lib/eastmoney";
import { fetchSinaIndicesBatch } from "../../lib/sina";
import { getStocks } from "../stocks";

vi.mock("../../lib/eastmoney", () => ({
  fetchEastmoneyQuote: vi.fn()
}));
vi.mock("../../lib/sina", () => ({
  fetchSinaIndicesBatch: vi.fn(async () => ({}))
}));

const fetchEastmoneyQuoteMock = vi.mocked(fetchEastmoneyQuote);
const fetchSinaIndicesBatchMock = vi.mocked(fetchSinaIndicesBatch);

describe("getStocks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchEastmoneyQuoteMock.mockResolvedValue({
      code: "AAPL",
      name: "苹果",
      price: 280.5,
      high: 282,
      low: 276.12,
      previousClose: 277,
      open: 278,
      volume: 123456,
      amount: 987654321,
      amplitudePct: 2.34,
      changeAbs: 3.5,
      changePct: 1.26,
      pe: null,
      pb: null,
      marketCap: null,
      circulatingCap: null,
      volumeRatio: null
    });
  });

  it("filters allowlist by sector before fetching and maps normalized quote fields", async () => {
    const result = await getStocks({ region: "us", sector: "科技巨头" });

    expect(fetchEastmoneyQuoteMock).toHaveBeenCalledTimes(7);
    expect(fetchEastmoneyQuoteMock).toHaveBeenCalledWith("105.AAPL");
    expect(result.degraded).toEqual([]);
    expect(result.data[0]).toEqual({
      code: "AAPL",
      secid: "105.AAPL",
      name_cn: "苹果",
      sector: "科技巨头",
      price: 280.5,
      change_pct: 1.26,
      change_abs: 3.5,
      high: 282,
      low: 276.12,
      prev_close: 277,
      volume: 123456,
      amount: 987654321,
      amplitude_pct: 2.34,
      pe: null,
      pb: null,
      market_cap: null,
      volume_ratio: null
    });
  });

  it("omits failed stocks and records degraded codes (both push2 + Sina fail)", async () => {
    fetchEastmoneyQuoteMock.mockImplementation(async (secid) => {
      if (secid === "105.MSFT") throw new Error("rate limited");
      return {
        code: String(secid).replace("105.", ""),
        name: "name",
        price: 100,
        high: 101,
        low: 99,
        previousClose: 98,
        open: 99,
        volume: 1000,
        amount: 2000,
        amplitudePct: 1.5,
        changeAbs: 2,
        changePct: 2.04,
        pe: null,
        pb: null,
        marketCap: null,
        circulatingCap: null,
        volumeRatio: null
      };
    });
    // Sina fallback also returns no data for MSFT → final degraded
    fetchSinaIndicesBatchMock.mockResolvedValue({});

    const result = await getStocks({ region: "us", sector: "科技巨头" });

    expect(result.degraded).toEqual(["MSFT"]);
    expect(result.data).toHaveLength(6);
    expect(result.data.some((item) => item.code === "MSFT")).toBe(false);
  });

  it("falls back to Sina when push2 fails for a single stock", async () => {
    fetchEastmoneyQuoteMock.mockImplementation(async (secid) => {
      if (secid === "105.MSFT") throw new Error("rate limited");
      return {
        code: String(secid).replace("105.", ""),
        name: "name",
        price: 100,
        high: 101,
        low: 99,
        previousClose: 98,
        open: 99,
        volume: 1000,
        amount: 2000,
        amplitudePct: 1.5,
        changeAbs: 2,
        changePct: 2.04,
        pe: null,
        pb: null,
        marketCap: null,
        circulatingCap: null,
        volumeRatio: null
      };
    });
    // Sina rescues MSFT via gb_msft
    fetchSinaIndicesBatchMock.mockResolvedValue({
      gb_msft: { symbol: "gb_msft", name: "微软", price: 421.92, changePct: 3.73, changeAbs: 15.20 }
    });

    const result = await getStocks({ region: "us", sector: "科技巨头" });

    expect(result.degraded).toEqual([]);
    expect(result.data).toHaveLength(7);
    const msft = result.data.find((item) => item.code === "MSFT");
    expect(msft?.price).toBe(421.92);
    expect(msft?.change_pct).toBeCloseTo(3.73);
    // Sina-only fields (volume/amount/high/low/amplitude) should be null
    expect(msft?.volume).toBeNull();
    expect(msft?.high).toBeNull();
  });
});

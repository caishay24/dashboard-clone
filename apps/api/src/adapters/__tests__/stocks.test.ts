import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchEastmoneyQuote } from "../../lib/eastmoney";
import { getStocks } from "../stocks";

vi.mock("../../lib/eastmoney", () => ({
  fetchEastmoneyQuote: vi.fn()
}));

const fetchEastmoneyQuoteMock = vi.mocked(fetchEastmoneyQuote);

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
      changePct: 1.26
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
      amplitude_pct: 2.34
    });
  });

  it("omits failed stocks and records degraded codes", async () => {
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
        changePct: 2.04
      };
    });

    const result = await getStocks({ region: "us", sector: "科技巨头" });

    expect(result.degraded).toEqual(["MSFT"]);
    expect(result.data).toHaveLength(6);
    expect(result.data.some((item) => item.code === "MSFT")).toBe(false);
  });
});

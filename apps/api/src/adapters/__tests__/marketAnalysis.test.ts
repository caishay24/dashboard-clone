import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchKlines } from "../../lib/binance";
import { getMarketAnalysis } from "../marketAnalysis";

vi.mock("../../lib/binance", () => ({
  fetchKlines: vi.fn()
}));

const fetchKlinesMock = vi.mocked(fetchKlines);

describe("getMarketAnalysis", () => {
  beforeEach(() => {
    fetchKlinesMock.mockResolvedValue(Array.from({ length: 70 }, (_, index) => ({
      time: index,
      open: index + 1,
      high: index + 2,
      low: index,
      close: index + 1,
      volume: 100
    })));
  });

  it("returns klines with locally computed indicators", async () => {
    const result = await getMarketAnalysis({ symbol: "BTCUSDT", interval: "1h" });

    expect(result.symbol).toBe("BTCUSDT");
    expect(result.klines).toHaveLength(70);
    expect(result.indicators.ma5[0]).toBe(3);
    expect(result.indicators.boll.upper.length).toBe(51);
    expect(result.indicators.rsi.at(-1)).toBe(100);
  });
});

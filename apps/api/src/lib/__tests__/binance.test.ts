import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchWithRetry } from "../../fetchWithRetry";
import { fetchKlines, fetchTicker24h } from "../binance";

vi.mock("../../fetchWithRetry", () => ({
  fetchWithRetry: vi.fn()
}));

const klinesFixture = JSON.parse(readFileSync(
  resolve(import.meta.dirname, "../../fixtures/binance-klines.sample.json"),
  "utf8"
)) as { sample: unknown[] };
const tickerFixture = JSON.parse(readFileSync(
  resolve(import.meta.dirname, "../../fixtures/binance-ticker-24h.sample.json"),
  "utf8"
)) as unknown;
const fetchWithRetryMock = vi.mocked(fetchWithRetry);

describe("binance client", () => {
  beforeEach(() => {
    fetchWithRetryMock.mockReset();
  });

  it("parses kline arrays into typed candles", async () => {
    fetchWithRetryMock.mockResolvedValue(new Response(JSON.stringify(klinesFixture.sample)));

    const result = await fetchKlines("BTCUSDT", "1h", 300);

    expect(result[0]).toEqual({
      time: 1777680000000,
      open: 78231.13,
      high: 78393.39,
      low: 78166.48,
      close: 78341.75,
      volume: 211.29374
    });
  });

  it("parses ticker price and percent fields", async () => {
    fetchWithRetryMock.mockResolvedValue(new Response(JSON.stringify(tickerFixture)));

    const result = await fetchTicker24h(["BTCUSDT"]);

    expect(result[0]).toEqual({ symbol: "BTCUSDT", price: 80273, changePct: 0.6 });
  });
});

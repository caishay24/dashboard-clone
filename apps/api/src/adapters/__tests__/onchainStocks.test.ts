import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchWithRetry } from "../../fetchWithRetry";
import { getOnchainStocks } from "../onchainStocks";

vi.mock("../../fetchWithRetry", () => ({
  fetchWithRetry: vi.fn()
}));

const fetchWithRetryMock = vi.mocked(fetchWithRetry);

describe("getOnchainStocks", () => {
  beforeEach(() => {
    fetchWithRetryMock.mockImplementation(async (input) => {
      const url = String(input);
      const keys = extractCoinKeys(url);
      if (url.includes("/prices/current/")) {
        return new Response(JSON.stringify({
          coins: Object.fromEntries(keys.slice(1).map((key, index) => [key, {
            symbol: `SYM${index}`,
            price: 100 + index,
            decimals: 8,
            confidence: index === 0 ? 0.95 : 0.42,
            timestamp: 1_765_238_400 + index
          }]))
        }));
      }
      return new Response(JSON.stringify({
        coins: Object.fromEntries(keys.map((key, index) => [key, index % 2 === 0 ? 1.25 : -2.5]))
      }));
    });
  });

  it("filters allowlist by issuer and category and merges price and 24h change", async () => {
    const result = await getOnchainStocks({ issuer: "ONDO", category: "ETF" });

    expect(result.data.length).toBeGreaterThan(0);
    expect(result.data.every((item) => item.issuer === "Ondo")).toBe(true);
    expect(result.data.every((item) => item.category === "ETF")).toBe(true);
    expect(result.data[0]).toMatchObject({
      chain: "solana",
      price: expect.any(Number),
      change24h: expect.any(Number),
      confidence: expect.any(Number),
      ts: expect.any(Number)
    });
    expect(result.data[0]).not.toHaveProperty("holders");
    expect(result.degraded).toEqual([expect.stringMatching(/ON$/)]);
  });

  it("splits long DefiLlama coin requests into multiple batches", async () => {
    await getOnchainStocks({ issuer: "all" });

    const priceCalls = fetchWithRetryMock.mock.calls
      .map(([input]) => String(input))
      .filter((url) => url.includes("/prices/current/"));
    expect(priceCalls.length).toBeGreaterThan(1);
    expect(priceCalls.every((url) => url.length <= 1500)).toBe(true);
  });
});

function extractCoinKeys(url: string) {
  const path = url.includes("/prices/current/") ? "/prices/current/" : "/percentage/";
  return url
    .split(path)[1]
    .split("?")[0]
    .split(",")
    .filter(Boolean);
}

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchWithRetry } from "../../fetchWithRetry";
import { getSectorMovers } from "../sectorMovers";

vi.mock("../../fetchWithRetry", () => ({
  fetchWithRetry: vi.fn()
}));
vi.mock("../../cgBudget", () => ({
  countCoinGeckoAttempt: vi.fn(),
  isCoinGeckoStaleOnly: vi.fn(async () => false)
}));

const fixture = JSON.parse(readFileSync(
  resolve(import.meta.dirname, "../../fixtures/coingecko-categories.sample.json"),
  "utf8"
)) as { top10_by_mcap: unknown[] };
const fetchWithRetryMock = vi.mocked(fetchWithRetry);

describe("getSectorMovers", () => {
  beforeEach(() => {
    fetchWithRetryMock.mockResolvedValue(new Response(JSON.stringify(fixture.top10_by_mcap)));
  });

  it("returns CoinGecko category mover shape sorted by market cap", async () => {
    const result = await getSectorMovers({ market: "crypto" });

    expect(result[0]).toMatchObject({
      id: "smart-contract-platform",
      name: "Smart Contract Platform"
    });
    expect(result[0]?.market_cap).toBeGreaterThan(0);
    expect(result[0]?.top_3_coins.length).toBe(3);
  });
});

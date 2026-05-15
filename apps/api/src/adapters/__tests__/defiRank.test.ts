import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDefiRank } from "../defiRank";
import { fetchWithRetry } from "../../fetchWithRetry";

vi.mock("../../fetchWithRetry", () => ({
  fetchWithRetry: vi.fn()
}));

const fixturesDir = resolve(import.meta.dirname, "../../fixtures");
const protocols = readJson("defillama-protocols.head10.json");
const feesOverview = readJson("defillama-overview-fees.head10.json");
const fetchWithRetryMock = vi.mocked(fetchWithRetry);

describe("getDefiRank", () => {
  beforeEach(() => {
    fetchWithRetryMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/protocols")) return jsonResponse(protocols);
      if (url.endsWith("/overview/fees")) return jsonResponse(feesOverview);
      throw new Error(`unexpected URL ${url}`);
    });
  });

  it("merges /protocols with /overview/fees by slug", async () => {
    const result = await getDefiRank({ sort: "fees", limit: 10 });
    const wbtc = result.find((item) => item.slug === "wbtc");

    expect(wbtc?.tvl).toBeGreaterThan(0);
    expect(wbtc?.fees24h).toBe(5890);
    expect(fetchWithRetryMock).toHaveBeenCalledTimes(2);
  });

  it("keeps CEX protocols without fee matches as null", async () => {
    const result = await getDefiRank({ sort: "tvl", limit: 10 });
    const binance = result.find((item) => item.slug === "binance-cex");

    expect(binance?.tvl).toBeGreaterThan(0);
    expect(binance?.fees24h).toBeNull();
  });
});

function readJson(file: string) {
  return JSON.parse(readFileSync(resolve(fixturesDir, file), "utf8")) as unknown;
}

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200 });
}

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getLiquidityPools } from "../liquidityPools";
import { fetchWithRetry } from "../../fetchWithRetry";

vi.mock("../../fetchWithRetry", () => ({
  fetchWithRetry: vi.fn()
}));

const fixture = readJson("defillama-yields-pools.sample.json") as {
  all_head10: unknown[];
};
const fetchWithRetryMock = vi.mocked(fetchWithRetry);

describe("getLiquidityPools", () => {
  beforeEach(() => {
    fetchWithRetryMock.mockResolvedValue(jsonResponse({ data: fixture.all_head10 }));
  });

  it("uses tvlUsd, filters by chain, and sorts by TVL", async () => {
    const result = await getLiquidityPools({ chain: "Ethereum", sort: "tvl", limit: 10 });

    expect(result.length).toBeGreaterThan(0);
    expect(result.every((pool) => pool.chain === "Ethereum")).toBe(true);
    expect(result[0]?.symbol).toBe("STETH");
    expect(result[0]?.tvlUsd).toBeGreaterThan(0);
  });

  it("sorts all pools by APR", async () => {
    const result = await getLiquidityPools({ chain: "all", sort: "apr", limit: 10 });

    expect(result[0]?.apy ?? 0).toBeGreaterThanOrEqual(result[1]?.apy ?? 0);
  });
});

function readJson(file: string) {
  return JSON.parse(readFileSync(resolve(import.meta.dirname, "../../fixtures", file), "utf8")) as unknown;
}

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200 });
}

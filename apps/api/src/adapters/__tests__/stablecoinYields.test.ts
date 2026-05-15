import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getStablecoinYields } from "../stablecoinYields";
import { fetchWithRetry } from "../../fetchWithRetry";

vi.mock("../../fetchWithRetry", () => ({
  fetchWithRetry: vi.fn()
}));

const fixture = readJson("defillama-yields-pools.sample.json") as {
  all_head10: unknown[];
  stablecoin_single_head5: unknown[];
};
const fetchWithRetryMock = vi.mocked(fetchWithRetry);

describe("getStablecoinYields", () => {
  beforeEach(() => {
    fetchWithRetryMock.mockResolvedValue(jsonResponse({
      data: [...fixture.all_head10, ...fixture.stablecoin_single_head5]
    }));
  });

  it("filters to stablecoin single-exposure pools and sorts by tvlUsd", async () => {
    const result = await getStablecoinYields({ asset: "all", limit: 10 });

    expect(result.length).toBeGreaterThan(0);
    expect(result.every((pool) => pool.stablecoin && pool.exposure === "single")).toBe(true);
    expect(result[0]?.tvlUsd ?? 0).toBeGreaterThanOrEqual(result[1]?.tvlUsd ?? 0);
  });

  it("filters by requested asset symbol", async () => {
    const result = await getStablecoinYields({ asset: "USDC", limit: 10 });

    expect(result.length).toBeGreaterThan(0);
    expect(result.every((pool) => pool.symbol.toUpperCase().split(/[^A-Z0-9]+/).includes("USDC"))).toBe(true);
  });
});

function readJson(file: string) {
  return JSON.parse(readFileSync(resolve(import.meta.dirname, "../../fixtures", file), "utf8")) as unknown;
}

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200 });
}

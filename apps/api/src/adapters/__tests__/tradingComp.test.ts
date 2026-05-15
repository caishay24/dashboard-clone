import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchWithRetry } from "../../fetchWithRetry";
import { extractArticles } from "../../crawlers/chaincatcher";
import { getTradingComp } from "../tradingComp";

vi.mock("../../fetchWithRetry", () => ({
  fetchWithRetry: vi.fn()
}));

const fixturesDir = resolve(import.meta.dirname, "../../fixtures");
const okxFixture = JSON.parse(readFileSync(resolve(fixturesDir, "okx-announcements.sample.json"), "utf8")) as unknown;
const chaincatcherHtml = readFileSync(resolve(fixturesDir, "chaincatcher-homepage.sample.html"), "utf8");
const fetchWithRetryMock = vi.mocked(fetchWithRetry);

describe("getTradingComp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("parses OKX official announcement details into tier-1 shape", async () => {
    fetchWithRetryMock.mockResolvedValue(new Response(JSON.stringify(okxFixture)));

    const result = await getTradingComp({ exchange: "okx" });

    expect(result).toHaveLength(20);
    expect(result[0]).toEqual({
      title: "OKX to list perpetual futures for COHR equity",
      url: "https://www.okx.com/help/okx-to-list-perpetual-futures-for-cohr-equity",
      annType: "announcements-new-listings",
      pTime: 1778662816390,
      source: "okx-official"
    });
  });

  it("extracts ChainCatcher articles from fixture HTML for tier-2 feeds", () => {
    const articles = extractArticles(chaincatcherHtml);

    expect(articles.length).toBeGreaterThanOrEqual(4);
    expect(articles[0]?.title).toBeTruthy();
    expect(articles[0]?.url).toMatch(/^https:\/\/www\.chaincatcher\.com\/article\//u);
  });

  it("returns fresh empty data when ChainCatcher has no exchange keyword matches", async () => {
    fetchWithRetryMock.mockResolvedValue(new Response(chaincatcherHtml));

    const result = await getTradingComp({ exchange: "bitget" });

    expect(result.every((item) => item.title.toLowerCase().includes("bitget"))).toBe(true);
  });
});

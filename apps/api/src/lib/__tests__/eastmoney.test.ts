import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchWithRetry } from "../../fetchWithRetry";
import { fetchEastmoneyQuote } from "../eastmoney";

vi.mock("../../fetchWithRetry", () => ({
  fetchWithRetry: vi.fn()
}));

const fixture = JSON.parse(readFileSync(
  resolve(import.meta.dirname, "../../fixtures/eastmoney-indices.sample.json"),
  "utf8"
)) as Record<string, { response: Record<string, unknown> & { data: Record<string, unknown> } }>;
const fetchWithRetryMock = vi.mocked(fetchWithRetry);

describe("fetchEastmoneyQuote", () => {
  beforeEach(() => {
    fetchWithRetryMock.mockResolvedValue(new Response(JSON.stringify({
      ...fixture["100.SPX"].response,
      data: {
        ...fixture["100.SPX"].response.data,
        f47: 123456789,
        f48: 9876543210,
        f168: 251
      }
    })));
  });

  it("divides Eastmoney price and percent fields by 100 and keeps volume and amount raw", async () => {
    const quote = await fetchEastmoneyQuote("100.SPX");

    expect(quote.price).toBe(7444.25);
    expect(quote.changePct).toBe(1.15);
    expect(quote.changeAbs).toBe(0.58);
    expect(quote.volume).toBe(123456789);
    expect(quote.amount).toBe(9876543210);
    expect(quote.amplitudePct).toBe(2.51);
  });
});

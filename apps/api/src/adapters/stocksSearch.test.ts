import { describe, expect, it } from "vitest";
import { searchCuratedStocks } from "./stocksSearch";

describe("searchCuratedStocks", () => {
  it("prioritizes Tencent Holdings for the Chinese Tencent query", () => {
    const results = searchCuratedStocks("腾讯", "all");

    expect(results[0]).toMatchObject({
      code: "00700",
      secid: "116.00700",
      name_cn: "腾讯控股",
      region: "hk"
    });
  });

  it("matches HK stocks by stripped numeric code", () => {
    const results = searchCuratedStocks("700", "all");

    expect(results[0]).toMatchObject({
      code: "00700",
      secid: "116.00700"
    });
  });
});

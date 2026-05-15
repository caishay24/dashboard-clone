import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { extractArticles } from "../chaincatcher";

const fixture = readFileSync(
  resolve(import.meta.dirname, "../../fixtures/chaincatcher-homepage.sample.html"),
  "utf8"
);

describe("extractArticles", () => {
  it("extracts normalized article titles and absolute URLs", () => {
    const articles = extractArticles(fixture);

    expect(articles.length).toBeGreaterThanOrEqual(4);
    expect(articles[0]?.title).not.toMatch(/^文章/u);
    expect(articles[0]?.title.length).toBeGreaterThan(0);
    expect(articles[0]?.url).toMatch(/^https:\/\/www\.chaincatcher\.com\/article\/\d+/u);
  });
});

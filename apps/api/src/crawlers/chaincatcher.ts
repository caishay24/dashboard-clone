import * as cheerio from "cheerio";

const CHAINCATCHER_ORIGIN = "https://www.chaincatcher.com";

export interface ChaincatcherArticle {
  title: string;
  url: string;
}

export function extractArticles(html: string): ChaincatcherArticle[] {
  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const articles: ChaincatcherArticle[] = [];

  $("a[href^='/article/']").each((_, element) => {
    const href = $(element).attr("href");
    if (!href) return;

    const title = normalizeTitle($(element).text());
    if (!title) return;

    const url = new URL(href, CHAINCATCHER_ORIGIN).toString();
    if (seen.has(url)) return;

    seen.add(url);
    articles.push({ title, url });
  });

  return articles;
}

function normalizeTitle(value: string) {
  return value
    .replace(/^\s*文章\s*/u, "")
    .replace(/\s+/gu, " ")
    .trim();
}

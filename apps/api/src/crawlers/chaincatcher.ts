const CHAINCATCHER_ORIGIN = "https://www.chaincatcher.com";

export interface ChaincatcherArticle {
  title: string;
  url: string;
}

export function extractArticles(html: string): ChaincatcherArticle[] {
  const seen = new Set<string>();
  const articles: ChaincatcherArticle[] = [];

  for (const match of html.matchAll(/<a\b[^>]*href=["'](?<href>\/article\/[^"']+)["'][^>]*>(?<body>[\s\S]*?)<\/a>/giu)) {
    const href = match.groups?.href;
    const body = match.groups?.body;
    if (!href || !body) continue;

    const title = normalizeTitle(stripTags(body));
    if (!title) continue;

    const url = new URL(href, CHAINCATCHER_ORIGIN).toString();
    if (seen.has(url)) continue;

    seen.add(url);
    articles.push({ title, url });
  }

  return articles;
}

function stripTags(value: string) {
  return value
    .replace(/<script\b[\s\S]*?<\/script>/giu, "")
    .replace(/<style\b[\s\S]*?<\/style>/giu, "")
    .replace(/<[^>]+>/gu, " ");
}

function normalizeTitle(value: string) {
  return value
    .replace(/^\s*文章\s*/u, "")
    .replace(/\s+/gu, " ")
    .trim();
}

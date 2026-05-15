import { z } from "zod";
import type { Exchange } from "@dashboard/shared";
import { fetchWithRetry } from "../fetchWithRetry";
import { extractArticles } from "../crawlers/chaincatcher";

const OKX_ANNOUNCEMENTS_URL = "https://www.okx.com/api/v5/support/announcements?annType=announcements-new-listings";
const CHAINCATCHER_URL = "https://www.chaincatcher.com/";

const okxResponseSchema = z.object({
  data: z.array(z.object({
    details: z.array(z.object({
      annType: z.string(),
      title: z.string(),
      url: z.string(),
      pTime: z.union([z.string(), z.number()])
    }).passthrough())
  }).passthrough())
}).passthrough();

export interface TradingCompItem {
  title: string;
  url: string;
  annType?: string;
  pTime: number | null;
  source: "okx-official" | "chaincatcher";
}

export async function getTradingComp(params: { exchange: Exchange }): Promise<TradingCompItem[]> {
  if (params.exchange === "okx") return fetchOkxAnnouncements();
  return fetchChaincatcherExchange(params.exchange);
}

async function fetchOkxAnnouncements(): Promise<TradingCompItem[]> {
  const response = await fetchWithRetry(OKX_ANNOUNCEMENTS_URL, {
    headers: {
      "User-Agent": "Mozilla/5.0"
    }
  });
  if (!response.ok) throw new Error(`OKX HTTP ${response.status}`);

  const parsed = okxResponseSchema.parse(await response.json());
  return (parsed.data[0]?.details ?? []).slice(0, 20).map((item) => ({
    title: item.title,
    url: item.url,
    annType: item.annType,
    pTime: Number(item.pTime),
    source: "okx-official"
  }));
}

async function fetchChaincatcherExchange(exchange: Exclude<Exchange, "okx">): Promise<TradingCompItem[]> {
  const response = await fetchWithRetry(CHAINCATCHER_URL, {
    headers: {
      "User-Agent": "Mozilla/5.0"
    }
  });
  if (!response.ok) throw new Error(`ChainCatcher HTTP ${response.status}`);

  const keyword = exchange.toLowerCase();
  const html = await response.text();
  return extractArticles(html)
    .filter((article) => article.title.toLowerCase().includes(keyword))
    .map((article) => ({
      title: article.title,
      url: article.url,
      pTime: null,
      source: "chaincatcher"
    }));
}

// /api/stocks/search?q=<query>&region=us|cn|hk|all&limit=10..30
// Combines eastmoney suggest (find stocks by name/code/pinyin) + reused stocks
// quote resolution (push2 → Sina fallback) so the response is a fully-priced
// StockItem[] just like /api/stocks.
import { searchEastmoney, type StockRegion } from "../lib/eastmoney-search";
import {
  fetchStockQuoteWithFallback,
  mapConcurrent,
  type StockItem,
  type StocksResult
} from "./stocks";

const CONCURRENCY = 5;

export async function getStocksSearch(params: {
  q: string;
  region?: StockRegion | "all";
  limit?: number;
}): Promise<StocksResult> {
  const { q, region = "all", limit = 20 } = params;
  const suggestions = await searchEastmoney(q, { region, limit });

  // No matches → empty data, not an error
  if (suggestions.length === 0) {
    return { data: [], degraded: [] };
  }

  // Resolve quotes for each suggestion (push2 + Sina fallback handled internally)
  const items = await mapConcurrent(suggestions, CONCURRENCY, async (s) => {
    return fetchStockQuoteWithFallback({
      code: s.code,
      secid: s.secid,
      name_cn: s.name_cn,
      sector: s.exchange || regionLabel(s.region)
    });
  });

  const degraded: string[] = [];
  const data: StockItem[] = [];
  items.forEach((item, i) => {
    if (item === null) degraded.push(suggestions[i].code);
    else data.push(item);
  });
  return { data, degraded };
}

function regionLabel(r: StockRegion): string {
  return r === "us" ? "美股" : r === "hk" ? "港股" : "A股";
}

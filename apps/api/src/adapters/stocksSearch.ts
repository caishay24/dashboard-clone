// /api/stocks/search?q=<query>&region=us|cn|hk|all&limit=10..30
// Combines eastmoney suggest (find stocks by name/code/pinyin) + reused stocks
// quote resolution (push2 → Sina fallback) so the response is a fully-priced
// StockItem[] just like /api/stocks.
import { searchEastmoney, type StockRegion } from "../lib/eastmoney-search";
import stockAllowlistRaw from "../stocks-allowlist.json";
import {
  fetchStockQuoteWithFallback,
  mapConcurrent,
  type StockItem,
  type StocksResult
} from "./stocks";

const CONCURRENCY = 5;
const stocksByRegion = stockAllowlistRaw as Record<StockRegion, Array<{
  code: string;
  secid: string;
  name_cn: string;
  sector: string;
}>>;

export async function getStocksSearch(params: {
  q: string;
  region?: StockRegion | "all";
  limit?: number;
}): Promise<StocksResult> {
  const { q, region = "all", limit = 20 } = params;
  const curated = searchCuratedStocks(q, region);
  const eastmoney = await searchEastmoney(q, { region, limit });
  const suggestions = dedupeSuggestions([...curated, ...eastmoney]).slice(0, limit);

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

export function searchCuratedStocks(query: string, region: StockRegion | "all") {
  const normalized = normalize(query);
  const codeQuery = normalized.replace(/^0+/, "");
  if (!normalized) return [];

  const regions: StockRegion[] = region === "all" ? ["us", "cn", "hk"] : [region];
  return regions
    .flatMap((r) => stocksByRegion[r].map((stock) => ({ ...stock, region: r })))
    .filter((stock) => {
      const code = normalize(stock.code);
      const strippedCode = code.replace(/^0+/, "");
      const name = normalize(stock.name_cn);
      return (
        code.includes(normalized) ||
        strippedCode.includes(codeQuery) ||
        name.includes(normalized)
      );
    })
    .sort((a, b) => scoreCuratedMatch(b, normalized, codeQuery) - scoreCuratedMatch(a, normalized, codeQuery))
    .map((stock) => ({
      code: stock.code,
      secid: stock.secid,
      name_cn: stock.name_cn,
      region: stock.region,
      classify: stock.region === "us" ? "UsStock" : stock.region === "hk" ? "HkStock" : "AStock",
      exchange: regionLabel(stock.region)
    }));
}

function scoreCuratedMatch(
  stock: { code: string; name_cn: string; region: StockRegion },
  normalized: string,
  codeQuery: string
) {
  const code = normalize(stock.code);
  const strippedCode = code.replace(/^0+/, "");
  const name = normalize(stock.name_cn);
  let score = 0;
  if (name === normalized) score += 100;
  else if (name.startsWith(normalized)) score += 80;
  else if (name.includes(normalized)) score += 60;
  if (code === normalized || strippedCode === codeQuery) score += 90;
  else if (code.startsWith(normalized) || strippedCode.startsWith(codeQuery)) score += 50;
  if (stock.region === "hk" && /[\u4e00-\u9fff]/.test(normalized)) score += 5;
  return score;
}

function dedupeSuggestions<T extends { secid: string }>(items: T[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.secid)) return false;
    seen.add(item.secid);
    return true;
  });
}

function normalize(value: string) {
  return value.trim().toLowerCase();
}

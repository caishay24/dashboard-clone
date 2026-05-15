import type { Region } from "@dashboard/shared";
import { z } from "zod";
import stockAllowlistRaw from "../stocks-allowlist.json";
import { fetchEastmoneyQuote, type EastmoneyQuote } from "../lib/eastmoney";

const CONCURRENCY = 5;

const stockAllowlistItemSchema = z.object({
  code: z.string(),
  secid: z.string(),
  name_cn: z.string(),
  sector: z.string()
});
const stockAllowlistSchema = z.object({
  us: z.array(stockAllowlistItemSchema),
  cn: z.array(stockAllowlistItemSchema),
  hk: z.array(stockAllowlistItemSchema)
});

type StockAllowlistItem = z.infer<typeof stockAllowlistItemSchema>;

export interface StockItem {
  code: string;
  secid: string;
  name_cn: string;
  sector: string;
  price: number | null;
  change_pct: number | null;
  change_abs: number | null;
  high: number | null;
  low: number | null;
  prev_close: number | null;
  volume: number | null;
  amount: number | null;
  amplitude_pct: number | null;
}

export interface StocksResult {
  data: StockItem[];
  degraded: string[];
}

const stocksByRegion = stockAllowlistSchema.parse(stockAllowlistRaw) as Record<Region, StockAllowlistItem[]>;

export async function getStocks(params: { region: Region; sector?: string }): Promise<StocksResult> {
  const selected = stocksByRegion[params.region]
    .filter((item) => !params.sector || item.sector === params.sector);
  const degraded: string[] = [];
  const data = await mapConcurrent(selected, CONCURRENCY, async (item) => {
    try {
      const quote = await fetchEastmoneyQuote(item.secid);
      return toStockItem(item, quote);
    } catch {
      degraded.push(item.code);
      return null;
    }
  });

  return {
    data: data.filter((item): item is StockItem => item !== null),
    degraded
  };
}

function toStockItem(item: StockAllowlistItem, quote: EastmoneyQuote): StockItem {
  return {
    code: item.code,
    secid: item.secid,
    name_cn: item.name_cn,
    sector: item.sector,
    price: quote.price,
    change_pct: quote.changePct,
    change_abs: quote.changeAbs,
    high: quote.high,
    low: quote.low,
    prev_close: quote.previousClose,
    volume: quote.volume,
    amount: quote.amount,
    amplitude_pct: quote.amplitudePct
  };
}

async function mapConcurrent<T, U>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<U>
) {
  const results = new Array<U>(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  );
  return results;
}

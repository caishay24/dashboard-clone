import type { Region } from "@dashboard/shared";
import { z } from "zod";
import stockAllowlistRaw from "../stocks-allowlist.json";
import { fetchEastmoneyQuote, type EastmoneyQuote } from "../lib/eastmoney";
import { fetchSinaIndicesBatch, type SinaSymbolKind } from "../lib/sina";

const CONCURRENCY = 5;

/**
 * Map a 东方财富 secid to a Sina symbol (used as fallback when push2 blocks
 * the request from Vercel's outbound IP). Returns null for unknown prefixes.
 *
 *   secid prefix  market           → Sina symbol            kind
 *   ────────────  ──────────────   ──────────────────────   ──────────
 *   105.<TICKER>  US stocks        gb_<lowercase ticker>    "long"
 *   1.<6digit>    上海 A 股        sh<code>                 "a-stock"
 *   0.<6digit>    深圳 A 股        sz<code>                 "a-stock"
 *   116.<5digit>  港股             hk<code>                 "long"  (hkXX branch in parser)
 */
export function secidToSinaSymbol(secid: string): { symbol: string; kind: SinaSymbolKind } | null {
  const dotIndex = secid.indexOf(".");
  if (dotIndex < 0) return null;
  const prefix = secid.slice(0, dotIndex);
  const code = secid.slice(dotIndex + 1);
  if (!code) return null;
  if (prefix === "105") return { symbol: `gb_${code.toLowerCase()}`, kind: "long" };
  if (prefix === "1")   return { symbol: `sh${code}`, kind: "a-stock" };
  if (prefix === "0")   return { symbol: `sz${code}`, kind: "a-stock" };
  if (prefix === "116") return { symbol: `hk${code}`, kind: "long" };
  return null;
}

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

  // Phase 1: try 东方财富 push2 per stock. Returns null on failure or empty data.
  const phase1: (StockItem | null)[] = await mapConcurrent(selected, CONCURRENCY, async (item) => {
    try {
      const quote = await fetchEastmoneyQuote(item.secid);
      if (typeof quote.price !== "number" || typeof quote.changePct !== "number") return null;
      return toStockItem(item, quote);
    } catch {
      return null;
    }
  });

  // Phase 2: collect items that failed 东方财富 and try Sina fallback in a single batch
  const missing: Array<{ index: number; item: StockAllowlistItem; sina: { symbol: string; kind: SinaSymbolKind } }> = [];
  phase1.forEach((value, index) => {
    if (value !== null) return;
    const item = selected[index];
    const sina = secidToSinaSymbol(item.secid);
    if (sina) missing.push({ index, item, sina });
  });

  if (missing.length > 0) {
    const sinaMap = await fetchSinaIndicesBatch(
      missing.map((m) => ({ symbol: m.sina.symbol, kind: m.sina.kind }))
    );
    for (const { index, item, sina } of missing) {
      const quote = sinaMap[sina.symbol];
      if (quote && typeof quote.price === "number" && typeof quote.changePct === "number") {
        // Sina does not expose volume/amount/high/low/amplitude in our parsed shape;
        // fill only the fields that matter to the UI (price, change_pct, change_abs).
        phase1[index] = {
          code: item.code,
          secid: item.secid,
          name_cn: item.name_cn,
          sector: item.sector,
          price: quote.price,
          change_pct: quote.changePct,
          change_abs: quote.changeAbs ?? null,
          high: null,
          low: null,
          prev_close: null,
          volume: null,
          amount: null,
          amplitude_pct: null
        };
      }
    }
  }

  // Final pass: any still-null entries → degraded
  phase1.forEach((value, index) => {
    if (value === null) degraded.push(selected[index].code);
  });

  return {
    data: phase1.filter((item): item is StockItem => item !== null),
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

export async function mapConcurrent<T, U>(
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

/**
 * Reusable per-stock quote resolution with push2 → Sina fallback.
 * Returns a StockItem on success, null on both-sources failure.
 * The caller supplies the metadata fields (code/secid/name_cn/sector) and we
 * fetch the live price + change.
 */
export async function fetchStockQuoteWithFallback(meta: {
  code: string;
  secid: string;
  name_cn: string;
  sector: string;
}): Promise<StockItem | null> {
  // Phase 1: 东方财富 push2
  try {
    const quote = await fetchEastmoneyQuote(meta.secid);
    if (typeof quote.price === "number" && typeof quote.changePct === "number") {
      return toStockItem(meta, quote);
    }
  } catch {
    /* fallthrough to Sina */
  }

  // Phase 2: Sina fallback
  const sina = secidToSinaSymbol(meta.secid);
  if (!sina) return null;
  const sinaMap = await fetchSinaIndicesBatch([{ symbol: sina.symbol, kind: sina.kind }]);
  const quote = sinaMap[sina.symbol];
  if (!quote || typeof quote.price !== "number" || typeof quote.changePct !== "number") {
    return null;
  }
  return {
    code: meta.code,
    secid: meta.secid,
    name_cn: meta.name_cn,
    sector: meta.sector,
    price: quote.price,
    change_pct: quote.changePct,
    change_abs: quote.changeAbs ?? null,
    high: null,
    low: null,
    prev_close: null,
    volume: null,
    amount: null,
    amplitude_pct: null
  };
}

// /api/stocks/detail?secid=<secid>
// Returns:
//   - quote: full live quote (price + ratios + volume etc) via push2 → Sina fallback
//   - reports: last N quarterly + annual reports (A股 only; null for US/HK)
//   - cashflow: last N cashflow rows (A股 only; null for US/HK)
//
// Data sources:
//   quote     → push2 (东方财富) → Sina fallback
//   reports   → datacenter.eastmoney.com RPT_F10_FINANCE_MAINFINADATA (A股 only)
//   cashflow  → datacenter.eastmoney.com RPT_F10_FINANCE_GCASHFLOW    (A股 only)
import { fetchEastmoneyQuote } from "../lib/eastmoney";
import {
  fetchAStockMainReport,
  fetchAStockCashflow,
  secidToSecuCode,
  type AStockReport,
  type AStockCashflow
} from "../lib/eastmoney-finance";
import { fetchSinaIndicesBatch } from "../lib/sina";
import { secidToSinaSymbol, type StockItem } from "./stocks";

export interface StockDetail {
  secid: string;
  quote: StockItem | null;
  reports: AStockReport[] | null;       // null = market not supported (US/HK)
  cashflow: AStockCashflow[] | null;    // null = market not supported
  notes: string[];                       // human-readable degradation notes
}

export async function getStocksDetail(params: { secid: string }): Promise<StockDetail> {
  const { secid } = params;
  const notes: string[] = [];

  // Run quote + finance in parallel; finance is A股-only so skipped gracefully
  // for US/HK secids (secidToSecuCode returns null).
  const secucode = secidToSecuCode(secid);
  const [quote, reports, cashflow] = await Promise.all([
    fetchQuote(secid).catch((e) => {
      notes.push(`quote_failed:${(e as Error).message ?? "unknown"}`);
      return null;
    }),
    secucode
      ? fetchAStockMainReport(secucode, 6).catch((e) => {
          notes.push(`reports_failed:${(e as Error).message ?? "unknown"}`);
          return null;
        })
      : Promise.resolve(null),
    secucode
      ? fetchAStockCashflow(secucode, 6).catch((e) => {
          notes.push(`cashflow_failed:${(e as Error).message ?? "unknown"}`);
          return null;
        })
      : Promise.resolve(null)
  ]);

  if (!secucode) notes.push("finance_unavailable_for_market");

  return { secid, quote, reports, cashflow, notes };
}

async function fetchQuote(secid: string): Promise<StockItem | null> {
  // push2 first
  try {
    const q = await fetchEastmoneyQuote(secid);
    if (typeof q.price === "number" && typeof q.changePct === "number" && q.price !== 0) {
      return {
        code: q.code || secid,
        secid,
        name_cn: q.name || secid,
        sector: secid.startsWith("1.") || secid.startsWith("0.") ? "A股"
              : secid.startsWith("105.") ? "美股"
              : secid.startsWith("116.") ? "港股" : "",
        price: q.price,
        change_pct: q.changePct,
        change_abs: q.changeAbs,
        high: q.high,
        low: q.low,
        prev_close: q.previousClose,
        volume: q.volume,
        amount: q.amount,
        amplitude_pct: q.amplitudePct,
        pe: q.pe,
        pb: q.pb,
        market_cap: q.marketCap,
        volume_ratio: q.volumeRatio
      };
    }
  } catch {
    /* fallthrough */
  }

  // Sina fallback (no ratios available)
  const sina = secidToSinaSymbol(secid);
  if (!sina) return null;
  const sinaMap = await fetchSinaIndicesBatch([{ symbol: sina.symbol, kind: sina.kind }]);
  const q = sinaMap[sina.symbol];
  if (!q || typeof q.price !== "number" || typeof q.changePct !== "number" || q.price === 0) {
    return null;
  }
  return {
    code: secid.split(".").pop() ?? secid,
    secid,
    name_cn: q.name || secid,
    sector: secid.startsWith("1.") || secid.startsWith("0.") ? "A股"
          : secid.startsWith("105.") ? "美股"
          : secid.startsWith("116.") ? "港股" : "",
    price: q.price,
    change_pct: q.changePct,
    change_abs: q.changeAbs ?? null,
    high: null,
    low: null,
    prev_close: null,
    volume: null,
    amount: null,
    amplitude_pct: null,
    pe: null,
    pb: null,
    market_cap: null,
    volume_ratio: null
  };
}

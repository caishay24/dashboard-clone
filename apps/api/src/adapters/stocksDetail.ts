// /api/stocks/detail?secid=<secid>
// Returns:
//   - quote: full live quote (price + ratios + volume etc) via push2 → Sina fallback
//   - reports: last N quarterly + annual reports (all markets supported)
//   - cashflow: last N cashflow rows (all markets supported)
//
// Data sources:
//   quote     → push2 (东方财富) → Sina fallback
//   A股 财报   → datacenter.eastmoney.com RPT_F10_FINANCE_MAINFINADATA + GCASHFLOW
//   美/港股 财报 → Yahoo Finance v10 quoteSummary (cookie + crumb flow)
import { fetchEastmoneyQuote } from "../lib/eastmoney";
import {
  fetchAStockMainReport,
  fetchAStockCashflow,
  secidToSecuCode,
  type AStockReport,
  type AStockCashflow
} from "../lib/eastmoney-finance";
import { fetchSinaIndicesBatch } from "../lib/sina";
import {
  fetchYahooFinancials,
  secidToYahooSymbol,
  type USHKReport,
  type USHKCashflow,
  type YahooStats
} from "../lib/yahoo-finance";
import { enrichRatios, secidToSinaSymbol, type StockItem } from "./stocks";

// Unified types: A股 + 美/港 share schemas with the same field names (Yahoo
// rows fill same shape as A股, missing fields = null).
export interface StockDetail {
  secid: string;
  quote: StockItem | null;
  reports: (AStockReport | USHKReport)[] | null;     // null only if all sources failed
  cashflow: (AStockCashflow | USHKCashflow)[] | null;
  yahooStats: YahooStats | null;                      // US/HK TTM-level ratios + cashflow + margins
  notes: string[];                                     // human-readable degradation notes
}

export async function getStocksDetail(params: { secid: string }): Promise<StockDetail> {
  const { secid } = params;
  const notes: string[] = [];

  // Run quote + finance in parallel. Finance source depends on market:
  //   A股   → datacenter.eastmoney.com (RPT_F10_FINANCE_*)
  //   美/港股 → Yahoo Finance quoteSummary
  const secucode = secidToSecuCode(secid);
  const yahooSymbol = secucode ? null : secidToYahooSymbol(secid);

  type FinanceTuple = {
    reports: (AStockReport | USHKReport)[] | null;
    cashflow: (AStockCashflow | USHKCashflow)[] | null;
    yahooStats: YahooStats | null;
  };
  const financePromise: Promise<FinanceTuple> = (async () => {
    if (secucode) {
      // A股
      const [reports, cashflow] = await Promise.all([
        fetchAStockMainReport(secucode, 6).catch((e) => {
          notes.push(`reports_failed:${(e as Error).message ?? "unknown"}`);
          return null;
        }),
        fetchAStockCashflow(secucode, 6).catch((e) => {
          notes.push(`cashflow_failed:${(e as Error).message ?? "unknown"}`);
          return null;
        })
      ]);
      return { reports, cashflow, yahooStats: null };
    }
    if (yahooSymbol) {
      // 美股 / 港股 — single Yahoo call covers reports + cashflow + TTM stats
      try {
        const yf = await fetchYahooFinancials(yahooSymbol);
        return {
          reports: yf.reports.length > 0 ? yf.reports : null,
          cashflow: yf.cashflow.length > 0 ? yf.cashflow : null,
          yahooStats: yf.stats
        };
      } catch (e) {
        notes.push(`yahoo_finance_failed:${(e as Error).message ?? "unknown"}`);
        return { reports: null, cashflow: null, yahooStats: null };
      }
    }
    notes.push("finance_unavailable_for_market");
    return { reports: null, cashflow: null, yahooStats: null };
  })();

  const [quote, finance] = await Promise.all([
    fetchQuote(secid).catch((e) => {
      notes.push(`quote_failed:${(e as Error).message ?? "unknown"}`);
      return null;
    }),
    financePromise
  ]);
  const { reports, cashflow, yahooStats } = finance;

  // Enrich PE/PB/market_cap on the single quote (single batched call per source).
  if (quote) {
    await enrichRatios([quote]);
  }

  return { secid, quote, reports, cashflow, yahooStats, notes };
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

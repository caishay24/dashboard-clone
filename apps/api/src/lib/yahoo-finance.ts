// Yahoo Finance v10 quoteSummary — covers 美股 + 港股 financial reports.
// A股 stays on datacenter.eastmoney.com.
//
// Yahoo blocks naive requests; we need a cookie + crumb pair:
//   1. GET https://fc.yahoo.com (sets `A1`/`A3` cookies)
//   2. GET https://query1.finance.yahoo.com/v1/test/getcrumb (returns plain string crumb)
//   3. GET /v10/finance/quoteSummary/<symbol>?modules=...&crumb=<crumb>
//
// Cookie + crumb cached at module level for the function lifetime (warm container ~15min).
// Cold start pays 2 extra round-trips (~1s) for fresh handshake.
import { fetchWithRetry } from "../fetchWithRetry";

const Y_HOST = "https://query1.finance.yahoo.com";
const COOKIE_BOOT = "https://fc.yahoo.com";
const CRUMB_URL = `${Y_HOST}/v1/test/getcrumb`;

interface CrumbSession {
  cookie: string;
  crumb: string;
  fetchedAt: number;
}
const SESSION_TTL_MS = 6 * 60 * 60 * 1000;  // 6h — Yahoo crumb usually stable for a day+
let session: CrumbSession | null = null;
let inflight: Promise<CrumbSession> | null = null;

async function getSession(): Promise<CrumbSession> {
  if (session && Date.now() - session.fetchedAt < SESSION_TTL_MS) return session;
  if (inflight) return inflight;
  inflight = (async () => {
    // Step 1: bootstrap cookie
    const bootResp = await fetchWithRetry(COOKIE_BOOT, {
      headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15" }
    });
    // Extract Set-Cookie headers and serialize to a Cookie request header
    const setCookies: string[] = [];
    bootResp.headers.forEach((value, key) => {
      if (key.toLowerCase() === "set-cookie") setCookies.push(value);
    });
    const cookie = setCookies
      .map((c) => c.split(";")[0])
      .filter(Boolean)
      .join("; ");

    // Step 2: get crumb
    const crumbResp = await fetchWithRetry(CRUMB_URL, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        Cookie: cookie
      }
    });
    if (!crumbResp.ok) throw new Error(`Yahoo crumb HTTP ${crumbResp.status}`);
    const crumb = (await crumbResp.text()).trim();
    if (!crumb || crumb.length > 30) throw new Error(`Yahoo invalid crumb: ${crumb.slice(0, 50)}`);

    const fresh: CrumbSession = { cookie, crumb, fetchedAt: Date.now() };
    session = fresh;
    return fresh;
  })();
  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

const yQuoteSummarySchema = {
  parse: (raw: unknown) => raw as {
    quoteSummary?: {
      result?: Array<{
        incomeStatementHistoryQuarterly?: { incomeStatementHistory?: YIncomeRow[] };
        incomeStatementHistory?: { incomeStatementHistory?: YIncomeRow[] };
        cashflowStatementHistoryQuarterly?: { cashflowStatements?: YCashRow[] };
        cashflowStatementHistory?: { cashflowStatements?: YCashRow[] };
      }>;
      error?: { code: string; description: string } | null;
    };
  }
};

interface YRawNum { raw?: number; fmt?: string }
interface YIncomeRow {
  endDate?: YRawNum;
  totalRevenue?: YRawNum;
  costOfRevenue?: YRawNum;
  grossProfit?: YRawNum;
  operatingIncome?: YRawNum;
  netIncome?: YRawNum;
  ebit?: YRawNum;
  incomeTaxExpense?: YRawNum;
}
interface YCashRow {
  endDate?: YRawNum;
  totalCashFromOperatingActivities?: YRawNum;
  totalCashflowsFromInvestingActivities?: YRawNum;
  totalCashFromFinancingActivities?: YRawNum;
}

// Unified output shape compatible with A股 schema for frontend reuse
export interface USHKReport {
  REPORT_DATE: string;       // "2026-03-31"
  REPORT_TYPE: string;       // "季报" / "年报"
  REPORT_DATE_NAME: string;  // "2026Q1" or "2025FY"
  TOTALOPERATEREVE: number | null;
  MLR: number | null;        // gross profit
  PARENTNETPROFIT: number | null; // net income
  KCFJCXSYJLR: number | null; // non-recurring net (Yahoo doesn't separate; use null)
  EPSJB: number | null;       // EPS basic (Yahoo doesn't expose here; null)
  BPS: number | null;         // BPS (null)
  MGJYXJJE: number | null;    // EPS operating cash (null)
  TOTALOPERATEREVETZ: number | null;  // computed YoY %
  PARENTNETPROFITTZ: number | null;   // computed YoY %
  KCFJCXSYJLRTZ: number | null;
}
export interface USHKCashflow {
  REPORT_DATE: string;
  REPORT_TYPE: string;
  NETCASH_OPERATE: number | null;
  NETCASH_INVEST: number | null;
  NETCASH_FINANCE: number | null;
}

const MODULES = [
  "incomeStatementHistoryQuarterly",
  "incomeStatementHistory",
  "cashflowStatementHistoryQuarterly",
  "cashflowStatementHistory"
].join(",");

/**
 * Map our secid to a Yahoo symbol.
 *   105.AAPL  → AAPL       (US stocks)
 *   116.00700 → 0700.HK    (HK, strip one leading zero from 5-digit code)
 * A股 (1./0.) returns null — handled via datacenter elsewhere.
 */
export function secidToYahooSymbol(secid: string): string | null {
  const dot = secid.indexOf(".");
  if (dot < 0) return null;
  const prefix = secid.slice(0, dot);
  const code = secid.slice(dot + 1);
  if (!code) return null;
  if (prefix === "105") return code.toUpperCase();
  if (prefix === "116") return `${code.replace(/^0/, "")}.HK`;
  return null;
}

export async function fetchYahooFinancials(yahooSymbol: string): Promise<{
  reports: USHKReport[];
  cashflow: USHKCashflow[];
}> {
  const sess = await getSession();
  const url = `${Y_HOST}/v10/finance/quoteSummary/${encodeURIComponent(yahooSymbol)}?modules=${MODULES}&crumb=${encodeURIComponent(sess.crumb)}`;
  const resp = await fetchWithRetry(url, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      Cookie: sess.cookie
    }
  });
  if (!resp.ok) throw new Error(`Yahoo quoteSummary HTTP ${resp.status}`);
  const parsed = yQuoteSummarySchema.parse(await resp.json());
  const result = parsed.quoteSummary?.result?.[0];
  if (!result) return { reports: [], cashflow: [] };

  const qIncome = result.incomeStatementHistoryQuarterly?.incomeStatementHistory ?? [];
  const aIncome = result.incomeStatementHistory?.incomeStatementHistory ?? [];
  const qCash = result.cashflowStatementHistoryQuarterly?.cashflowStatements ?? [];
  const aCash = result.cashflowStatementHistory?.cashflowStatements ?? [];

  // Combine quarterly + annual, sort by endDate desc
  const incomeRows = [
    ...qIncome.map((r) => ({ row: r, type: "季报" as const })),
    ...aIncome.map((r) => ({ row: r, type: "年报" as const }))
  ].filter((x) => x.row.endDate?.raw);

  const cashRows = [
    ...qCash.map((r) => ({ row: r, type: "季报" as const })),
    ...aCash.map((r) => ({ row: r, type: "年报" as const }))
  ].filter((x) => x.row.endDate?.raw);

  // Sort newest first
  incomeRows.sort((a, b) => (b.row.endDate!.raw! - a.row.endDate!.raw!));
  cashRows.sort((a, b) => (b.row.endDate!.raw! - a.row.endDate!.raw!));

  // Compute YoY for income rows by matching same-period one year prior
  const reports: USHKReport[] = incomeRows.map(({ row, type }) => {
    const endTs = row.endDate?.raw ?? 0;
    const endDate = row.endDate?.fmt ?? "";
    // Find prior-year same period (within ±15 days)
    const prior = incomeRows.find(({ row: r, type: t }) => {
      if (t !== type) return false;
      if (!r.endDate?.raw) return false;
      const delta = endTs - r.endDate.raw;
      const expected = type === "季报" ? 365 * 86400 : 365 * 86400;
      return Math.abs(delta - expected) < 30 * 86400;
    })?.row;

    const yoy = (curr: number | null, prev: number | null | undefined): number | null => {
      if (curr == null || !prev || prev === 0) return null;
      return ((curr - prev) / Math.abs(prev)) * 100;
    };

    const rev = row.totalRevenue?.raw ?? null;
    const gross = row.grossProfit?.raw ?? null;
    const net = row.netIncome?.raw ?? null;

    const year = endDate.slice(0, 4);
    const month = endDate.slice(5, 7);
    const q = month === "03" ? "Q1" : month === "06" ? "Q2" : month === "09" ? "Q3" : month === "12" ? (type === "年报" ? "FY" : "Q4") : "";

    return {
      REPORT_DATE: endDate ? `${endDate} 00:00:00` : "",
      REPORT_TYPE: type,
      REPORT_DATE_NAME: q ? `${year}${q}` : `${year}${type === "年报" ? "FY" : ""}`,
      TOTALOPERATEREVE: rev,
      MLR: gross && gross > 0 ? gross : null,
      PARENTNETPROFIT: net,
      KCFJCXSYJLR: null,
      EPSJB: null,
      BPS: null,
      MGJYXJJE: null,
      TOTALOPERATEREVETZ: yoy(rev, prior?.totalRevenue?.raw),
      PARENTNETPROFITTZ: yoy(net, prior?.netIncome?.raw),
      KCFJCXSYJLRTZ: null
    };
  });

  // Filter cashflow rows that have at least one non-null cash flow field.
  // Yahoo's v10 quoteSummary stopped returning detailed cashflow data in 2024+;
  // rows where all 3 fields are null are noise, drop them.
  const cashflow: USHKCashflow[] = cashRows
    .map(({ row, type }) => ({
      REPORT_DATE: row.endDate?.fmt ? `${row.endDate.fmt} 00:00:00` : "",
      REPORT_TYPE: type,
      NETCASH_OPERATE: row.totalCashFromOperatingActivities?.raw ?? null,
      NETCASH_INVEST: row.totalCashflowsFromInvestingActivities?.raw ?? null,
      NETCASH_FINANCE: row.totalCashFromFinancingActivities?.raw ?? null
    }))
    .filter((r) => r.NETCASH_OPERATE != null || r.NETCASH_INVEST != null || r.NETCASH_FINANCE != null);

  // Filter income rows where ALL key fields are null/zero (noise)
  const filteredReports = reports.filter((r) =>
    (r.TOTALOPERATEREVE && r.TOTALOPERATEREVE > 0) ||
    (r.PARENTNETPROFIT && r.PARENTNETPROFIT !== 0)
  );

  return { reports: filteredReports.slice(0, 6), cashflow: cashflow.slice(0, 6) };
}

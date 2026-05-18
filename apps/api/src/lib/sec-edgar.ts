// SEC EDGAR XBRL facts API — authoritative financial reports for US-listed companies.
// Free, no key, no cookie; requires a User-Agent with contact email per SEC fair-use policy.
//
// Endpoint: https://data.sec.gov/api/xbrl/companyfacts/CIK<10-digit>.json
//   Returns all reported concepts under us-gaap / dei taxonomies, each as a list of
//   { start, end, val, fp, fy, form } datapoints across the company's filing history.
//
// We extract single-period values (~90d for quarterly, ~365d for annual) from 5 key concepts:
//   Revenue: prefer RevenueFromContractWithCustomerExcludingAssessedTax (ASC 606),
//            fallback to Revenues (legacy).
//   NetIncomeLoss, GrossProfit, OperatingIncomeLoss
//   NetCashProvidedByUsedInOperatingActivities / InvestingActivities / FinancingActivities
//   EarningsPerShareBasic
import { fetchWithRetry } from "../fetchWithRetry";

const UA = "dashboard-clone caishay24@gmail.com";

interface XbrlPoint {
  start?: string;     // "YYYY-MM-DD"
  end: string;        // "YYYY-MM-DD"
  val: number;
  fp?: string;        // "Q1" / "Q2" / "Q3" / "FY"
  fy?: number;
  form?: string;      // "10-Q" / "10-K"
  filed?: string;
  accn?: string;
}

interface XbrlConcept {
  units?: Record<string, XbrlPoint[]>;  // "USD" / "USD/shares" / "shares" etc
}

interface CompanyFacts {
  cik?: number;
  entityName?: string;
  facts?: {
    "us-gaap"?: Record<string, XbrlConcept>;
    dei?: Record<string, XbrlConcept>;
  };
}

const DAY_MS = 86_400_000;

/** Single-quarter ~90 days, allow ±10 days slack for fiscal calendar variations */
function isSingleQuarter(p: XbrlPoint): boolean {
  if (!p.start) return false;
  const days = (Date.parse(p.end) - Date.parse(p.start)) / DAY_MS;
  return days >= 80 && days <= 100;
}

/** Annual: ~365 days, allow ±15 */
function isAnnual(p: XbrlPoint): boolean {
  if (!p.start) return false;
  const days = (Date.parse(p.end) - Date.parse(p.start)) / DAY_MS;
  return days >= 350 && days <= 380;
}

function pickUsdSeries(concept: XbrlConcept | undefined): XbrlPoint[] {
  if (!concept?.units) return [];
  return concept.units["USD"] ?? concept.units["USD/shares"] ?? concept.units["shares"] ?? [];
}

function getConcept(facts: CompanyFacts, name: string): XbrlConcept | undefined {
  return facts.facts?.["us-gaap"]?.[name] ?? facts.facts?.dei?.[name];
}

/**
 * Pick latest N single-quarter datapoints (most recent first), de-duplicated by end-date.
 * For each end-date, prefer the more recent filing (highest accn or filed date).
 */
function latestQuarters(points: XbrlPoint[], n: number): XbrlPoint[] {
  const qs = points.filter(isSingleQuarter);
  const byEnd = new Map<string, XbrlPoint>();
  for (const p of qs) {
    const cur = byEnd.get(p.end);
    if (!cur || (p.filed && (!cur.filed || p.filed > cur.filed))) {
      byEnd.set(p.end, p);
    }
  }
  return [...byEnd.values()].sort((a, b) => b.end.localeCompare(a.end)).slice(0, n);
}

function latestAnnuals(points: XbrlPoint[], n: number): XbrlPoint[] {
  const ys = points.filter(isAnnual);
  const byEnd = new Map<string, XbrlPoint>();
  for (const p of ys) {
    const cur = byEnd.get(p.end);
    if (!cur || (p.filed && (!cur.filed || p.filed > cur.filed))) {
      byEnd.set(p.end, p);
    }
  }
  return [...byEnd.values()].sort((a, b) => b.end.localeCompare(a.end)).slice(0, n);
}

/** Build lookup map from end-date → value for fast YoY comparison */
function endDateMap(points: XbrlPoint[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const p of points) m.set(p.end, p.val);
  return m;
}

function yoyPct(curr: number | null, prior: number | null): number | null {
  if (curr == null || prior == null || prior === 0) return null;
  return ((curr - prior) / Math.abs(prior)) * 100;
}

/** Find prior-year same period (within ±30 days of (end - 365)) */
function findPriorYear(end: string, points: XbrlPoint[]): XbrlPoint | null {
  const target = Date.parse(end) - 365 * DAY_MS;
  const tol = 30 * DAY_MS;
  let best: XbrlPoint | null = null;
  let bestDelta = Infinity;
  for (const p of points) {
    const delta = Math.abs(Date.parse(p.end) - target);
    if (delta < tol && delta < bestDelta) {
      best = p;
      bestDelta = delta;
    }
  }
  return best;
}

// Output shape mirrors A股 schema so frontend can reuse table component
export interface SecReport {
  REPORT_DATE: string;       // "YYYY-MM-DD 00:00:00"
  REPORT_TYPE: string;       // "季报" / "年报"
  REPORT_DATE_NAME: string;  // "fy2026 Q2" / "fy2025 FY"
  TOTALOPERATEREVE: number | null;
  MLR: number | null;
  PARENTNETPROFIT: number | null;
  KCFJCXSYJLR: number | null;       // SEC has no concept of 扣非; null
  EPSJB: number | null;
  BPS: number | null;
  MGJYXJJE: number | null;
  TOTALOPERATEREVETZ: number | null;
  PARENTNETPROFITTZ: number | null;
  KCFJCXSYJLRTZ: number | null;
}

export interface SecCashflow {
  REPORT_DATE: string;
  REPORT_TYPE: string;
  NETCASH_OPERATE: number | null;
  NETCASH_INVEST: number | null;
  NETCASH_FINANCE: number | null;
}

export async function fetchSecFinancials(cik: string): Promise<{ reports: SecReport[]; cashflow: SecCashflow[] }> {
  const padded = cik.padStart(10, "0");
  const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${padded}.json`;
  const response = await fetchWithRetry(url, { headers: { "User-Agent": UA } });
  if (!response.ok) throw new Error(`SEC EDGAR HTTP ${response.status}`);
  const facts = (await response.json()) as CompanyFacts;

  const revRaw = pickUsdSeries(
    getConcept(facts, "RevenueFromContractWithCustomerExcludingAssessedTax") ??
    getConcept(facts, "Revenues")
  );
  const niRaw = pickUsdSeries(getConcept(facts, "NetIncomeLoss"));
  const gpRaw = pickUsdSeries(getConcept(facts, "GrossProfit"));
  const opRaw = pickUsdSeries(getConcept(facts, "OperatingIncomeLoss"));
  const epsRaw = pickUsdSeries(getConcept(facts, "EarningsPerShareBasic"));
  const ocfRaw = pickUsdSeries(getConcept(facts, "NetCashProvidedByUsedInOperatingActivities"));
  const icfRaw = pickUsdSeries(getConcept(facts, "NetCashProvidedByUsedInInvestingActivities"));
  const fcfRaw = pickUsdSeries(getConcept(facts, "NetCashProvidedByUsedInFinancingActivities"));

  // Single-period filters per series
  const revQ = latestQuarters(revRaw, 12); // pull 12 quarters so we always find YoY pair
  const revA = latestAnnuals(revRaw, 4);
  const niQ = latestQuarters(niRaw, 12);
  const niA = latestAnnuals(niRaw, 4);
  const gpQ = latestQuarters(gpRaw, 12);
  const gpA = latestAnnuals(gpRaw, 4);
  const epsQ = latestQuarters(epsRaw, 12);
  const epsA = latestAnnuals(epsRaw, 4);
  const ocfQ = latestQuarters(ocfRaw, 12);
  const ocfA = latestAnnuals(ocfRaw, 4);
  const icfQ = latestQuarters(icfRaw, 12);
  const icfA = latestAnnuals(icfRaw, 4);
  const fcfQ = latestQuarters(fcfRaw, 12);
  const fcfA = latestAnnuals(fcfRaw, 4);

  const revQMap = endDateMap(revQ);
  const revAMap = endDateMap(revA);
  const niQMap = endDateMap(niQ);
  const niAMap = endDateMap(niA);

  const buildReport = (p: XbrlPoint, type: "季报" | "年报"): SecReport => {
    const rev = type === "季报" ? (revQMap.get(p.end) ?? null) : (revAMap.get(p.end) ?? null);
    const net = type === "季报" ? (niQMap.get(p.end) ?? null) : (niAMap.get(p.end) ?? null);
    const gp = type === "季报"
      ? (gpQ.find((x) => x.end === p.end)?.val ?? null)
      : (gpA.find((x) => x.end === p.end)?.val ?? null);
    const eps = type === "季报"
      ? (epsQ.find((x) => x.end === p.end)?.val ?? null)
      : (epsA.find((x) => x.end === p.end)?.val ?? null);

    // YoY: find prior-year same period from full quarterly history (revRaw filtered)
    const priorRev = findPriorYear(p.end, type === "季报" ? revQ.slice() : revA.slice());
    const priorNet = findPriorYear(p.end, type === "季报" ? niQ.slice() : niA.slice());

    return {
      REPORT_DATE: `${p.end} 00:00:00`,
      REPORT_TYPE: type,
      // Disambiguate quarterly labels by including the end-month, since SEC may
      // emit two records with the same fy/fp but different end-dates (filing
      // restatements). "2026-03 Q2" vs "2025-09 FY" reads cleanly.
      REPORT_DATE_NAME: type === "年报"
        ? `${p.fy ?? p.end.slice(0, 4)} 年报`
        : `${p.end.slice(0, 7)} ${p.fp ?? "Q?"}`,
      TOTALOPERATEREVE: rev,
      MLR: gp,
      PARENTNETPROFIT: net,
      KCFJCXSYJLR: null,
      EPSJB: eps,
      BPS: null,
      MGJYXJJE: null,
      TOTALOPERATEREVETZ: yoyPct(rev, priorRev?.val ?? null),
      PARENTNETPROFITTZ: yoyPct(net, priorNet?.val ?? null),
      KCFJCXSYJLRTZ: null
    };
  };

  // Use NetIncome quarters as the spine for quarterly reports (most reliable concept)
  const reportsQ = niQ.slice(0, 6).map((p) => buildReport(p, "季报"));
  const reportsA = niA.slice(0, 4).map((p) => buildReport(p, "年报"));

  const buildCashflow = (p: XbrlPoint, type: "季报" | "年报"): SecCashflow => {
    const op = (type === "季报" ? ocfQ : ocfA).find((x) => x.end === p.end)?.val ?? null;
    const inv = (type === "季报" ? icfQ : icfA).find((x) => x.end === p.end)?.val ?? null;
    const fin = (type === "季报" ? fcfQ : fcfA).find((x) => x.end === p.end)?.val ?? null;
    return {
      REPORT_DATE: `${p.end} 00:00:00`,
      REPORT_TYPE: type,
      NETCASH_OPERATE: op,
      NETCASH_INVEST: inv,
      NETCASH_FINANCE: fin
    };
  };

  const cashflowQ = ocfQ.slice(0, 4).map((p) => buildCashflow(p, "季报"));
  const cashflowA = ocfA.slice(0, 3).map((p) => buildCashflow(p, "年报"));

  // Interleave Q first (latest), then annuals (older context)
  const reports = [...reportsQ, ...reportsA];
  const cashflow = [...cashflowQ, ...cashflowA];

  return { reports, cashflow };
}

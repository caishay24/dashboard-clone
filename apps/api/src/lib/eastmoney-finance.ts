// 东方财富 financial reports for A股 (上海/深圳).
// US + HK financial data does not have a stable public datacenter endpoint;
// callers should gracefully degrade for those markets.
//
// Verified 2026-05-16 against datacenter.eastmoney.com (SECUCODE format "600519.SH" / "000001.SZ"):
//   RPT_F10_FINANCE_MAINFINADATA  — main financial indicators per report
//     EPSJB, BPS, TOTALOPERATEREVE, MLR, PARENTNETPROFIT, KCFJCXSYJLR,
//     TOTALOPERATEREVETZ (YoY%), PARENTNETPROFITTZ (YoY%), KCFJCXSYJLRTZ (YoY%)
//   RPT_F10_FINANCE_GCASHFLOW     — cash flow summary per report
//     NETCASH_OPERATE, NETCASH_INVEST, NETCASH_FINANCE
import { z } from "zod";
import { fetchWithRetry } from "../fetchWithRetry";

const DATACENTER_URL = "https://datacenter.eastmoney.com/securities/api/data/v1/get";

const mainRowSchema = z.object({
  REPORT_DATE: z.string(),                                  // "2026-03-31 00:00:00"
  REPORT_TYPE: z.string(),                                  // "一季报" / "年报" / "三季报" / "中报"
  REPORT_DATE_NAME: z.string().nullable().optional(),       // "2026一季报"
  EPSJB: z.number().nullable().optional(),                  // 基本每股收益
  BPS: z.number().nullable().optional(),                    // 每股净资产
  MGZBGJ: z.number().nullable().optional(),                 // 每股资本公积金
  MGWFPLR: z.number().nullable().optional(),                // 每股未分配利润
  MGJYXJJE: z.number().nullable().optional(),               // 每股经营现金流
  TOTALOPERATEREVE: z.number().nullable().optional(),       // 营业总收入
  MLR: z.number().nullable().optional(),                    // 毛利润
  PARENTNETPROFIT: z.number().nullable().optional(),        // 归属母公司净利润
  KCFJCXSYJLR: z.number().nullable().optional(),            // 扣非净利润
  TOTALOPERATEREVETZ: z.number().nullable().optional(),     // 营收 YoY%
  PARENTNETPROFITTZ: z.number().nullable().optional(),      // 归母净利 YoY%
  KCFJCXSYJLRTZ: z.number().nullable().optional()           // 扣非净利 YoY%
}).passthrough();

const cashflowRowSchema = z.object({
  REPORT_DATE: z.string(),
  REPORT_TYPE: z.string(),
  NETCASH_OPERATE: z.number().nullable().optional(),  // 经营活动现金流净额
  NETCASH_INVEST: z.number().nullable().optional(),   // 投资活动现金流净额
  NETCASH_FINANCE: z.number().nullable().optional()   // 筹资活动现金流净额
}).passthrough();

const responseSchema = <T extends z.ZodTypeAny>(item: T) => z.object({
  success: z.boolean(),
  result: z.object({
    data: z.array(item).nullable()
  }).nullable().optional()
}).passthrough();

export type AStockReport = z.infer<typeof mainRowSchema>;
export type AStockCashflow = z.infer<typeof cashflowRowSchema>;

/**
 * Convert eastmoney secid (e.g. "1.600519") into datacenter SECUCODE ("600519.SH").
 * Returns null when the secid is not an A-share (prefix 1.SH / 0.SZ).
 */
export function secidToSecuCode(secid: string): string | null {
  const [prefix, code] = secid.split(".");
  if (!code) return null;
  if (prefix === "1") return `${code}.SH`;
  if (prefix === "0") return `${code}.SZ`;
  return null;
}

export async function fetchAStockMainReport(secucode: string, limit = 5): Promise<AStockReport[]> {
  return fetchReport(
    "RPT_F10_FINANCE_MAINFINADATA",
    secucode,
    limit,
    mainRowSchema,
    "REPORT_DATE,REPORT_TYPE,REPORT_DATE_NAME,EPSJB,BPS,MGZBGJ,MGWFPLR,MGJYXJJE,TOTALOPERATEREVE,MLR,PARENTNETPROFIT,KCFJCXSYJLR,TOTALOPERATEREVETZ,PARENTNETPROFITTZ,KCFJCXSYJLRTZ"
  );
}

export async function fetchAStockCashflow(secucode: string, limit = 5): Promise<AStockCashflow[]> {
  return fetchReport(
    "RPT_F10_FINANCE_GCASHFLOW",
    secucode,
    limit,
    cashflowRowSchema,
    "REPORT_DATE,REPORT_TYPE,NETCASH_OPERATE,NETCASH_INVEST,NETCASH_FINANCE"
  );
}

async function fetchReport<T extends z.ZodTypeAny>(
  reportName: string,
  secucode: string,
  limit: number,
  schema: T,
  columns: string
): Promise<z.infer<T>[]> {
  const url = new URL(DATACENTER_URL);
  url.searchParams.set("reportName", reportName);
  url.searchParams.set("columns", columns);
  url.searchParams.set("filter", `(SECUCODE="${secucode}")`);
  url.searchParams.set("sortColumns", "REPORT_DATE");
  url.searchParams.set("sortTypes", "-1");
  url.searchParams.set("pageNumber", "1");
  url.searchParams.set("pageSize", String(Math.min(Math.max(limit, 1), 20)));

  const response = await fetchWithRetry(url, {
    headers: { "User-Agent": "Mozilla/5.0", Referer: "https://emweb.securities.eastmoney.com/" }
  });
  if (!response.ok) throw new Error(`Eastmoney finance HTTP ${response.status}`);
  const parsed = responseSchema(schema).parse(await response.json());
  if (!parsed.success || !parsed.result?.data) return [];
  return parsed.result.data as z.infer<T>[];
}

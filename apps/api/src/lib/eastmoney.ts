import { z } from "zod";
import { fetchWithRetry } from "../fetchWithRetry";

const EASTMONEY_APIS = ["https://push2.eastmoney.com", "https://push2his.eastmoney.com"] as const;
// f59 is the dynamic decimals field per security (A股=2 → /100, 美股=3 → /1000, etc).
// Use it for price-magnitude fields. Percentage fields (f168/f171) are always 2-decimal regardless.
const F59_SCALED_FIELDS = ["f43", "f44", "f45", "f46", "f60", "f170"] as const;
const PERCENT_2DP_FIELDS = ["f168", "f171"] as const;

const eastmoneyStockGetSchema = z.object({
  rc: z.number(),
  data: z.object({
    f43: z.number().nullable().optional(),
    f44: z.number().nullable().optional(),
    f45: z.number().nullable().optional(),
    f46: z.number().nullable().optional(),
    f47: z.number().nullable().optional(),
    f48: z.number().nullable().optional(),
    f57: z.string().nullable().optional(),
    f58: z.string().nullable().optional(),
    f59: z.number().nullable().optional(),
    f60: z.number().nullable().optional(),
    f168: z.number().nullable().optional(),
    f170: z.number().nullable().optional(),
    f171: z.number().nullable().optional()
  }).passthrough().nullable()
}).passthrough();

export interface EastmoneyQuote {
  code: string;
  name: string;
  price: number | null;
  high: number | null;
  low: number | null;
  previousClose: number | null;
  open: number | null;
  volume: number | null;
  amount: number | null;
  amplitudePct: number | null;
  changeAbs: number | null;
  changePct: number | null;
}

export async function fetchEastmoneyQuote(secid: string): Promise<EastmoneyQuote> {
  const parsed = await fetchEastmoneyJson(secid);
  if (parsed.rc !== 0 || !parsed.data) throw new Error(`Eastmoney rc ${parsed.rc}`);
  const data = normalizeScaledFields(parsed.data);

  return {
    code: data.f57 ?? secid,
    name: data.f58 ?? secid,
    price: data.f43 ?? null,
    high: data.f44 ?? null,
    low: data.f45 ?? null,
    previousClose: data.f46 ?? null,
    open: data.f60 ?? null,
    volume: data.f47 ?? null,
    amount: data.f48 ?? null,
    amplitudePct: data.f168 ?? null,
    changeAbs: data.f170 ?? null,
    changePct: data.f171 ?? null
  };
}

async function fetchEastmoneyJson(secid: string) {
  let lastError: unknown;
  for (const base of EASTMONEY_APIS) {
    const url = new URL("/api/qt/stock/get", base);
    url.searchParams.set("secid", secid);
    url.searchParams.set("fields", "f43,f44,f45,f46,f47,f48,f57,f58,f59,f60,f168,f170,f171");
    try {
      const response = await fetchWithRetry(url, {
        headers: {
          "User-Agent": "Mozilla/5.0"
        }
      });
      if (!response.ok) throw new Error(`Eastmoney HTTP ${response.status}`);
      return eastmoneyStockGetSchema.parse(await response.json());
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Eastmoney fetch failed");
}

function normalizeScaledFields<T extends Record<string, unknown>>(data: T) {
  const normalized: Record<string, unknown> = { ...data };
  // f59 = decimals per security (default 2 if absent). Divisor = 10^f59.
  const dec = typeof normalized["f59"] === "number" ? (normalized["f59"] as number) : 2;
  const priceDivisor = Math.pow(10, dec);
  for (const field of F59_SCALED_FIELDS) {
    const value = normalized[field];
    normalized[field] = typeof value === "number" ? value / priceDivisor : value;
  }
  for (const field of PERCENT_2DP_FIELDS) {
    const value = normalized[field];
    normalized[field] = typeof value === "number" ? value / 100 : value;
  }
  return normalized as T & Record<(typeof F59_SCALED_FIELDS)[number] | (typeof PERCENT_2DP_FIELDS)[number], number | null | undefined>;
}

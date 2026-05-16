// 东方财富 search/suggest API — used to look up stocks by name/code/pinyin.
// Public unauthenticated endpoint with a stable hardcoded token used by their web frontend.
// Response shape (verified 2026-05-16):
//   { QuotationCodeTable: { Data: [{ Code, Name, QuoteID, Classify, SecurityTypeName, MktNum }, ...] } }
//
// Classify mapping:
//   "UsStock" → US stocks (MktNum=105)
//   "AStock"  → CN A-shares (MktNum=1 沪 / 0 深)
//   "HkStock" → HK stocks (MktNum=116)
//   Others (Index/Fund/Bond/etc) → filtered out by default
import { z } from "zod";
import { fetchWithRetry } from "../fetchWithRetry";

const SUGGEST_URL = "https://searchapi.eastmoney.com/api/suggest/get";
const SUGGEST_TOKEN = "D43BF722C8E33BDC906FB84D85E326E8";

const suggestItemSchema = z.object({
  Code: z.string(),
  Name: z.string(),
  QuoteID: z.string(),
  Classify: z.string().optional(),
  SecurityTypeName: z.string().optional(),
  MktNum: z.string().optional()
}).passthrough();

const suggestResponseSchema = z.object({
  QuotationCodeTable: z.object({
    Data: z.array(suggestItemSchema).nullable().optional(),
    TotalCount: z.number().optional()
  }).passthrough()
}).passthrough();

export type StockRegion = "us" | "cn" | "hk";

export interface SuggestResult {
  code: string;
  secid: string;
  name_cn: string;
  region: StockRegion;
  classify: string;
  exchange: string; // SecurityTypeName like "沪A" / "美股" / "港股"
}

const CLASSIFY_TO_REGION: Record<string, StockRegion> = {
  UsStock: "us",
  AStock: "cn",
  HkStock: "hk"
};

export async function searchEastmoney(query: string, opts: {
  region?: StockRegion | "all";
  limit?: number;
} = {}): Promise<SuggestResult[]> {
  const { region = "all", limit = 20 } = opts;
  const url = new URL(SUGGEST_URL);
  url.searchParams.set("input", query);
  url.searchParams.set("type", "14"); // type=14 → stocks/funds/etc
  url.searchParams.set("token", SUGGEST_TOKEN);
  url.searchParams.set("count", String(Math.min(limit * 2, 50))); // over-fetch then filter

  const response = await fetchWithRetry(url, {
    headers: { "User-Agent": "Mozilla/5.0" }
  });
  if (!response.ok) throw new Error(`Eastmoney suggest HTTP ${response.status}`);

  const parsed = suggestResponseSchema.parse(await response.json());
  const raw = parsed.QuotationCodeTable.Data ?? [];

  const filtered: SuggestResult[] = [];
  for (const item of raw) {
    const r = CLASSIFY_TO_REGION[item.Classify ?? ""];
    if (!r) continue; // skip non-stock results (Index/Fund/Bond/ESG/etc)
    if (region !== "all" && r !== region) continue;
    filtered.push({
      code: item.Code,
      secid: item.QuoteID,
      name_cn: item.Name,
      region: r,
      classify: item.Classify ?? "",
      exchange: item.SecurityTypeName ?? ""
    });
    if (filtered.length >= limit) break;
  }
  return filtered;
}

import { z } from "zod";
import { exchangeSchema, regionSchema, tokenAllowlistItemSchema } from "@dashboard/shared";

const limit = (min: number, max: number, fallback: number) =>
  z.coerce.number().int().min(min).max(max).default(fallback);

export const tickerQuerySchema = z.object({});
export const stocksQuerySchema = z.object({
  region: regionSchema.default("us"),
  sector: z.string().min(1).max(80).optional()
});
export const stocksSearchQuerySchema = z.object({
  q: z.string().min(1).max(40),
  region: z.enum(["us", "cn", "hk", "all"]).default("all"),
  limit: limit(5, 30, 20)
});
// secid format: <market_num>.<ticker_or_code>  e.g. "1.600519", "105.AAPL", "116.00700"
export const stocksDetailQuerySchema = z.object({
  secid: z.string().regex(/^[0-9]{1,3}\.[A-Za-z0-9.]{1,20}$/, "invalid secid")
});
export const tradingCompQuerySchema = z.object({
  exchange: exchangeSchema.default("okx")
});
export const marketAnalysisQuerySchema = z.object({
  symbol: z.enum(["BTCUSDT", "ETHUSDT", "SOLUSDT"]).default("BTCUSDT"),
  interval: z.enum(["1h", "4h", "1d"]).default("1h")
});
export const defiRankQuerySchema = z.object({
  sort: z.enum(["tvl", "fees", "volume"]).default("tvl"),
  limit: limit(10, 100, 50)
});
export const liquidityPoolsQuerySchema = z.object({
  chain: z.string().min(1).max(40).default("all"),
  sort: z.enum(["tvl", "apr"]).default("tvl"),
  limit: limit(10, 200, 100)
});
export const sectorMoversQuerySchema = z.object({
  market: z.enum(["crypto"]).default("crypto"),
  category: z.string().min(1).max(80).optional()
});
export const onchainStocksQuerySchema = z.object({
  issuer: z.preprocess(
    (value) => typeof value === "string" ? value.toLowerCase() : value,
    z.enum(["ondo", "xstocks", "backed", "all"]).default("all")
  ),
  category: z.string().min(1).max(80).optional()
});
export const stablecoinYieldsQuerySchema = z.object({
  asset: z.enum(["USDT", "USDC", "DAI", "all"]).default("all"),
  limit: limit(10, 100, 50)
});
export const githubReposQuerySchema = z.object({
  category: z.string().min(1).max(80).optional()
});
export const tokenAllowlistSchema = z.array(tokenAllowlistItemSchema);

export function validateTokenAllowlist(value: unknown) {
  return tokenAllowlistSchema.parse(value);
}

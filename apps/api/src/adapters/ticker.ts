import { z } from "zod";
import { countCoinGeckoAttempt, isCoinGeckoStaleOnly } from "../cgBudget";
import { fetchWithRetry } from "../fetchWithRetry";
import { fetchTicker24h } from "../lib/binance";
import { fetchEastmoneyQuote } from "../lib/eastmoney";

const CRYPTO_SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "DOGEUSDT"];
const INDICES = [
  ["1.000001", "上证指数"],
  ["100.HSI", "恒生指数"],
  ["100.SPX", "标普500"],
  ["100.NDX", "纳斯达克"],
  ["100.DJIA", "道琼斯"]
] as const;

const fngSchema = z.object({
  data: z.array(z.object({
    value: z.string(),
    value_classification: z.string()
  }))
}).passthrough();

const gasSchema = z.object({
  result: z.object({
    ProposeGasPrice: z.string()
  }).passthrough()
}).passthrough();

const globalSchema = z.object({
  data: z.object({
    total_market_cap: z.object({
      usd: z.number()
    }).passthrough(),
    market_cap_percentage: z.object({
      btc: z.number(),
      eth: z.number().optional()
    }).passthrough(),
    market_cap_change_percentage_24h_usd: z.number().optional()
  }).passthrough()
}).passthrough();

export interface TickerData {
  crypto: { symbol: string; price: number; changePct: number }[];
  indices: { name: string; code: string; price: number; changePct: number }[];
  totalMcap: number | null;
  btcDominance: number | null;
  mcap24hChange?: number | null;
  fng: { value: number; classification: string } | null;
  ethGas: number | null;
}

export interface TickerResult {
  data: TickerData;
  degraded: string[];
}

export async function getTicker(): Promise<TickerResult> {
  const degraded: string[] = [];
  const [crypto, indices, global, fng, ethGas] = await Promise.all([
    capture("binance", degraded, () => fetchTicker24h(CRYPTO_SYMBOLS)),
    capture("eastmoney", degraded, fetchIndices),
    capture("coingecko-global", degraded, fetchMarketTotals),
    capture("alternative", degraded, fetchFearGreed),
    capture("etherscan", degraded, fetchEthGas)
  ]);

  return {
    data: {
      crypto: crypto ?? [],
      indices: indices ?? [],
      totalMcap: global?.totalMcap ?? null,
      btcDominance: global?.btcDominance ?? null,
      mcap24hChange: global?.mcap24hChange ?? null,
      fng: fng ?? null,
      ethGas: ethGas ?? null
    },
    degraded
  };
}

async function fetchIndices() {
  const quotes = await Promise.all(INDICES.map(([secid]) => fetchEastmoneyQuote(secid)));
  return quotes.map((quote, index) => ({
    name: quote.name || INDICES[index][1],
    code: quote.code,
    price: quote.price ?? 0,
    changePct: quote.changePct ?? 0
  }));
}

async function fetchMarketTotals() {
  if (await isCoinGeckoStaleOnly()) throw new Error("CoinGecko budget exceeded");

  await countCoinGeckoAttempt(1);
  const response = await fetchWithRetry("https://api.coingecko.com/api/v3/global");
  if (!response.ok) throw new Error(`CoinGecko global HTTP ${response.status}`);

  const global = globalSchema.parse(await response.json()).data;

  return {
    totalMcap: global.total_market_cap.usd,
    btcDominance: global.market_cap_percentage.btc,
    mcap24hChange: global.market_cap_change_percentage_24h_usd ?? null
  };
}

async function fetchFearGreed() {
  const response = await fetchWithRetry("https://api.alternative.me/fng/?limit=1");
  if (!response.ok) throw new Error(`alternative.me HTTP ${response.status}`);
  const latest = fngSchema.parse(await response.json()).data[0];
  if (!latest) throw new Error("alternative.me empty response");
  return {
    value: Number(latest.value),
    classification: latest.value_classification
  };
}

async function fetchEthGas() {
  const url = new URL("https://api.etherscan.io/v2/api");
  url.searchParams.set("module", "gastracker");
  url.searchParams.set("action", "gasoracle");
  url.searchParams.set("chainid", "1");
  url.searchParams.set("apikey", process.env.ETHERSCAN_API_KEY ?? "");
  const response = await fetchWithRetry(url);
  if (!response.ok) throw new Error(`Etherscan HTTP ${response.status}`);
  return Number(gasSchema.parse(await response.json()).result.ProposeGasPrice);
}

async function capture<T>(source: string, degraded: string[], fn: () => Promise<T>) {
  try {
    return await fn();
  } catch {
    degraded.push(source);
    return null;
  }
}

import { z } from "zod";
import { countCoinGeckoAttempt, isCoinGeckoStaleOnly } from "../cgBudget";
import { fetchWithRetry } from "../fetchWithRetry";
import { fetchTicker24h } from "../lib/binance";
import { fetchEastmoneyQuote } from "../lib/eastmoney";
import { fetchSinaIndicesBatch, type SinaSymbolKind } from "../lib/sina";

const CRYPTO_SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "DOGEUSDT"];

// Index source chain: try 东方财富 push2 first (richer fields), fall back to Sina
// (works from US/JP IPs where push2 blocks). SPY ETF is used as S&P 500 proxy
// (SPY × ~10 ≈ S&P 500 value; Sina does not expose ^SPX directly).
interface IndexSpec {
  code: string; // canonical code we display
  name: string;
  eastmoneySecid: string;
  sinaSymbol: string;
  sinaKind: SinaSymbolKind;
  sinaScale?: number; // multiplier applied to Sina price (e.g. 10 for SPY → S&P proxy)
}

const INDICES: IndexSpec[] = [
  { code: "000001", name: "上证指数", eastmoneySecid: "1.000001", sinaSymbol: "s_sh000001", sinaKind: "a-short" },
  { code: "HSI",    name: "恒生指数", eastmoneySecid: "100.HSI",   sinaSymbol: "hkHSI",     sinaKind: "long" },
  { code: "SPX",    name: "标普500", eastmoneySecid: "100.SPX",   sinaSymbol: "gb_spy",    sinaKind: "long", sinaScale: 10 },
  { code: "NDX",    name: "纳斯达克", eastmoneySecid: "100.NDX",   sinaSymbol: "gb_ixic",   sinaKind: "long" },
  { code: "DJIA",   name: "道琼斯",  eastmoneySecid: "100.DJIA",  sinaSymbol: "gb_dji",    sinaKind: "long" }
];

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
  // Try 东方财富 per-index, settle into a partial map by canonical code.
  const eastmoneyResults = await Promise.allSettled(
    INDICES.map(async (spec) => {
      const quote = await fetchEastmoneyQuote(spec.eastmoneySecid);
      if (typeof quote.price !== "number" || typeof quote.changePct !== "number") {
        throw new Error("east incomplete");
      }
      return {
        spec,
        price: quote.price,
        changePct: quote.changePct,
        name: quote.name || spec.name
      };
    })
  );

  // Collect which specs need Sina fallback
  const missing: IndexSpec[] = [];
  const resolved = new Map<string, { name: string; price: number; changePct: number }>();
  eastmoneyResults.forEach((r, i) => {
    if (r.status === "fulfilled") {
      const v = r.value;
      resolved.set(v.spec.code, { name: v.name, price: v.price, changePct: v.changePct });
    } else {
      missing.push(INDICES[i]);
    }
  });

  // Sina fallback for missing specs (single batch request)
  if (missing.length > 0) {
    const sina = await fetchSinaIndicesBatch(
      missing.map((spec) => ({ symbol: spec.sinaSymbol, kind: spec.sinaKind }))
    );
    for (const spec of missing) {
      const quote = sina[spec.sinaSymbol];
      if (quote && typeof quote.price === "number" && typeof quote.changePct === "number") {
        const price = spec.sinaScale ? quote.price * spec.sinaScale : quote.price;
        resolved.set(spec.code, {
          name: spec.name, // keep our canonical Chinese name
          price,
          changePct: quote.changePct
        });
      }
    }
  }

  // Output in canonical INDICES order; missing entries throw to push 'eastmoney' to degraded[]
  const out = INDICES.map((spec) => {
    const r = resolved.get(spec.code);
    if (!r) return null;
    return { name: r.name, code: spec.code, price: r.price, changePct: r.changePct };
  });
  if (out.some((x) => x === null)) {
    throw new Error("indices partial");
  }
  return out as { name: string; code: string; price: number; changePct: number }[];
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

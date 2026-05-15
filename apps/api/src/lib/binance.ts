import { z } from "zod";
import { fetchWithRetry } from "../fetchWithRetry";

const BINANCE_APIS = ["https://api.binance.com", "https://data-api.binance.vision"] as const;

const ticker24hSchema = z.object({
  symbol: z.string(),
  lastPrice: z.string(),
  priceChangePercent: z.string()
}).passthrough();

const klineSchema = z.tuple([
  z.number(),
  z.string(),
  z.string(),
  z.string(),
  z.string(),
  z.string()
]).rest(z.unknown());

export interface BinanceTicker {
  symbol: string;
  price: number;
  changePct: number;
}

export interface BinanceKline {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export async function fetchTicker24h(symbols: string[]): Promise<BinanceTicker[]> {
  const data = await getBinanceJson("/api/v3/ticker/24hr", { symbols: JSON.stringify(symbols) });
  return z.array(ticker24hSchema).parse(data).map((item) => ({
    symbol: item.symbol,
    price: Number(item.lastPrice),
    changePct: Number(item.priceChangePercent)
  }));
}

export async function fetchKlines(symbol: string, interval: string, limit: number): Promise<BinanceKline[]> {
  const data = await getBinanceJson("/api/v3/klines", {
    symbol,
    interval,
    limit: String(limit)
  });
  return z.array(klineSchema).parse(data).map((row) => ({
    time: row[0],
    open: Number(row[1]),
    high: Number(row[2]),
    low: Number(row[3]),
    close: Number(row[4]),
    volume: Number(row[5])
  }));
}

async function getBinanceJson(path: string, params: Record<string, string>) {
  let lastError: unknown;
  for (const base of BINANCE_APIS) {
    const url = new URL(path, base);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    try {
      const response = await fetchWithRetry(url);
      if (!response.ok) throw new Error(`Binance HTTP ${response.status}`);
      return response.json() as Promise<unknown>;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Binance fetch failed");
}

import { fetchKlines } from "../lib/binance";
import { bollinger, macd, rsi, sma } from "../lib/indicators";

export async function getMarketAnalysis(params: {
  symbol: "BTCUSDT" | "ETHUSDT" | "SOLUSDT";
  interval: "1h" | "4h" | "1d";
}) {
  const klines = await fetchKlines(params.symbol, params.interval, 300);
  const closes = klines.map((kline) => kline.close);

  return {
    symbol: params.symbol,
    interval: params.interval,
    klines,
    indicators: {
      ma5: sma(closes, 5),
      ma20: sma(closes, 20),
      ma60: sma(closes, 60),
      boll: bollinger(closes, 20, 2),
      rsi: rsi(closes, 14),
      macd: macd(closes, 12, 26, 9)
    }
  };
}

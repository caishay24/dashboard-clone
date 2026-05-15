import { useState } from "react";
import { Card } from "../components/Card";
import { SectionLayout } from "../components/SectionLayout";
import { Sparkline } from "../components/Sparkline";
import { useDashboardQuery } from "../hooks/useDashboardQuery";
import { formatNumber } from "../lib/format";

const symbols = [["BTCUSDT", "BTC/USDT"], ["ETHUSDT", "ETH/USDT"], ["SOLUSDT", "SOL/USDT"]] as const;
const intervals = [["1h", "1H"], ["4h", "4H"], ["1d", "1D"]] as const;

interface MarketAnalysisData {
  symbol: string;
  interval: string;
  klines: { close: number }[];
  indicators: {
    ma5: Array<number | null>;
    ma20: Array<number | null>;
    ma60: Array<number | null>;
    boll: { upper: Array<number | null>; middle: Array<number | null>; lower: Array<number | null> };
    rsi: Array<number | null>;
    macd: { macd: Array<number | null>; signal: Array<number | null>; histogram: Array<number | null> };
  };
}

const last = (values: Array<number | null>) => [...values].reverse().find((value): value is number => value != null) ?? null;

export default function MarketAnalysis() {
  const [symbol, setSymbol] = useState<(typeof symbols)[number][0]>("BTCUSDT");
  const [interval, setInterval] = useState<(typeof intervals)[number][0]>("1h");
  const query = useDashboardQuery<MarketAnalysisData>("market-analysis", `/api/market-analysis?symbol=${symbol}&interval=${interval}`);
  const data = query.envelope?.data;
  const ma5 = last(data?.indicators.ma5 ?? []);
  const ma20 = last(data?.indicators.ma20 ?? []);
  const rsi = last(data?.indicators.rsi ?? []);
  const interpretation = [
    ma5 != null && ma20 != null ? (ma5 > ma20 ? "MA5>MA20 多头排列" : "MA5<MA20 空头排列") : null,
    rsi != null && rsi > 70 ? "RSI 超买" : null,
    rsi != null && rsi < 30 ? "RSI 超卖" : null
  ].filter(Boolean).join(" / ") || "指标中性";

  return (
    <SectionLayout title="行情解析" envelope={query.envelope} isLoading={query.isLoading} error={query.error} empty={!data}>
      <div className="flex flex-wrap justify-between gap-3">
        <div className="flex gap-2">{symbols.map(([id, label]) => <button key={id} type="button" onClick={() => setSymbol(id)} className={`rounded border px-3 py-2 text-sm ${symbol === id ? "border-app-fg bg-app-fg text-app-bg" : "border-app-line text-app-fg"}`}>{label}</button>)}</div>
        <div className="flex gap-2">{intervals.map(([id, label]) => <button key={id} type="button" onClick={() => setInterval(id)} className={`rounded border px-3 py-2 text-sm ${interval === id ? "border-app-fg bg-app-fg text-app-bg" : "border-app-line text-app-fg"}`}>{label}</button>)}</div>
      </div>
      <Card title={`${symbol} ${interval.toUpperCase()}`}>
        <Sparkline data={(data?.klines ?? []).map((item) => item.close)} />
      </Card>
      <div className="grid gap-3 md:grid-cols-4">
        <Card title="MA"><p className="font-mono text-sm">MA5 {formatNumber(ma5)}<br />MA20 {formatNumber(ma20)}<br />MA60 {formatNumber(last(data?.indicators.ma60 ?? []))}</p></Card>
        <Card title="BOLL"><p className="font-mono text-sm">U {formatNumber(last(data?.indicators.boll.upper ?? []))}<br />M {formatNumber(last(data?.indicators.boll.middle ?? []))}<br />L {formatNumber(last(data?.indicators.boll.lower ?? []))}</p></Card>
        <Card title="RSI(14)"><p className={`font-mono text-2xl ${rsi != null && rsi > 70 ? "text-emerald-400" : rsi != null && rsi < 30 ? "text-red-400" : "text-app-fg"}`}>{formatNumber(rsi)}</p><div className="mt-2 h-2 rounded bg-app-line"><div className="h-2 rounded bg-app-fg" style={{ width: `${Math.min(100, Math.max(0, rsi ?? 0))}%` }} /></div></Card>
        <Card title="MACD"><p className="font-mono text-sm">macd {formatNumber(last(data?.indicators.macd.macd ?? []))}<br />signal {formatNumber(last(data?.indicators.macd.signal ?? []))}<br />hist {formatNumber(last(data?.indicators.macd.histogram ?? []))}</p></Card>
      </div>
      <Card><p className="text-sm text-app-muted">{interpretation}</p></Card>
    </SectionLayout>
  );
}

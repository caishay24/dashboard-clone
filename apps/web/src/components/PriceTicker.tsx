import { StaleBanner } from "./StaleBanner";
import { useDashboardQuery } from "../hooks/useDashboardQuery";
import { formatNumber, formatPct, formatTvl } from "../lib/format";

interface TickerData {
  crypto: { symbol: string; price: number; changePct: number }[];
  indices: { name: string; code: string; price: number; changePct: number }[];
  totalMcap: number | null;
  btcDominance: number | null;
  fng: { value: number; classification: string } | null;
  ethGas: number | null;
}

export function PriceTicker() {
  const { envelope, isLoading } = useDashboardQuery<TickerData>("ticker", "/api/ticker", { refetchInterval: 30_000 });

  if (isLoading || envelope?.meta.state === "cold") {
    return (
      <div className="border-b border-app-line bg-[#141414] px-4 py-2">
        <div className="mx-auto max-w-7xl font-mono text-xs text-app-muted">Loading...</div>
      </div>
    );
  }

  const degraded = new Set(envelope?.meta.degraded ?? []);
  const data = envelope?.data;
  const items = [
    ...(data?.crypto ?? []).map((item) => ({
      label: item.symbol.replace("USDT", ""),
      value: degraded.has("binance") ? "-" : `$${formatNumber(item.price, 2)}`,
      pct: degraded.has("binance") ? null : item.changePct
    })),
    ...(data?.indices ?? []).map((item) => ({
      label: item.name,
      value: degraded.has("eastmoney") ? "-" : formatNumber(item.price, 2),
      pct: degraded.has("eastmoney") ? null : item.changePct
    })),
    { label: "Total mcap", value: degraded.has("coingecko-global") ? "-" : formatTvl(data?.totalMcap), pct: null },
    { label: "BTC.D", value: degraded.has("coingecko-global") ? "-" : `${formatNumber(data?.btcDominance, 2)}%`, pct: null },
    { label: "FNG", value: degraded.has("alternative") || !data?.fng ? "-" : `${data.fng.value} ${data.fng.classification}`, pct: null },
    { label: "ETH Gas", value: degraded.has("etherscan") ? "-" : `${formatNumber(data?.ethGas, 0)} gwei`, pct: null }
  ];

  return (
    <div className="border-b border-app-line bg-[#141414]">
      {envelope?.meta.state === "stale" ? <div className="mx-auto max-w-7xl px-4 pt-2"><StaleBanner state="stale" /></div> : null}
      <div className="mx-auto flex max-w-7xl gap-3 overflow-hidden px-4 py-2 font-mono text-xs">
        <div className="flex min-w-max animate-[marquee_38s_linear_infinite] gap-3">
          {[...items, ...items].map((item, index) => {
            const pct = item.pct == null ? null : formatPct(item.pct);
            return (
              <span key={`${item.label}-${index}`} className="shrink-0 rounded border border-app-line px-2 py-1 text-app-muted">
                <span className="text-app-fg">{item.label}</span>: {item.value}
                {pct ? <span className={`ml-1 ${pct.className}`}>{pct.text}</span> : null}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}

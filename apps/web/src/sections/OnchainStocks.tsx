import { useState } from "react";
import { SectionLayout } from "../components/SectionLayout";
import { useDashboardQuery } from "../hooks/useDashboardQuery";
import { formatMoney, formatPct, formatPercent } from "../lib/format";

const issuers = [["all", "全部"], ["xstocks", "xStocks"], ["ondo", "Ondo"], ["backed", "Backed"]] as const;
const categories = ["七姐妹", "加密概念股", "半导体", "ETF", "其他个股"] as const;

interface OnchainStockItem {
  symbol: string;
  issuer: string;
  chain: string;
  contract: string;
  category: string;
  price: number | null;
  change24h: number | null;
  confidence: number | null;
  ts: number | null;
}

export default function OnchainStocks() {
  const [issuer, setIssuer] = useState<(typeof issuers)[number][0]>("all");
  const [category, setCategory] = useState<(typeof categories)[number]>("七姐妹");
  const path = `/api/onchain-stocks?issuer=${issuer}&category=${encodeURIComponent(category)}`;
  const query = useDashboardQuery<OnchainStockItem[]>("onchain-stocks", path);
  const rows = query.envelope?.data ?? [];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {issuers.map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setIssuer(id)}
            className={`rounded-full border px-3 py-1 text-xs ${issuer === id ? "border-app-fg bg-app-fg text-app-bg" : "border-app-line text-app-muted"}`}
          >
            {label}
          </button>
        ))}
      </div>
      <SectionLayout title="链上美股" envelope={query.envelope} isLoading={query.isLoading} error={query.error} empty={rows.length === 0}>
        <div className="flex gap-2 overflow-x-auto">
          {categories.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setCategory(item)}
              className={`shrink-0 rounded-full border px-3 py-1 text-xs ${category === item ? "border-app-fg bg-app-fg text-app-bg" : "border-app-line text-app-muted"}`}
            >
              {item}
            </button>
          ))}
        </div>
        <div className="max-h-[620px] overflow-auto rounded-lg border border-app-line bg-app-panel">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="sticky top-0 bg-app-panel font-mono text-xs uppercase text-app-muted">
              <tr>
                {["rank", "symbol", "issuer", "category", "price", "24h%", "confidence"].map((header) => (
                  <th key={header} className="border-b border-app-line px-3 py-2">{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((item, index) => {
                const pct = formatPct(item.change24h);
                return (
                  <tr key={`${item.chain}:${item.contract}`} className="border-b border-app-line/70 hover:bg-white/5">
                    <td className="px-3 py-2 font-mono text-app-muted">{index + 1}</td>
                    <td className="px-3 py-2 font-mono text-app-fg">{item.symbol}</td>
                    <td className="px-3 py-2">
                      <span className="rounded border border-app-line px-2 py-1 text-xs text-app-fg">{item.issuer}</span>
                    </td>
                    <td className="px-3 py-2 text-app-muted">{item.category}</td>
                    <td className="px-3 py-2 font-mono">{formatMoney(item.price)}</td>
                    <td className={`px-3 py-2 font-mono ${pct.className}`}>{pct.text}</td>
                    <td className={`px-3 py-2 font-mono ${confidenceClass(item.confidence)}`}>{formatPercent(item.confidence == null ? null : item.confidence * 100)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SectionLayout>
    </div>
  );
}

function confidenceClass(value: number | null) {
  if (value == null || Number.isNaN(value)) return "text-app-muted";
  if (value >= 0.9) return "text-emerald-400";
  if (value >= 0.5) return "text-amber-300";
  return "text-red-400";
}

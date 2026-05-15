import { AlertTriangle } from "lucide-react";
import { useState } from "react";
import { Badge } from "../components/Badge";
import { SectionLayout } from "../components/SectionLayout";
import { useDashboardQuery } from "../hooks/useDashboardQuery";
import { formatNumber, formatTvl } from "../lib/format";

const chains = ["all", "ethereum", "solana", "base", "arbitrum", "bsc", "polygon", "optimism"] as const;
const sorts = [["tvl", "TVL"], ["apr", "APR"]] as const;
const limits = [10, 30, 50, 100, 200] as const;

interface LiquidityPoolItem {
  pool: string;
  project: string;
  chain: string;
  symbol: string;
  tvlUsd: number;
  apy: number | null;
  apyBase: number | null;
  apyReward: number | null;
  exposure: string;
}

export default function LiquidityPools() {
  const [chain, setChain] = useState<(typeof chains)[number]>("all");
  const [sort, setSort] = useState<(typeof sorts)[number][0]>("tvl");
  const [limit, setLimit] = useState<(typeof limits)[number]>(30);
  const query = useDashboardQuery<LiquidityPoolItem[]>("liquidity-pools", `/api/liquidity-pools?chain=${chain}&sort=${sort}&limit=${limit}`);
  const rows = query.envelope?.data ?? [];

  return (
    <SectionLayout title="流动性池子" envelope={query.envelope} isLoading={query.isLoading} error={query.error} empty={rows.length === 0}>
      <div className="flex flex-wrap justify-between gap-3">
        <div className="flex gap-2 overflow-x-auto">{chains.map((item) => <button key={item} type="button" onClick={() => setChain(item)} className={`shrink-0 rounded-full border px-3 py-1 text-xs ${chain === item ? "border-app-fg bg-app-fg text-app-bg" : "border-app-line text-app-muted"}`}>{item}</button>)}</div>
        <div className="flex gap-2">{sorts.map(([id, label]) => <button key={id} type="button" onClick={() => setSort(id)} className={`rounded border px-3 py-2 text-sm ${sort === id ? "border-app-fg bg-app-fg text-app-bg" : "border-app-line text-app-fg"}`}>{label}</button>)}<select value={limit} onChange={(event) => setLimit(Number(event.target.value) as typeof limit)} className="rounded border border-app-line bg-app-panel px-3 py-2 text-sm">{limits.map((item) => <option key={item} value={item}>{item}</option>)}</select></div>
      </div>
      <div className="overflow-auto rounded-lg border border-app-line bg-app-panel">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="sticky top-0 bg-app-panel font-mono text-xs text-app-muted"><tr>{["rank", "project / symbol", "chain", "TVL", "24h vol", "APY", "base", "reward"].map((h) => <th key={h} className="border-b border-app-line px-3 py-2">{h}</th>)}</tr></thead>
          <tbody>{rows.map((item, index) => (
            <tr key={item.pool} className="border-b border-app-line/70 hover:bg-white/5">
              <td className="px-3 py-2 font-mono">{index + 1}</td>
              <td className="px-3 py-2"><div className="flex items-center gap-2">{item.exposure === "multi" ? <AlertTriangle className="h-4 w-4 text-amber-300" aria-label="impermanent loss risk" /> : null}<span>{item.project}</span></div><div className="font-mono text-xs text-app-muted">{item.symbol}</div></td>
              <td className="px-3 py-2"><Badge>{item.chain}</Badge></td>
              <td className="px-3 py-2 font-mono">{formatTvl(item.tvlUsd)}</td>
              <td className="px-3 py-2 text-app-muted">—</td>
              <td className="px-3 py-2 font-mono text-emerald-400">{formatNumber(item.apy)}%</td>
              <td className="px-3 py-2 font-mono">{formatNumber(item.apyBase)}%</td>
              <td className="px-3 py-2 font-mono">{formatNumber(item.apyReward)}%</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </SectionLayout>
  );
}

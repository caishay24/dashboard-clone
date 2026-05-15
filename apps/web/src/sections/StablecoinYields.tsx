import { useState } from "react";
import { SectionLayout } from "../components/SectionLayout";
import { useDashboardQuery } from "../hooks/useDashboardQuery";
import { formatNumber, formatTvl } from "../lib/format";

const assets = [["USDT", "USDT"], ["USDC", "USDC"], ["DAI", "DAI"], ["all", "全部"]] as const;

interface StablecoinYieldItem {
  pool: string;
  project: string;
  symbol: string;
  tvlUsd: number;
  apy: number | null;
  apyBase: number | null;
  apyReward: number | null;
}

export default function StablecoinYields() {
  const [asset, setAsset] = useState<(typeof assets)[number][0]>("USDT");
  const query = useDashboardQuery<StablecoinYieldItem[]>("stablecoin-yields", `/api/stablecoin-yields?asset=${asset}&limit=50`);
  const rows = query.envelope?.data ?? [];
  return (
    <SectionLayout title="稳定币收益榜" envelope={query.envelope} isLoading={query.isLoading} error={query.error} empty={rows.length === 0}>
      <div className="flex gap-2 overflow-x-auto">
        {assets.map(([id, label]) => <button key={id} type="button" onClick={() => setAsset(id)} className={`shrink-0 rounded border px-3 py-2 text-sm ${asset === id ? "border-app-fg bg-app-fg text-app-bg" : "border-app-line text-app-fg"}`}>{label}</button>)}
      </div>
      <div className="overflow-auto rounded-lg border border-app-line bg-app-panel">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="sticky top-0 bg-app-panel font-mono text-xs text-app-muted"><tr>{["rank", "project", "symbol", "TVL", "APY", "base", "reward"].map((h) => <th key={h} className="border-b border-app-line px-3 py-2">{h}</th>)}</tr></thead>
          <tbody>{rows.map((item, index) => (
            <tr key={item.pool} className="border-b border-app-line/70 hover:bg-white/5">
              <td className="px-3 py-2 font-mono">{index + 1}</td>
              <td className="px-3 py-2">{item.project}</td>
              <td className="px-3 py-2 font-mono">{item.symbol}</td>
              <td className="px-3 py-2 font-mono">{formatTvl(item.tvlUsd)}</td>
              <td className={`px-3 py-2 font-mono ${(item.apy ?? 0) > 5 ? "text-emerald-400" : ""}`}>{formatNumber(item.apy)}%</td>
              <td className="px-3 py-2 font-mono">{formatNumber(item.apyBase)}%</td>
              <td className="px-3 py-2 font-mono">{formatNumber(item.apyReward)}%</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </SectionLayout>
  );
}

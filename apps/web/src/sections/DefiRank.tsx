import { useState } from "react";
import { Badge } from "../components/Badge";
import { SectionLayout } from "../components/SectionLayout";
import { useDashboardQuery } from "../hooks/useDashboardQuery";
import { formatPct, formatTvl } from "../lib/format";

const sorts = [["tvl", "TVL"], ["fees", "Fees"], ["volume", "Volume"]] as const;
const limits = [10, 30, 50, 100] as const;

interface DefiRankItem {
  name: string;
  slug: string;
  category: string | null;
  logo: string | null;
  tvl: number | null;
  change1d: number | null;
  change7d: number | null;
  fees24h: number | null;
  fees7d: number | null;
}

export default function DefiRank() {
  const [sort, setSort] = useState<(typeof sorts)[number][0]>("tvl");
  const [limit, setLimit] = useState<(typeof limits)[number]>(30);
  const query = useDashboardQuery<DefiRankItem[]>("defi-rank", `/api/defi-rank?sort=${sort}&limit=${limit}`);
  const rows = query.envelope?.data ?? [];
  return (
    <SectionLayout title="DeFi 协议榜" envelope={query.envelope} isLoading={query.isLoading} error={query.error} empty={rows.length === 0}>
      <div className="flex flex-wrap justify-between gap-3">
        <div className="flex gap-2">{sorts.map(([id, label]) => <button key={id} type="button" onClick={() => setSort(id)} className={`rounded border px-3 py-2 text-sm ${sort === id ? "border-app-fg bg-app-fg text-app-bg" : "border-app-line text-app-fg"}`}>{label}</button>)}</div>
        <select value={limit} onChange={(event) => setLimit(Number(event.target.value) as typeof limit)} className="rounded border border-app-line bg-app-panel px-3 py-2 text-sm">{limits.map((item) => <option key={item} value={item}>{item}</option>)}</select>
      </div>
      <div className="overflow-auto rounded-lg border border-app-line bg-app-panel">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="sticky top-0 bg-app-panel font-mono text-xs text-app-muted"><tr>{["rank", "logo", "name", "symbol", "category", "TVL", "1d", "7d", "fees24h", "fees7d"].map((h) => <th key={h} className="border-b border-app-line px-3 py-2">{h}</th>)}</tr></thead>
          <tbody>{rows.map((item, index) => {
            const one = formatPct(item.change1d);
            const seven = formatPct(item.change7d);
            return <tr key={item.slug} className="border-b border-app-line/70 hover:bg-white/5">
              <td className="px-3 py-2 font-mono">{index + 1}</td>
              <td className="px-3 py-2">{item.logo ? <img src={item.logo} alt="" className="h-6 w-6 rounded-full" /> : "—"}</td>
              <td className="px-3 py-2">{item.name}</td>
              <td className="px-3 py-2 font-mono">{item.slug}</td>
              <td className="px-3 py-2">{item.category ? <Badge>{item.category}</Badge> : "—"}</td>
              <td className="px-3 py-2 font-mono">{formatTvl(item.tvl)}</td>
              <td className={`px-3 py-2 font-mono ${one.className}`}>{one.text}</td>
              <td className={`px-3 py-2 font-mono ${seven.className}`}>{seven.text}</td>
              <td className="px-3 py-2 font-mono">{formatTvl(item.fees24h)}</td>
              <td className="px-3 py-2 font-mono">{formatTvl(item.fees7d)}</td>
            </tr>;
          })}</tbody>
        </table>
      </div>
    </SectionLayout>
  );
}

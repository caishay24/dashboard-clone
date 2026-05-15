import { useState } from "react";
import { SectionLayout } from "../components/SectionLayout";
import { useDashboardQuery } from "../hooks/useDashboardQuery";
import { formatNumber, formatPct } from "../lib/format";

const regions = [["us", "美股"], ["cn", "A股"], ["hk", "港股"]] as const;

interface StockItem {
  code: string;
  name_cn: string;
  sector: string;
  price: number | null;
  change_pct: number | null;
  change_abs: number | null;
  high: number | null;
  low: number | null;
  prev_close: number | null;
  volume: number | null;
  amount: number | null;
  amplitude_pct: number | null;
}

export default function Stocks() {
  const [region, setRegion] = useState<(typeof regions)[number][0]>("us");
  const [sector, setSector] = useState("all");
  const path = `/api/stocks?region=${region}${sector === "all" ? "" : `&sector=${encodeURIComponent(sector)}`}`;
  const query = useDashboardQuery<StockItem[]>("stocks", path);
  const rows = [...(query.envelope?.data ?? [])].sort((a, b) => (b.change_pct ?? -Infinity) - (a.change_pct ?? -Infinity));
  const sectors = ["all", ...Array.from(new Set((query.envelope?.data ?? []).map((item) => item.sector).filter(Boolean)))];

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {regions.map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setRegion(id)}
            className={`rounded border px-3 py-2 text-sm ${region === id ? "border-app-fg bg-app-fg text-app-bg" : "border-app-line text-app-fg"}`}
          >
            {label}
          </button>
        ))}
      </div>
      <SectionLayout title="股票市场" envelope={query.envelope} isLoading={query.isLoading} error={query.error} empty={rows.length === 0}>
        <div className="flex gap-2 overflow-x-auto">
          {sectors.map((item) => (
            <button key={item} type="button" onClick={() => setSector(item)} className={`shrink-0 rounded-full border px-3 py-1 text-xs ${sector === item ? "border-app-fg bg-app-fg text-app-bg" : "border-app-line text-app-muted"}`}>
              {item === "all" ? "全部" : item}
            </button>
          ))}
        </div>
        <div className="max-h-[620px] overflow-auto rounded-lg border border-app-line bg-app-panel">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="sticky top-0 bg-app-panel font-mono text-xs uppercase text-app-muted">
              <tr>{["代码/名称", "现价", "涨跌%", "涨跌", "最高", "最低", "昨收", "volume", "amount", "amplitude"].map((header) => <th key={header} className="border-b border-app-line px-3 py-2">{header}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((item) => {
                const pct = formatPct(item.change_pct);
                const abs = formatPct(item.change_abs);
                return (
                  <tr key={item.code} className="border-b border-app-line/70 hover:bg-white/5">
                    <td className="px-3 py-2"><div className="font-mono text-app-fg">{item.code}</div><div className="text-xs text-app-muted">{item.name_cn}</div></td>
                    <td className="px-3 py-2 font-mono">{formatNumber(item.price)}</td>
                    <td className={`px-3 py-2 font-mono ${pct.className}`}>{pct.text}</td>
                    <td className={`px-3 py-2 font-mono ${abs.className}`}>{formatNumber(item.change_abs)}</td>
                    <td className="px-3 py-2 font-mono">{formatNumber(item.high)}</td>
                    <td className="px-3 py-2 font-mono">{formatNumber(item.low)}</td>
                    <td className="px-3 py-2 font-mono">{formatNumber(item.prev_close)}</td>
                    <td className="px-3 py-2 font-mono">{formatNumber(item.volume, 0)}</td>
                    <td className="px-3 py-2 font-mono">{formatNumber(item.amount, 0)}</td>
                    <td className="px-3 py-2 font-mono">{formatPct(item.amplitude_pct).text}</td>
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

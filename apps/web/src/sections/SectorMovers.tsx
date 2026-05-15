import { useMemo, useState } from "react";
import { Card } from "../components/Card";
import { SectionLayout } from "../components/SectionLayout";
import { useDashboardQuery } from "../hooks/useDashboardQuery";
import { formatPct, formatTvl } from "../lib/format";

interface SectorMoverItem {
  id: string;
  name: string;
  market_cap: number | null;
  market_cap_change_24h: number | null;
  volume_24h: number | null;
  top_3_coins: string[];
}

export default function SectorMovers() {
  const [mode, setMode] = useState<"up" | "down">("up");
  const query = useDashboardQuery<SectorMoverItem[]>("sector-movers", "/api/sector-movers?market=crypto");
  const items = useMemo(() => {
    const rows = [...(query.envelope?.data ?? [])];
    return rows.sort((a, b) => mode === "up"
      ? (b.market_cap_change_24h ?? -Infinity) - (a.market_cap_change_24h ?? -Infinity)
      : (a.market_cap_change_24h ?? Infinity) - (b.market_cap_change_24h ?? Infinity));
  }, [query.envelope?.data, mode]);

  return (
    <SectionLayout title="板块异动" envelope={query.envelope} isLoading={query.isLoading} error={query.error} empty={items.length === 0}>
      <div className="flex gap-2">
        {(["up", "down"] as const).map((item) => <button key={item} type="button" onClick={() => setMode(item)} className={`rounded border px-3 py-2 text-sm ${mode === item ? "border-app-fg bg-app-fg text-app-bg" : "border-app-line text-app-fg"}`}>{item === "up" ? "up extremes" : "down extremes"}</button>)}
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => {
          const pct = formatPct(item.market_cap_change_24h);
          return (
            <Card key={item.id} title={item.name}>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><div className="text-app-muted">market cap</div><div className="font-mono">{formatTvl(item.market_cap)}</div></div>
                <div><div className="text-app-muted">24h</div><div className={`font-mono ${pct.className}`}>{pct.text}</div></div>
                <div><div className="text-app-muted">volume</div><div className="font-mono">{formatTvl(item.volume_24h)}</div></div>
                <div className="flex items-end gap-1">{item.top_3_coins.slice(0, 3).map((src) => <img key={src} src={src} alt="" className="h-6 w-6 rounded-full" />)}</div>
              </div>
            </Card>
          );
        })}
      </div>
    </SectionLayout>
  );
}

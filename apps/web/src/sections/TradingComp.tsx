import { useState } from "react";
import { Badge } from "../components/Badge";
import { Card } from "../components/Card";
import { SectionLayout } from "../components/SectionLayout";
import { useDashboardQuery } from "../hooks/useDashboardQuery";
import { formatRelativeTime } from "../lib/format";

const exchanges = [["okx", "OKX 糖果"], ["bitget", "Bitget"], ["gate", "Gate"], ["bybit", "Bybit"]] as const;

interface TradingCompItem {
  title: string;
  url: string;
  annType?: string;
  pTime: number | null;
  source: "okx-official" | "chaincatcher";
}

export default function TradingComp() {
  const [exchange, setExchange] = useState<(typeof exchanges)[number][0]>("okx");
  const query = useDashboardQuery<TradingCompItem[]>("trading-comp", `/api/trading-comp?exchange=${exchange}`);
  const items = query.envelope?.data ?? [];

  return (
    <SectionLayout title="交易赛" envelope={query.envelope} isLoading={query.isLoading} error={query.error}>
      <div className="flex gap-2 overflow-x-auto">
        {exchanges.map(([id, label]) => (
          <button key={id} type="button" onClick={() => setExchange(id)} className={`shrink-0 rounded border px-3 py-2 text-sm ${exchange === id ? "border-app-fg bg-app-fg text-app-bg" : "border-app-line text-app-fg"}`}>{label}</button>
        ))}
      </div>
      {items.length === 0 ? <Card><p className="text-sm text-app-muted">No recent activity for {exchange}</p></Card> : (
        <div className="grid gap-3 md:grid-cols-2">
          {items.map((item) => (
            <Card key={`${item.source}-${item.url}`} title={<a href={item.url} target="_blank" rel="noopener noreferrer" className="hover:underline">{item.title}</a>}>
              <div className="flex flex-wrap gap-2">
                <Badge>{item.annType ?? "activity"}</Badge>
                <Badge>{item.pTime ? formatRelativeTime(new Date(item.pTime)) : "近期"}</Badge>
                <Badge>{item.source}</Badge>
              </div>
            </Card>
          ))}
        </div>
      )}
    </SectionLayout>
  );
}

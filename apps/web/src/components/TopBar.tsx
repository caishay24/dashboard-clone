import { PriceTicker } from "./PriceTicker";

export const activeSections = [
  ["stocks", "股票市场"],
  ["trading-comp", "交易赛"],
  ["market-analysis", "行情解析"],
  ["defi-rank", "DeFi 协议榜"],
  ["liquidity-pools", "流动性池子"],
  ["sector-movers", "板块异动"],
  ["onchain-stocks", "链上美股"],
  ["stablecoin-yields", "稳定币收益榜"],
  ["github-repos", "GitHub 库"]
] as const;

const disabledSections = ["NFT", "空投", "期权", "桥流量", "融资", "宏观", "Gas", "CEX 储备", "告警"];

export function TopBar({ active, onSelect }: { active: string; onSelect: (id: string) => void }) {
  return (
    <header className="sticky top-0 z-10 border-b border-app-line bg-app-bg/95 backdrop-blur">
      <PriceTicker />
      <nav className="mx-auto flex max-w-7xl gap-2 overflow-x-auto px-4 py-3">
        {activeSections.map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => onSelect(id)}
            className={`shrink-0 rounded border px-3 py-2 text-sm ${active === id ? "border-app-fg bg-app-fg text-app-bg" : "border-app-line text-app-fg hover:border-app-muted"}`}
          >
            {label}
          </button>
        ))}
        {disabledSections.map((label) => (
          <button
            key={label}
            type="button"
            disabled
            title="coming soon"
            className="shrink-0 rounded border border-app-line px-3 py-2 text-sm text-app-muted opacity-45"
          >
            {label}
          </button>
        ))}
      </nav>
    </header>
  );
}

import { useEffect, useMemo, useState } from "react";
import { TopBar, activeSections } from "./components/TopBar";
import Stocks from "./sections/Stocks";
import TradingComp from "./sections/TradingComp";
import MarketAnalysis from "./sections/MarketAnalysis";
import DefiRank from "./sections/DefiRank";
import LiquidityPools from "./sections/LiquidityPools";
import SectorMovers from "./sections/SectorMovers";
import OnchainStocks from "./sections/OnchainStocks";
import StablecoinYields from "./sections/StablecoinYields";
import GithubRepos from "./sections/GithubRepos";

const components: Record<string, () => JSX.Element> = {
  stocks: Stocks,
  "trading-comp": TradingComp,
  "market-analysis": MarketAnalysis,
  "defi-rank": DefiRank,
  "liquidity-pools": LiquidityPools,
  "sector-movers": SectorMovers,
  "onchain-stocks": OnchainStocks,
  "stablecoin-yields": StablecoinYields,
  "github-repos": GithubRepos
};

function currentHash() {
  const id = window.location.hash.replace(/^#\/?/, "");
  return id in components ? id : "github-repos";
}

export default function App() {
  const [active, setActive] = useState(currentHash);
  const label = useMemo(() => activeSections.find(([id]) => id === active)?.[1] ?? "", [active]);
  const Section = components[active] ?? GithubRepos;

  useEffect(() => {
    const onHashChange = () => setActive(currentHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const select = (id: string) => {
    window.location.hash = id;
    setActive(id);
  };

  return (
    <div className="min-h-screen bg-app-bg font-sans text-app-fg">
      <TopBar active={active} onSelect={select} />
      <main className="mx-auto max-w-7xl px-4 py-6">
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <h1 className="text-2xl font-black">{label}</h1>
          <span className="font-mono text-xs text-app-muted">#{active}</span>
        </div>
        <Section />
      </main>
    </div>
  );
}

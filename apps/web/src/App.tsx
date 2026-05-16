import { useEffect, useMemo, useState } from "react";
import { TopBar, activeSections } from "./components/TopBar";
import Stocks from "./sections/Stocks";
import StockDetail from "./sections/StockDetail";
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

interface ParsedHash {
  section: string;
  path: string | null; // sub-path after the section, e.g. "1.600519" for "#stocks/1.600519"
}

function parseHash(): ParsedHash {
  const raw = window.location.hash.replace(/^#\/?/, "");
  const idx = raw.indexOf("/");
  if (idx > 0) {
    const section = raw.slice(0, idx);
    const path = raw.slice(idx + 1);
    if (section in components && path) return { section, path };
  }
  const section = raw in components ? raw : "github-repos";
  return { section, path: null };
}

export default function App() {
  const [hash, setHash] = useState<ParsedHash>(parseHash);
  const { section, path } = hash;
  const label = useMemo(() => activeSections.find(([id]) => id === section)?.[1] ?? "", [section]);
  const Section = components[section] ?? GithubRepos;

  useEffect(() => {
    const onHashChange = () => setHash(parseHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const select = (id: string) => {
    window.location.hash = id;
    setHash({ section: id, path: null });
  };

  // Special case: stock detail page rendered under #stocks/<secid>
  const renderingDetail = section === "stocks" && path !== null;

  return (
    <div className="min-h-screen bg-app-bg font-sans text-app-fg">
      <TopBar active={section} onSelect={select} />
      <main className="mx-auto max-w-7xl px-4 py-6">
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <h1 className="text-2xl font-black">{renderingDetail ? "个股详情" : label}</h1>
          <span className="font-mono text-xs text-app-muted">
            #{renderingDetail ? `${section}/${path}` : section}
          </span>
        </div>
        {renderingDetail ? <StockDetail secid={path!} /> : <Section />}
      </main>
    </div>
  );
}

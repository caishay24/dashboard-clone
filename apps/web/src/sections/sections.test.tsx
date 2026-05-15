import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PriceTicker } from "../components/PriceTicker";
import DefiRank from "./DefiRank";
import GithubRepos from "./GithubRepos";
import LiquidityPools from "./LiquidityPools";
import MarketAnalysis from "./MarketAnalysis";
import OnchainStocks from "./OnchainStocks";
import SectorMovers from "./SectorMovers";
import StablecoinYields from "./StablecoinYields";
import Stocks from "./Stocks";
import TradingComp from "./TradingComp";
import type { DashboardEnvelope } from "../hooks/useDashboardQuery";

const useDashboardQuery = vi.fn();

afterEach(() => {
  cleanup();
  useDashboardQuery.mockReset();
});

vi.mock("../hooks/useDashboardQuery", () => ({
  useDashboardQuery: (...args: unknown[]) => useDashboardQuery(...args)
}));

function envelope<T>(data: T): DashboardEnvelope<T> {
  return {
    data,
    meta: { state: "fresh", fetchedAt: "2026-05-15T00:00:00.000Z", expiresAt: "2026-05-15T00:01:00.000Z" },
    error: null
  };
}

function mockData<T>(data: T) {
  useDashboardQuery.mockReturnValue({ envelope: envelope(data), isLoading: false, error: null });
}

describe("dashboard sections", () => {
  it("renders PriceTicker data", () => {
    mockData({ crypto: [{ symbol: "BTCUSDT", price: 100, changePct: 1 }], indices: [{ name: "标普500", code: "SPX", price: 5000, changePct: -1 }], totalMcap: 2_000_000_000_000, btcDominance: 50, fng: { value: 70, classification: "Greed" }, ethGas: 12 });
    render(<PriceTicker />);
    expect(screen.getAllByText("BTC")[0]).toBeInTheDocument();
    expect(screen.getAllByText("FNG")[0]).toBeInTheDocument();
  });

  it("renders Stocks", () => {
    mockData([{ code: "AAPL", name_cn: "苹果", sector: "科技", price: 200, change_pct: 1, change_abs: 2, high: 210, low: 190, prev_close: 198, volume: 1000, amount: 2000, amplitude_pct: 3 }]);
    render(<Stocks />);
    expect(screen.getByText("苹果")).toBeInTheDocument();
  });

  it("renders TradingComp", () => {
    mockData([{ title: "OKX listing", url: "https://example.com", annType: "listing", pTime: Date.now(), source: "okx-official" }]);
    render(<TradingComp />);
    expect(screen.getByText("OKX listing")).toBeInTheDocument();
  });

  it("renders MarketAnalysis", () => {
    mockData({ symbol: "BTCUSDT", interval: "1h", klines: [{ close: 1 }, { close: 2 }], indicators: { ma5: [2], ma20: [1], ma60: [1], boll: { upper: [3], middle: [2], lower: [1] }, rsi: [72], macd: { macd: [1], signal: [0.5], histogram: [0.5] } } });
    render(<MarketAnalysis />);
    expect(screen.getByText("MA5>MA20 多头排列 / RSI 超买")).toBeInTheDocument();
  });

  it("renders DefiRank", () => {
    mockData([{ name: "Uniswap", slug: "uniswap", category: "Dexes", logo: null, tvl: 1_000_000, change1d: 1, change7d: -1, fees24h: null, fees7d: 10 }]);
    render(<DefiRank />);
    expect(screen.getByText("Uniswap")).toBeInTheDocument();
  });

  it("renders LiquidityPools", () => {
    mockData([{ pool: "1", project: "Aave", chain: "Ethereum", symbol: "USDC", tvlUsd: 1_000_000, apy: 5, apyBase: 4, apyReward: 1, exposure: "single" }]);
    render(<LiquidityPools />);
    expect(screen.getByText("Aave")).toBeInTheDocument();
  });

  it("renders SectorMovers", () => {
    mockData([{ id: "ai", name: "AI", market_cap: 1_000_000, market_cap_change_24h: 4, volume_24h: 100_000, top_3_coins: [] }]);
    render(<SectorMovers />);
    expect(screen.getByText("AI")).toBeInTheDocument();
  });

  it("renders OnchainStocks data", () => {
    mockData([{ symbol: "AAPLON", issuer: "Ondo", chain: "solana", contract: "token", category: "七姐妹", price: 200, change24h: -1.2, confidence: 0.95, ts: 1765238400 }]);
    render(<OnchainStocks />);
    expect(screen.getByText("AAPLON")).toBeInTheDocument();
    expect(screen.getByText("95.00%")).toBeInTheDocument();
  });

  it("renders StablecoinYields", () => {
    mockData([{ pool: "1", project: "Curve", symbol: "USDT", tvlUsd: 1_000_000, apy: 6, apyBase: 4, apyReward: 2 }]);
    render(<StablecoinYields />);
    expect(screen.getByText("Curve")).toBeInTheDocument();
  });

  it("renders GithubRepos", () => {
    mockData([{ repo: "openai/openai-node", category: "AI", description: "SDK", tags: ["sdk"], language: "TypeScript", stargazers_count: 195000, pushed_at: "2026-05-12T00:00:00Z", html_url: "https://github.com/openai/openai-node" }]);
    render(<GithubRepos />);
    expect(screen.getByText("openai/openai-node")).toBeInTheDocument();
  });
});

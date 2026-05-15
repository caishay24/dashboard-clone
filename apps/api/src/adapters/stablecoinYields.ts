import { fetchYieldPools } from "../lib/defillama";
import type { LiquidityPoolItem } from "./liquidityPools";

export type StablecoinYieldAsset = "USDT" | "USDC" | "DAI" | "all";

export async function getStablecoinYields(params: {
  asset: StablecoinYieldAsset;
  limit: number;
}) {
  const pools = await fetchYieldPools();

  return pools
    .filter((pool) => pool.stablecoin && pool.exposure === "single")
    .filter((pool) => params.asset === "all" || poolHasAsset(pool.symbol, params.asset))
    .map<LiquidityPoolItem>((pool) => ({
      pool: pool.pool,
      project: pool.project,
      chain: pool.chain,
      symbol: pool.symbol,
      tvlUsd: pool.tvlUsd,
      apy: pool.apy ?? null,
      apyBase: pool.apyBase ?? null,
      apyReward: pool.apyReward ?? null,
      stablecoin: pool.stablecoin,
      exposure: pool.exposure,
      poolMeta: pool.poolMeta ?? null
    }))
    .sort((a, b) => b.tvlUsd - a.tvlUsd)
    .slice(0, params.limit);
}

function poolHasAsset(symbol: string, asset: Exclude<StablecoinYieldAsset, "all">) {
  return symbol.toUpperCase().split(/[^A-Z0-9]+/).includes(asset);
}

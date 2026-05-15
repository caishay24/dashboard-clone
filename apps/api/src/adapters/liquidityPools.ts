import { fetchYieldPools } from "../lib/defillama";

export type LiquidityPoolsSort = "tvl" | "apr";

export interface LiquidityPoolItem {
  pool: string;
  project: string;
  chain: string;
  symbol: string;
  tvlUsd: number;
  apy: number | null;
  apyBase: number | null;
  apyReward: number | null;
  stablecoin: boolean;
  exposure: string;
  poolMeta: string | null;
}

export async function getLiquidityPools(params: {
  chain: string;
  sort: LiquidityPoolsSort;
  limit: number;
}) {
  const chain = params.chain.toLowerCase();
  const pools = await fetchYieldPools();

  return pools
    .filter((pool) => chain === "all" || pool.chain.toLowerCase() === chain)
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
    .sort((a, b) => sortValue(b, params.sort) - sortValue(a, params.sort))
    .slice(0, params.limit);
}

function sortValue(item: LiquidityPoolItem, sort: LiquidityPoolsSort) {
  if (sort === "apr") return item.apy ?? 0;
  return item.tvlUsd;
}

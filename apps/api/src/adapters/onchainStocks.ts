import type { TokenAllowlistItem } from "@dashboard/shared";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validateTokenAllowlist } from "../schemas";
import { fetchCoinPercentages, fetchCoinPrices } from "../lib/defillama";

export interface OnchainStockItem {
  symbol: string;
  issuer: string;
  chain: string;
  contract: string;
  category: string;
  price: number | null;
  change24h: number | null;
  confidence: number | null;
  ts: number | null;
}

export interface OnchainStocksResult {
  data: OnchainStockItem[];
  degraded: string[];
}

const allowlist = validateTokenAllowlist(JSON.parse(
  readFileSync(resolve(import.meta.dirname, "../token-allowlist.json"), "utf8")
));

export async function getOnchainStocks(params: { issuer?: string; category?: string }): Promise<OnchainStocksResult> {
  const selected = filterAllowlist(params);
  const keys = selected.map(coinKey);
  const [prices, changes] = await Promise.all([
    fetchCoinPrices(keys),
    fetchCoinPercentages(keys, "24h")
  ]);

  const degraded: string[] = [];
  const data = selected.map((item) => {
    const key = coinKey(item);
    const price = prices[key];
    if (!price || price.price == null) degraded.push(item.symbol);

    return {
      symbol: item.symbol,
      issuer: item.issuer,
      chain: item.chain,
      contract: item.contract,
      category: item.category,
      price: price?.price ?? null,
      change24h: changes[key] ?? null,
      confidence: price?.confidence ?? null,
      ts: price?.timestamp ?? null
    };
  });

  return {
    data: data.sort((a, b) => (b.price ?? -Infinity) - (a.price ?? -Infinity)),
    degraded
  };
}

function filterAllowlist(params: { issuer?: string; category?: string }) {
  const issuer = (params.issuer ?? "all").toLowerCase();
  return allowlist.filter((item) => {
    const issuerMatches = issuer === "all" || item.issuer.toLowerCase() === issuer;
    const categoryMatches = !params.category || item.category === params.category;
    return issuerMatches && categoryMatches;
  });
}

function coinKey(item: TokenAllowlistItem) {
  return `${item.chain}:${item.contract}`;
}

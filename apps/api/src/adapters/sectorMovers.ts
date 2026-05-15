import { z } from "zod";
import { countCoinGeckoAttempt, isCoinGeckoStaleOnly } from "../cgBudget";
import { fetchWithRetry } from "../fetchWithRetry";

const categorySchema = z.object({
  id: z.string(),
  name: z.string(),
  market_cap: z.number().nullable(),
  market_cap_change_24h: z.number().nullable(),
  volume_24h: z.number().nullable(),
  top_3_coins: z.array(z.string())
}).passthrough();

export type SectorMoverItem = z.infer<typeof categorySchema>;

export async function getSectorMovers(params: { market: "crypto"; category?: string }) {
  if (params.market !== "crypto") throw new Error("unsupported market");
  if (await isCoinGeckoStaleOnly()) throw new Error("CoinGecko budget exceeded");

  const response = await fetchWithRetry("https://api.coingecko.com/api/v3/coins/categories");
  if (!response.ok) throw new Error(`CoinGecko categories HTTP ${response.status}`);
  await countCoinGeckoAttempt(1);

  const categories = z.array(categorySchema).parse(await response.json());
  const selected = params.category
    ? categories.filter((category) => category.id === params.category)
    : categories.sort((a, b) => (b.market_cap ?? 0) - (a.market_cap ?? 0)).slice(0, 30);

  return selected.map((category) => ({
    id: category.id,
    name: category.name,
    market_cap: category.market_cap,
    market_cap_change_24h: category.market_cap_change_24h,
    volume_24h: category.volume_24h,
    top_3_coins: category.top_3_coins
  }));
}

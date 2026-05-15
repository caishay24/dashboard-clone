import { z } from "zod";
import { fetchWithRetry } from "../fetchWithRetry";

const DEFILLAMA_API = "https://api.llama.fi";
const DEFILLAMA_YIELDS_API = "https://yields.llama.fi";
const DEFILLAMA_COINS_API = "https://coins.llama.fi";
const MAX_COINS_URL_LENGTH = 1500;

const nullableNumberSchema = z.number().nullable().optional();

const protocolSchema = z.object({
  name: z.string(),
  slug: z.string(),
  category: z.string().nullable().optional(),
  chains: z.array(z.string()).optional(),
  logo: z.string().nullable().optional(),
  tvl: z.number().nullable().optional(),
  change_1d: nullableNumberSchema,
  change_7d: nullableNumberSchema,
  mcap: nullableNumberSchema,
  volume_1d: nullableNumberSchema
}).passthrough();

const protocolsResponseSchema = z.array(protocolSchema);

const feesProtocolSchema = z.object({
  name: z.string(),
  slug: z.string(),
  total24h: nullableNumberSchema,
  total7d: nullableNumberSchema,
  total30d: nullableNumberSchema
}).passthrough();

const feesOverviewResponseSchema = z.object({
  protocols: z.array(feesProtocolSchema)
}).passthrough();

const yieldPoolSchema = z.object({
  chain: z.string(),
  project: z.string(),
  symbol: z.string(),
  tvlUsd: z.number(),
  apy: nullableNumberSchema,
  apyBase: nullableNumberSchema,
  apyReward: nullableNumberSchema,
  pool: z.string(),
  stablecoin: z.boolean(),
  exposure: z.string(),
  poolMeta: z.string().nullable().optional()
}).passthrough();

const yieldPoolsResponseSchema = z.object({
  data: z.array(yieldPoolSchema)
}).passthrough();

const chainSchema = z.object({
  gecko_id: z.string().nullable().optional(),
  tvl: z.number().nullable().optional(),
  tokenSymbol: z.string().nullable().optional(),
  name: z.string()
}).passthrough();

const coinPriceSchema = z.object({
  symbol: z.string().nullable().optional(),
  price: z.number().nullable().optional(),
  decimals: z.number().nullable().optional(),
  confidence: z.number().nullable().optional(),
  timestamp: z.number().nullable().optional()
}).passthrough();

const coinPricesResponseSchema = z.object({
  coins: z.record(coinPriceSchema)
}).passthrough();

const coinPercentageResponseSchema = z.object({
  coins: z.record(z.number())
}).passthrough();

export type DefiLlamaProtocol = z.infer<typeof protocolSchema>;
export type DefiLlamaFeesProtocol = z.infer<typeof feesProtocolSchema>;
export type DefiLlamaYieldPool = z.infer<typeof yieldPoolSchema>;
export type DefiLlamaCoinPrice = z.infer<typeof coinPriceSchema>;

export async function fetchProtocols() {
  return getJson(`${DEFILLAMA_API}/protocols`, protocolsResponseSchema);
}

export async function fetchFeesOverview() {
  return getJson(`${DEFILLAMA_API}/overview/fees`, feesOverviewResponseSchema);
}

export async function fetchYieldPools() {
  const response = await getJson(`${DEFILLAMA_YIELDS_API}/pools`, yieldPoolsResponseSchema);
  return response.data;
}

export async function fetchChains() {
  return getJson(`${DEFILLAMA_API}/v2/chains`, z.array(chainSchema));
}

export async function fetchCoinPrices(keys: string[]) {
  const batches = buildCoinBatches(keys, "/prices/current/");
  const responses = await Promise.all(
    batches.map((batch) => getJson(`${DEFILLAMA_COINS_API}/prices/current/${batch.join(",")}`, coinPricesResponseSchema))
  );
  return Object.assign({}, ...responses.map((response) => response.coins)) as Record<string, DefiLlamaCoinPrice>;
}

export async function fetchCoinPercentages(keys: string[], period = "24h") {
  const batches = buildCoinBatches(keys, `/percentage/`, `?period=${period}`);
  const responses = await Promise.all(
    batches.map((batch) => getJson(`${DEFILLAMA_COINS_API}/percentage/${batch.join(",")}?period=${period}`, coinPercentageResponseSchema))
  );
  return Object.assign({}, ...responses.map((response) => response.coins)) as Record<string, number>;
}

function buildCoinBatches(keys: string[], pathPrefix: string, query = "") {
  if (keys.length === 0) return [];
  const fullUrl = `${DEFILLAMA_COINS_API}${pathPrefix}${keys.join(",")}${query}`;
  if (fullUrl.length <= MAX_COINS_URL_LENGTH) return [keys];

  const byChain = new Map<string, string[]>();
  for (const key of keys) {
    const chain = key.split(":", 1)[0];
    byChain.set(chain, [...(byChain.get(chain) ?? []), key]);
  }

  const batches: string[][] = [];
  for (const chainKeys of byChain.values()) {
    let batch: string[] = [];
    for (const key of chainKeys) {
      const candidate = [...batch, key];
      const candidateUrl = `${DEFILLAMA_COINS_API}${pathPrefix}${candidate.join(",")}${query}`;
      if (batch.length > 0 && candidateUrl.length > MAX_COINS_URL_LENGTH) {
        batches.push(batch);
        batch = [key];
      } else {
        batch = candidate;
      }
    }
    if (batch.length > 0) batches.push(batch);
  }
  return batches;
}

async function getJson<T extends z.ZodTypeAny>(url: string, schema: T): Promise<z.infer<T>> {
  const response = await fetchWithRetry(url);
  if (!response.ok) {
    throw new Error(`DefiLlama HTTP ${response.status}`);
  }
  return schema.parse(await response.json());
}

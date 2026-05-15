import { fetchFeesOverview, fetchProtocols } from "../lib/defillama";

export type DefiRankSort = "tvl" | "fees" | "volume";

export interface DefiRankItem {
  name: string;
  slug: string;
  category: string | null;
  chains: string[];
  logo: string | null;
  tvl: number | null;
  change1d: number | null;
  change7d: number | null;
  fees24h: number | null;
  fees7d: number | null;
  fees30d: number | null;
  volume24h: number | null;
}

export async function getDefiRank(params: { sort: DefiRankSort; limit: number }) {
  const [protocols, feesOverview] = await Promise.all([
    fetchProtocols(),
    fetchFeesOverview()
  ]);
  const feesBySlug = new Map(feesOverview.protocols.map((protocol) => [protocol.slug, protocol]));

  return protocols
    .map<DefiRankItem>((protocol) => {
      const fees = feesBySlug.get(protocol.slug);
      return {
        name: protocol.name,
        slug: protocol.slug,
        category: protocol.category ?? null,
        chains: protocol.chains ?? [],
        logo: protocol.logo ?? null,
        tvl: protocol.tvl ?? null,
        change1d: protocol.change_1d ?? null,
        change7d: protocol.change_7d ?? null,
        fees24h: fees?.total24h ?? null,
        fees7d: fees?.total7d ?? null,
        fees30d: fees?.total30d ?? null,
        volume24h: protocol.volume_1d ?? null
      };
    })
    .sort((a, b) => sortValue(b, params.sort) - sortValue(a, params.sort))
    .slice(0, params.limit);
}

function sortValue(item: DefiRankItem, sort: DefiRankSort) {
  if (sort === "fees") return item.fees24h ?? 0;
  if (sort === "volume") return item.volume24h ?? 0;
  return item.tvl ?? 0;
}
